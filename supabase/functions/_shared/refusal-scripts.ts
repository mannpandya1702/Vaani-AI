// _shared/refusal-scripts.ts
// ╔════════════════════════════════════════════════════════════════╗
// ║  HARDCODED REFUSAL SCRIPTS — never go through the LLM.          ║
// ║                                                                 ║
// ║  Anand §10 + Aanya §10/11/12: Four statutory categories where   ║
// ║  AI must refuse with VERBATIM verbiage:                         ║
// ║    1. PCPNDT — foetal sex disclosure (criminal, 3yr + ₹10k)     ║
// ║    2. MHCA   — suicidal ideation → Tele-MANAS 14416 mandatory   ║
// ║    3. POCSO  — child sexual abuse disclosure (mandatory report) ║
// ║    4. DRUG_RX — patient asks "which medicine" (TPG ¶3.7.1)      ║
// ║                                                                 ║
// ║  This module:                                                   ║
// ║   - exposes `checkRefusal(text, lang)` for pre-LLM intercept    ║
// ║   - returns verbatim TTS scripts in patient's language          ║
// ║   - returns the helpline numbers to surface                     ║
// ║   - returns the refusal_log category to write                   ║
// ╚════════════════════════════════════════════════════════════════╝

export type RefusalCategory =
  | 'pcpndt_foetal_sex'
  | 'mhca_suicidal_ideation'
  | 'pocso_csa_disclosure'
  | 'drug_prescription_attempt';

export interface RefusalMatch {
  category: RefusalCategory;
  matched_phrase_redacted: string;  // safe to log
  script_hi: string;
  script_ta: string;
  script_en: string;
  helplines: string[];
  required_followup: 'tele_manas_14416' | 'childline_1098_sjpu' | 'pcpndt_compliance_log' | 'mo_only_drug_cockpit';
  /** Hardcoded scripts NEVER vary by LLM — index for evidence. */
  script_id: string;
}

const TRIGGERS: Record<RefusalCategory, RegExp[]> = {
  pcpndt_foetal_sex: [
    /\b(beta|ladka|ladki|girl|boy)\b.{0,30}\b(garbh|pregnan|fetus|baby|peit|kokh)\b/i,
    /\b(garbh|pregnan|fetus|baby|peit|kokh)\b.{0,30}\b(beta|ladka|ladki|girl|boy)\b/i,
    /\bsex.{0,15}determ/i,
    /\b(foetal|fetal|gender).{0,15}(test|determ|reveal|know)/i,
    /लड़का.{0,20}लड़की/,
    /लड़की.{0,20}लड़का/,
    /गर्भ.{0,15}लिंग/,
    /ஆண்.{0,20}பெண்/,
    /பெண்.{0,20}ஆண்/,
  ],
  // NOTE: JS \b is ASCII-only — it does NOT mark a boundary before/after
  // Devanagari/Tamil glyphs, so \b-wrapped Indic alternatives never match.
  // Deepgram returns Devanagari, so Indic terms are split into their OWN
  // \b-free patterns below (romanized/English keep \b to avoid sub-word FPs).
  mhca_suicidal_ideation: [
    /\b(suicide|suicidal|kill myself|end my life|end it all|don'?t want to live|want to die)\b/i,
    /\b(jaan dena|jaan dene|marne ka man|marna chahta|marna chahti|khatam kar|khud ko khatam|aatmahatya)\b/i,
    /(आत्महत्या|ख़ुदकुशी|खुदकुशी|जीना नहीं चाह|जीने का मन नहीं|मरना चाहत|मर जाऊँ|मर जाऊं|जान दे ?दूँ|जान देने|खुद को ख़त्म|खुद को खत्म|खुद को मार|खुद को नुकसान)/u,
    /(தற்கொலை|சாக.{0,10}வேண்டும்|உயிர்.{0,15}மாய)/u,
  ],
  pocso_csa_disclosure: [
    // Patient must be <18 — caller layer must gate before calling
    /\b(bachcha|bachchi|child|kid)\b.{0,40}\b(abuse|touch|molest|hurt)/i,
    /(बच्चा|बच्ची|बच्चे|குழந்தை).{0,40}(दुर्व्यवहार|गलत तरीके|गलत काम|हाथ लगा|छेड़|गुप्तांग|बुरी नीयत|தீங்கு|abuse|touch|molest)/u,
    /\b(chacha|mama|uncle|teacher|cousin)\b.{0,40}(galat tarike|haath laga|touched|hit|kissed)/i,
    /(काका|मामा|चाचा|अंकल|टीचर|मास्टर).{0,40}(गलत तरीके|गलत काम|हाथ लगा|छेड़|छुआ)/u,
    /(touch.{0,15}private|private.{0,15}touch|niji.{0,15}ang)/i,
    /(गुप्तांग|निजी अंग|छिपा.{0,10}अंग).{0,15}(छुआ|हाथ|छेड़|touch)/u,
  ],
  drug_prescription_attempt: [
    // Patient asking WHICH medicine / to prescribe — refuse + route to MO.
    // Devanagari patterns are specific (require an ask/prescribe verb) so
    // ordinary clinical talk ("मैंने दवा ली थी") does NOT false-trigger.
    /\b(which|what|kaunsi|konsi)\b.{0,20}(medicine|tablet|dawa|dawai|pill)/i,
    /\b(prescribe|prescription|likhd?o|likh kar|nuska)\b/i,
    /(कौन ?सी|कौनसी)\s{0,3}(दवा|दवाई|गोली|टैबलेट)/u,
    /(दवा|दवाई|गोली|टैबलेट)\s{0,6}(लिख ?दीज|लिख ?दो|लिख ?देना|बता ?दीज|बता ?दो|दे ?दीज|दे ?दो|सुझा)/u,
    /(कोई)\s{0,3}(दवा|दवाई|गोली|टैबलेट)\s{0,6}(लिख|बता|दे|सुझा)/u,
  ],
};

const SCRIPTS: Record<RefusalCategory, Omit<RefusalMatch, 'category' | 'matched_phrase_redacted'>> = {
  pcpndt_foetal_sex: {
    script_id: 'refusal_pcpndt_v1',
    script_hi:
      'PCPNDT कानून के तहत हम गर्भ में बच्चे के लिंग की जानकारी न दे सकते हैं, न लेने में मदद कर सकते हैं। यह कानूनन अपराध है।',
    script_ta:
      'PCPNDT சட்டத்தின் கீழ், கருவில் உள்ள குழந்தையின் பாலினம் பற்றி எங்களால் சொல்ல முடியாது. இது குற்றம்.',
    script_en:
      'Under the PCPNDT Act, we cannot disclose or assist in determining the sex of a foetus. It is a criminal offence.',
    helplines: [],
    required_followup: 'pcpndt_compliance_log',
  },
  mhca_suicidal_ideation: {
    // v2 (2026-06-26): per 9-dim board audit §3:
    //  - removed feminine "जोड़ रही हूँ" / "இணைக்கிறேன்" (Vaani is gender-neutral)
    //  - 14416 now leads the script and is UNCONDITIONAL ("अभी डायल कीजिए"),
    //    not "ज़रूरत हो तो" — MHCA s.18 mandates immediate referral
    //  - call number spoken in words too ("चौदह चार सौ सोलह") so Sarvam/
    //    ElevenLabs TTS reads it as a phone number, not digits
    //  - removed "जोड़ रहे हैं" promise of mid-call transfer (architecture
    //    moved to cockpit handoff)
    script_id: 'refusal_mhca_v2',
    script_hi:
      'यह बात बहुत ज़रूरी है जी। Tele-MANAS पर मदद मिलेगी — चौदह चार सौ सोलह — 14416 — अभी फ़ोन कीजिए। डॉक्टर साहब आपकी रिपोर्ट तुरंत देख रहे हैं।',
    script_ta:
      'இது மிக முக்கியம். டெலி-மானஸ் 14416-க்கு உடனே அழைக்கவும். டாக்டர் உங்கள் அறிக்கையை இப்போதே பார்க்கிறார்.',
    script_en:
      'This matters a lot. Call Tele-MANAS 14416 now — that is one-four-four-one-six. The doctor is reviewing your report right now.',
    helplines: ['Tele-MANAS 14416', 'iCall 9152987821', 'Vandrevala 1860-2662-345', 'NIMHANS 080-46110007'],
    required_followup: 'tele_manas_14416',
  },
  pocso_csa_disclosure: {
    script_id: 'refusal_pocso_v1',
    script_hi:
      'आपने जो बताया है वो बहुत ज़रूरी है। हम बच्चे की सुरक्षा के लिए तुरंत मदद भेज रहे हैं। चाइल्डलाइन 1098 भी 24 घंटे उपलब्ध है।',
    script_ta:
      'நீங்கள் சொன்னது மிக முக்கியம். குழந்தையின் பாதுகாப்பிற்காக உடனடியாக உதவியை அனுப்புகிறோம். சைல்ட்லைன் 1098 24 மணி நேரமும் கிடைக்கும்.',
    script_en:
      'What you shared is important. We are arranging immediate help for the child\'s safety. Childline 1098 is available 24/7.',
    helplines: ['Childline 1098', 'CHILDLINE India: 1098'],
    required_followup: 'childline_1098_sjpu',
  },
  drug_prescription_attempt: {
    script_id: 'refusal_drug_rx_v1',
    script_hi:
      'दवा की सलाह यहाँ से नहीं दी जा सकती। डॉक्टर साहब आपकी जानकारी देखकर पर्ची भेजेंगे।',
    script_ta:
      'என்னால் மருந்து பரிந்துரைக்க முடியாது. டாக்டர் உங்கள் தகவலைப் பார்த்து மருந்துச் சீட்டை அனுப்புவார்.',
    script_en:
      'I cannot suggest medicines. The doctor will review your information and send you a prescription.',
    helplines: [],
    required_followup: 'mo_only_drug_cockpit',
  },
};

/**
 * Detect if `text` triggers any hardcoded refusal.
 * Returns null if no trigger — caller proceeds normally.
 * MUST be called BEFORE the PII redactor / Claude.
 */
export function checkRefusal(text: string, patientAgeYears?: number | null): RefusalMatch | null {
  const normalized = text.toLowerCase().normalize('NFKD');

  for (const cat of Object.keys(TRIGGERS) as RefusalCategory[]) {
    // POCSO is only valid when patient is a minor
    if (cat === 'pocso_csa_disclosure') {
      if (!patientAgeYears || patientAgeYears >= 18) continue;
    }
    for (const pattern of TRIGGERS[cat]) {
      const match = normalized.match(pattern);
      if (match) {
        return {
          category: cat,
          matched_phrase_redacted: redactForLog(match[0]),
          ...SCRIPTS[cat],
        };
      }
    }
  }
  return null;
}

/** Get the verbatim script in the patient's language. */
export function scriptForLang(match: RefusalMatch, lang: string): string {
  switch (lang) {
    case 'hi': return match.script_hi;
    case 'ta': return match.script_ta;
    case 'en': return match.script_en;
    default: return match.script_hi; // fallback Hindi for V1
  }
}

/** Redact PII-ish content from the matched phrase before logging. */
function redactForLog(s: string): string {
  return s
    .replace(/[6-9]\d{9}/g, '[PHONE]')
    .replace(/\d{2}-?\d{4}-?\d{4}-?\d{4}/g, '[ABHA]')
    .slice(0, 200);
}
