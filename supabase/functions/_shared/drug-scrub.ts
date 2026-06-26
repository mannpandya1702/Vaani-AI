// _shared/drug-scrub.ts
// ╔════════════════════════════════════════════════════════════════╗
// ║  Drug-name scrubber for patient-facing surfaces.                 ║
// ║                                                                 ║
// ║  Anand red-line #1: no drug names spoken to / shown to the     ║
// ║  patient. Used by vaani-signoff before reading soap.plan to    ║
// ║  TTS, and by anywhere else that renders patient-facing copy.   ║
// ║                                                                 ║
// ║  Strategy: regex-based denylist of common Indian primary-care   ║
// ║  formulary terms + dosage patterns. Hits get replaced with a    ║
// ║  language-appropriate "[दवाई की बात डॉक्टर साहब बताएँगे]" stub. ║
// ║                                                                 ║
// ║  Belt-and-braces: the DB also has a CHECK constraint            ║
// ║  chk_plan_no_drug_names that will reject inserts containing     ║
// ║  these patterns. This helper is the runtime safety net.         ║
// ╚════════════════════════════════════════════════════════════════╝

// Drug-name regex — denylist of common Indian primary-care formulary.
// Sourced from CDSCO drug schedule + IAP guidelines + WHO PEN. Word-
// boundary anchored so "ramping" doesn't fire on "ramipril" substring.
// Case-insensitive.
const DRUG_NAME_PATTERNS = [
  // OTC / very common
  'paracetamol', 'crocin', 'dolo', 'combiflam', 'sumo',
  'ibuprofen', 'brufen', 'flexon',
  'aspirin', 'ecosprin', 'disprin',
  'ondansetron', 'emeset',
  'domperidone', 'domstal',
  'ranitidine', 'pantoprazole', 'omeprazole', 'pan ?d',
  // Antibiotics
  'amoxicillin', 'amoxyclav', 'augmentin', 'mox',
  'azithromycin', 'azithral', 'azee',
  'cefixime', 'cefuroxime', 'cefpodoxime',
  'ciprofloxacin', 'ofloxacin', 'norflox', 'levofloxacin',
  'metronidazole', 'flagyl',
  'doxycycline', 'minocycline',
  'penicillin',
  // Antiparasitic
  'albendazole', 'mebendazole',
  'chloroquine', 'hydroxychloroquine', 'primaquine',
  'artesunate', 'artemether',
  // Cardiometabolic
  'metformin', 'glimepiride', 'sitagliptin', 'insulin',
  'amlodipine', 'telmisartan', 'losartan', 'enalapril', 'ramipril',
  'atorvastatin', 'rosuvastatin', 'simvastatin',
  'atenolol', 'metoprolol', 'bisoprolol', 'propranolol',
  'furosemide', 'lasix', 'hydrochlorothiazide',
  'clopidogrel', 'plavix',
  // Respiratory
  'salbutamol', 'asthalin', 'levosalbutamol', 'levolin',
  'budesonide', 'fluticasone', 'montelukast',
  // Mental health
  'sertraline', 'fluoxetine', 'escitalopram', 'venlafaxine',
  'alprazolam', 'clonazepam', 'diazepam', 'lorazepam',
  // Pediatric
  'syrup', 'suspension', 'drops',
  // Specific tablets / brand
  'tab\\.?', 'cap\\.?', 'inj\\.?',
];

const DOSAGE_PATTERN = '\\b\\d+(?:\\.\\d+)?\\s*(?:mg|mcg|ml|g|iu|units?)\\b';
const FREQUENCY_PATTERN = '\\b(?:BD|TDS|QID|HS|PRN|SOS|OD|q[0-9]+h)\\b';

const COMBINED_REGEX = new RegExp(
  [
    `\\b(?:${DRUG_NAME_PATTERNS.join('|')})\\b`,
    DOSAGE_PATTERN,
    FREQUENCY_PATTERN,
  ].join('|'),
  'gi',
);

const STUB_BY_LANG: Record<string, string> = {
  hi: '[दवाई की बात डॉक्टर साहब बताएँगे]',
  ta: '[மருந்து விவரம் டாக்டர் சொல்வார்]',
  en: '[the doctor will share medication details]',
};

export interface ScrubResult {
  cleaned: string;
  detections: string[];  // hits found (for audit)
  hit: boolean;
}

/**
 * Replace any drug-name / dosage / frequency mention in the given text
 * with a language-appropriate stub. Returns the cleaned text plus a
 * list of detected hits for the cross_border_transfers / audit logs.
 *
 * Idempotent on already-scrubbed text.
 */
export function scrubDrugMentions(text: string | null | undefined, lang: string = 'hi'): ScrubResult {
  if (!text) return { cleaned: '', detections: [], hit: false };
  const detections: string[] = [];
  const stub = STUB_BY_LANG[lang] ?? STUB_BY_LANG.hi;
  const cleaned = text.replace(COMBINED_REGEX, (m) => {
    detections.push(m);
    return stub;
  });
  return { cleaned, detections, hit: detections.length > 0 };
}

/**
 * Boolean — does the text contain any drug / dose / frequency token?
 * Use this for guard rails (e.g., refusing to insert a patient-facing
 * row that mentions drugs).
 */
export function containsDrugMention(text: string | null | undefined): boolean {
  if (!text) return false;
  // Re-build a single-shot regex with the `i` flag only (no `g`) so
  // .test() doesn't get caught by lastIndex statefulness.
  const single = new RegExp(
    [
      `\\b(?:${DRUG_NAME_PATTERNS.join('|')})\\b`,
      DOSAGE_PATTERN,
      FREQUENCY_PATTERN,
    ].join('|'),
    'i',
  );
  return single.test(text);
}
