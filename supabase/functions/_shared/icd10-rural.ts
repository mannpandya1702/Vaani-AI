// _shared/icd10-rural.ts
// ╔════════════════════════════════════════════════════════════════╗
// ║  Curated ICD-10 catalogue for rural-India primary care.         ║
// ║                                                                 ║
// ║  Why a curated subset, not the full ~70k WHO ICD-10 tree:       ║
// ║   - soap-generate forces Claude to emit icd10_codes via tool-   ║
// ║     use. Without a constrained vocabulary the model invents     ║
// ║     plausible-looking but invalid codes (e.g. "J45.901"). That  ║
// ║     fails the eSanjeevani / ABDM coded-field requirement AND    ║
// ║     pollutes the MO chart.                                       ║
// ║   - The ~150 codes below cover the chief complaints that        ║
// ║     actually present at an ASHA-mediated rural screening:       ║
// ║     the 16 red-flag categories + the common GREEN/AMBER tail.   ║
// ║                                                                 ║
// ║  Codes are WHO ICD-10 (category / sub-category level) so they   ║
// ║  are valid in the Indian ICD-10 adoption, not ICD-10-CM-only.   ║
// ║                                                                 ║
// ║  Usage:                                                         ║
// ║   - ICD10_CATALOGUE_PROMPT  → inject into the SOAP system prompt║
// ║   - validateIcd10(codes)    → drop anything off-catalogue       ║
// ║   - icd10Title(code)        → human-readable label for cockpit  ║
// ║                                                                 ║
// ║  Mirror copy for the frontend cockpit: src/lib/icd10-rural.ts   ║
// ║  (keep the two in sync — same code→title map).                  ║
// ╚════════════════════════════════════════════════════════════════╝

export interface Icd10Entry {
  code: string;
  title: string;
  // Maps to the red-flag category vocabulary in red-flag-check where relevant.
  group: string;
}

export const ICD10_RURAL: Icd10Entry[] = [
  // ── Cardiovascular ────────────────────────────────────────────
  { code: 'I20.0', title: 'Unstable angina', group: 'cardiac' },
  { code: 'I20.9', title: 'Angina pectoris, unspecified', group: 'cardiac' },
  { code: 'I21.9', title: 'Acute myocardial infarction, unspecified', group: 'cardiac' },
  { code: 'I21.3', title: 'ST-elevation myocardial infarction (STEMI)', group: 'cardiac' },
  { code: 'I50.9', title: 'Heart failure, unspecified', group: 'cardiac' },
  { code: 'I10', title: 'Essential (primary) hypertension', group: 'cardiac' },
  { code: 'I48.9', title: 'Atrial fibrillation and flutter, unspecified', group: 'cardiac' },
  { code: 'I26.9', title: 'Pulmonary embolism without acute cor pulmonale', group: 'cardiac' },
  { code: 'I71.0', title: 'Dissection of aorta', group: 'cardiac' },
  { code: 'I80.2', title: 'Phlebitis/thrombophlebitis of lower extremity (DVT)', group: 'cardiac' },
  { code: 'R07.4', title: 'Chest pain, unspecified', group: 'cardiac' },
  { code: 'R00.0', title: 'Tachycardia, unspecified', group: 'cardiac' },
  { code: 'R57.0', title: 'Cardiogenic shock', group: 'cardiac' },

  // ── Respiratory ───────────────────────────────────────────────
  { code: 'J06.9', title: 'Acute upper respiratory infection, unspecified', group: 'respiratory' },
  { code: 'J00', title: 'Acute nasopharyngitis (common cold)', group: 'respiratory' },
  { code: 'J02.9', title: 'Acute pharyngitis, unspecified', group: 'respiratory' },
  { code: 'J03.9', title: 'Acute tonsillitis, unspecified', group: 'respiratory' },
  { code: 'J20.9', title: 'Acute bronchitis, unspecified', group: 'respiratory' },
  { code: 'J18.9', title: 'Pneumonia, unspecified organism', group: 'respiratory' },
  { code: 'J22', title: 'Unspecified acute lower respiratory infection', group: 'respiratory' },
  { code: 'J44.9', title: 'Chronic obstructive pulmonary disease (COPD)', group: 'respiratory' },
  { code: 'J44.1', title: 'COPD with acute exacerbation', group: 'respiratory' },
  { code: 'J45.9', title: 'Asthma, unspecified', group: 'respiratory' },
  { code: 'J46', title: 'Status asthmaticus (acute severe asthma)', group: 'respiratory' },
  { code: 'J81', title: 'Pulmonary oedema', group: 'respiratory' },
  { code: 'J93.9', title: 'Pneumothorax, unspecified', group: 'respiratory' },
  { code: 'R04.2', title: 'Haemoptysis', group: 'hemoptysis' },
  { code: 'R06.0', title: 'Dyspnoea (breathlessness)', group: 'respiratory' },
  { code: 'R05', title: 'Cough', group: 'respiratory' },

  // ── Tuberculosis & chronic infection ──────────────────────────
  { code: 'A15.0', title: 'Tuberculosis of lung, confirmed', group: 'hemoptysis' },
  { code: 'A16.2', title: 'Tuberculosis of lung, without confirmation', group: 'hemoptysis' },
  { code: 'A15.9', title: 'Respiratory tuberculosis, unspecified', group: 'hemoptysis' },

  // ── Neurological / stroke ─────────────────────────────────────
  { code: 'I63.9', title: 'Cerebral infarction, unspecified (ischaemic stroke)', group: 'stroke_befast' },
  { code: 'I61.9', title: 'Intracerebral haemorrhage, unspecified', group: 'stroke_befast' },
  { code: 'I64', title: 'Stroke, not specified as haemorrhage or infarction', group: 'stroke_befast' },
  { code: 'G45.9', title: 'Transient cerebral ischaemic attack (TIA)', group: 'stroke_befast' },
  { code: 'G40.9', title: 'Epilepsy, unspecified', group: 'neuro' },
  { code: 'G41.9', title: 'Status epilepticus, unspecified', group: 'neuro' },
  { code: 'R56.8', title: 'Other and unspecified convulsions', group: 'neuro' },
  { code: 'G03.9', title: 'Meningitis, unspecified', group: 'neuro' },
  { code: 'G04.9', title: 'Encephalitis, myelitis, unspecified', group: 'neuro' },
  { code: 'R51', title: 'Headache', group: 'neuro' },
  { code: 'R55', title: 'Syncope and collapse', group: 'neuro' },
  { code: 'R42', title: 'Dizziness and giddiness', group: 'neuro' },
  { code: 'R40.2', title: 'Coma, unspecified', group: 'neuro' },

  // ── Obstetric / maternal ──────────────────────────────────────
  { code: 'O14.9', title: 'Pre-eclampsia, unspecified', group: 'preeclampsia_eclampsia' },
  { code: 'O15.9', title: 'Eclampsia, unspecified as to time period', group: 'preeclampsia_eclampsia' },
  { code: 'O13', title: 'Gestational hypertension', group: 'preeclampsia_eclampsia' },
  { code: 'O20.0', title: 'Threatened abortion', group: 'obstetric' },
  { code: 'O46.9', title: 'Antepartum haemorrhage, unspecified', group: 'obstetric' },
  { code: 'O72.1', title: 'Other immediate postpartum haemorrhage', group: 'obstetric' },
  { code: 'O21.0', title: 'Mild hyperemesis gravidarum', group: 'obstetric' },
  { code: 'O23.4', title: 'Unspecified genitourinary tract infection in pregnancy', group: 'obstetric' },
  { code: 'O26.9', title: 'Pregnancy-related condition, unspecified', group: 'obstetric' },
  { code: 'Z34.9', title: 'Supervision of normal pregnancy, unspecified', group: 'obstetric' },
  { code: 'Z33.1', title: 'Pregnant state, incidental', group: 'obstetric' },

  // ── Paediatric danger signs / neonatal ────────────────────────
  { code: 'J21.9', title: 'Acute bronchiolitis, unspecified', group: 'peds_danger' },
  { code: 'P36.9', title: 'Bacterial sepsis of newborn, unspecified', group: 'peds_danger' },
  { code: 'A41.9', title: 'Sepsis, unspecified organism', group: 'sepsis' },
  { code: 'R65.2', title: 'Severe sepsis', group: 'sepsis' },
  { code: 'E86.0', title: 'Dehydration', group: 'dehydration_severe' },
  { code: 'E86.1', title: 'Hypovolaemia', group: 'dehydration_severe' },
  { code: 'R62.5', title: 'Failure to thrive / lack of expected development', group: 'peds_danger' },
  { code: 'E43', title: 'Severe protein-energy malnutrition, unspecified', group: 'peds_danger' },
  { code: 'E41', title: 'Nutritional marasmus', group: 'peds_danger' },
  { code: 'E40', title: 'Kwashiorkor', group: 'peds_danger' },

  // ── Fever / infectious (vector & water borne) ─────────────────
  { code: 'R50.9', title: 'Fever, unspecified', group: 'fever_high_risk' },
  { code: 'A90', title: 'Dengue fever (classical)', group: 'fever_high_risk' },
  { code: 'A91', title: 'Dengue haemorrhagic fever', group: 'fever_high_risk' },
  { code: 'B54', title: 'Unspecified malaria', group: 'fever_high_risk' },
  { code: 'B50.9', title: 'Plasmodium falciparum malaria, unspecified', group: 'fever_high_risk' },
  { code: 'A01.0', title: 'Typhoid fever', group: 'fever_high_risk' },
  { code: 'A75.9', title: 'Typhus fever, unspecified (scrub typhus)', group: 'fever_high_risk' },
  { code: 'A27.9', title: 'Leptospirosis, unspecified', group: 'fever_high_risk' },
  { code: 'B01.9', title: 'Varicella (chickenpox) without complication', group: 'fever_high_risk' },
  { code: 'B05.9', title: 'Measles without complication', group: 'fever_high_risk' },
  { code: 'A37.9', title: 'Whooping cough, unspecified species', group: 'peds_danger' },
  { code: 'A35', title: 'Other tetanus', group: 'envenomation' },

  // ── Gastro-intestinal ─────────────────────────────────────────
  { code: 'A09', title: 'Diarrhoea & gastroenteritis, presumed infectious', group: 'gi_acute' },
  { code: 'A09.0', title: 'Other and unspecified gastroenteritis/colitis, infectious', group: 'gi_acute' },
  { code: 'K59.1', title: 'Functional diarrhoea', group: 'gi_acute' },
  { code: 'A03.9', title: 'Shigellosis, unspecified', group: 'gi_acute' },
  { code: 'A00.9', title: 'Cholera, unspecified', group: 'gi_acute' },
  { code: 'K35.8', title: 'Acute appendicitis, other and unspecified', group: 'gi_acute' },
  { code: 'K35.2', title: 'Acute appendicitis with generalized peritonitis', group: 'gi_acute' },
  { code: 'K65.0', title: 'Acute peritonitis', group: 'gi_acute' },
  { code: 'K25.9', title: 'Gastric ulcer, unspecified', group: 'gi_acute' },
  { code: 'K27.9', title: 'Peptic ulcer, site unspecified', group: 'gi_acute' },
  { code: 'K92.2', title: 'Gastrointestinal haemorrhage, unspecified', group: 'gi_acute' },
  { code: 'K80.2', title: 'Calculus of gallbladder without cholecystitis', group: 'gi_acute' },
  { code: 'K81.0', title: 'Acute cholecystitis', group: 'gi_acute' },
  { code: 'K85.9', title: 'Acute pancreatitis, unspecified', group: 'gi_acute' },
  { code: 'K56.6', title: 'Intestinal obstruction, other and unspecified', group: 'gi_acute' },
  { code: 'R10.0', title: 'Acute abdomen', group: 'gi_acute' },
  { code: 'R10.4', title: 'Other and unspecified abdominal pain', group: 'gi_acute' },
  { code: 'R11', title: 'Nausea and vomiting', group: 'gi_acute' },
  { code: 'B82.9', title: 'Intestinal parasitism, unspecified', group: 'gi_acute' },
  { code: 'B15.9', title: 'Acute hepatitis A without hepatic coma', group: 'gi_acute' },

  // ── Metabolic / endocrine ─────────────────────────────────────
  { code: 'E11.9', title: 'Type 2 diabetes mellitus without complications', group: 'metabolic_acute' },
  { code: 'E10.1', title: 'Type 1 diabetes mellitus with ketoacidosis', group: 'metabolic_acute' },
  { code: 'E14.1', title: 'Unspecified diabetes mellitus with ketoacidosis (DKA)', group: 'metabolic_acute' },
  { code: 'E16.2', title: 'Hypoglycaemia, unspecified', group: 'metabolic_acute' },
  { code: 'E87.6', title: 'Hypokalaemia', group: 'metabolic_acute' },
  { code: 'E05.9', title: 'Thyrotoxicosis, unspecified', group: 'metabolic_acute' },
  { code: 'E03.9', title: 'Hypothyroidism, unspecified', group: 'metabolic_acute' },
  { code: 'D50.9', title: 'Iron deficiency anaemia, unspecified', group: 'metabolic_acute' },
  { code: 'D64.9', title: 'Anaemia, unspecified', group: 'metabolic_acute' },

  // ── Envenomation / animal exposure / poisoning ────────────────
  { code: 'T63.0', title: 'Toxic effect of snake venom', group: 'envenomation' },
  { code: 'T63.3', title: 'Toxic effect of spider venom', group: 'envenomation' },
  { code: 'T63.4', title: 'Toxic effect of venom of other arthropod (scorpion)', group: 'envenomation' },
  { code: 'W59', title: 'Bitten or crushed by other reptiles', group: 'envenomation' },
  { code: 'Z20.3', title: 'Contact with/exposure to rabies', group: 'rabies_exposure' },
  { code: 'W54', title: 'Bitten or struck by dog', group: 'rabies_exposure' },
  { code: 'A82.9', title: 'Rabies, unspecified', group: 'rabies_exposure' },
  { code: 'T60.9', title: 'Toxic effect of pesticide, unspecified (OP poisoning)', group: 'metabolic_acute' },
  { code: 'T65.9', title: 'Toxic effect of unspecified substance', group: 'metabolic_acute' },
  { code: 'X68', title: 'Intentional self-poisoning by pesticides', group: 'mental_health' },

  // ── Mental health ─────────────────────────────────────────────
  { code: 'F32.9', title: 'Depressive episode, unspecified', group: 'mental_health' },
  { code: 'F41.9', title: 'Anxiety disorder, unspecified', group: 'mental_health' },
  { code: 'F43.1', title: 'Post-traumatic stress disorder', group: 'mental_health' },
  { code: 'R45.851', title: 'Suicidal ideation', group: 'mental_health' },
  { code: 'F20.9', title: 'Schizophrenia, unspecified', group: 'mental_health' },
  { code: 'F10.9', title: 'Mental/behavioural disorder due to alcohol use', group: 'mental_health' },
  { code: 'F99', title: 'Mental disorder, not otherwise specified', group: 'mental_health' },

  // ── Burns / trauma / injury ───────────────────────────────────
  { code: 'T30.0', title: 'Burn of unspecified body region, unspecified degree', group: 'burns' },
  { code: 'T31.0', title: 'Burns involving less than 10% of body surface', group: 'burns' },
  { code: 'T31.2', title: 'Burns involving 20-29% of body surface', group: 'burns' },
  { code: 'T07', title: 'Unspecified multiple injuries', group: 'trauma' },
  { code: 'S06.9', title: 'Intracranial injury, unspecified (head injury)', group: 'trauma' },
  { code: 'S72.9', title: 'Fracture of femur, part unspecified', group: 'trauma' },
  { code: 'T14.9', title: 'Injury, unspecified', group: 'trauma' },
  { code: 'W19', title: 'Unspecified fall', group: 'trauma' },
  { code: 'V89.2', title: 'Person injured in motor-vehicle accident', group: 'trauma' },
  { code: 'T79.4', title: 'Traumatic shock', group: 'trauma' },

  // ── Genitourinary ─────────────────────────────────────────────
  { code: 'N39.0', title: 'Urinary tract infection, site not specified', group: 'fever_high_risk' },
  { code: 'N10', title: 'Acute tubulo-interstitial nephritis (acute pyelonephritis)', group: 'fever_high_risk' },
  { code: 'N23', title: 'Unspecified renal colic', group: 'gi_acute' },
  { code: 'N17.9', title: 'Acute kidney failure, unspecified', group: 'metabolic_acute' },

  // ── Skin / ENT / eye / musculoskeletal (the GREEN/AMBER tail) ──
  { code: 'L03.9', title: 'Cellulitis, unspecified', group: 'fever_high_risk' },
  { code: 'L08.9', title: 'Local infection of skin/subcutaneous tissue, unspecified', group: 'other' },
  { code: 'B35.9', title: 'Dermatophytosis (fungal skin infection), unspecified', group: 'other' },
  { code: 'L30.9', title: 'Dermatitis, unspecified', group: 'other' },
  { code: 'H66.9', title: 'Otitis media, unspecified', group: 'other' },
  { code: 'H10.9', title: 'Conjunctivitis, unspecified', group: 'other' },
  { code: 'H57.1', title: 'Ocular pain', group: 'other' },
  { code: 'M54.5', title: 'Low back pain', group: 'other' },
  { code: 'M79.1', title: 'Myalgia', group: 'other' },
  { code: 'M25.5', title: 'Pain in joint', group: 'other' },
  { code: 'K08.9', title: 'Disorder of teeth and supporting structures (toothache)', group: 'other' },
  { code: 'R21', title: 'Rash and other nonspecific skin eruption', group: 'other' },
  { code: 'R53', title: 'Malaise and fatigue', group: 'other' },
  { code: 'Z00.0', title: 'General adult medical examination', group: 'other' },
  { code: 'Z71.9', title: 'Counselling, unspecified', group: 'other' },
];

// Fast lookup map (code → title). Built once at module load.
const TITLE_BY_CODE: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const e of ICD10_RURAL) m[e.code.toUpperCase()] = e.title;
  return m;
})();

const VALID_CODES = new Set(Object.keys(TITLE_BY_CODE));

/**
 * Human-readable title for a catalogue code, or null if off-catalogue.
 */
export function icd10Title(code: string): string | null {
  return TITLE_BY_CODE[(code ?? '').trim().toUpperCase()] ?? null;
}

/**
 * Filter an LLM-emitted code list down to the curated catalogue.
 * Returns the in-catalogue codes (normalised + de-duped, original order) and
 * the ones we dropped so the caller can log the hallucination rate.
 */
export function validateIcd10(codes: unknown): { valid: string[]; dropped: string[] } {
  const valid: string[] = [];
  const dropped: string[] = [];
  const seen = new Set<string>();
  if (!Array.isArray(codes)) return { valid, dropped };
  for (const raw of codes) {
    const code = String(raw ?? '').trim().toUpperCase();
    if (!code) continue;
    if (VALID_CODES.has(code)) {
      if (!seen.has(code)) { seen.add(code); valid.push(code); }
    } else {
      dropped.push(code);
    }
  }
  return { valid, dropped };
}

/**
 * Compact catalogue listing for injection into the SOAP system prompt.
 * Grouped by clinical system so the model can scan to the relevant block.
 */
export const ICD10_CATALOGUE_PROMPT: string = (() => {
  const byGroup = new Map<string, Icd10Entry[]>();
  for (const e of ICD10_RURAL) {
    const arr = byGroup.get(e.group) ?? [];
    arr.push(e);
    byGroup.set(e.group, arr);
  }
  let out = '';
  for (const [group, entries] of byGroup) {
    out += `\n[${group}] ` + entries.map((e) => `${e.code}=${e.title}`).join('; ');
  }
  return out.trim();
})();
