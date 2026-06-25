// red-flag-check/index.ts
// ╔════════════════════════════════════════════════════════════════╗
// ║  Hardcoded Red-Flag Detector — pre-LLM safety layer.            ║
// ║                                                                 ║
// ║  Day 2 Part 1.5 fixes (Aanya §8):                               ║
// ║   - Normalize Hindi STT variants ("mein" → "me")                ║
// ║   - Negation/temporal scrub ±40 chars window                    ║
// ║   - Word-boundary regex for short phrases (≤4 chars / 1 token)  ║
// ║   - Sarvam-M v2 prompt with few-shots + per-category criteria   ║
// ║   - Output schema validation (enum-check + numeric guard)       ║
// ╚════════════════════════════════════════════════════════════════╝

import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
import { verifyBearer } from '../_shared/constant-time-compare.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { sarvamM } from '../_shared/sarvam-client.ts';

interface RedFlagHit {
  category: string;
  source: 'rule' | 'llm' | 'uncertainty_default';
  confidence: number;
  matched_phrase: string | null;
}

const KNOWN_CATEGORIES = [
  'cardiac', 'respiratory', 'hemoptysis', 'neuro', 'stroke_befast',
  'obstetric', 'preeclampsia_eclampsia', 'peds_danger', 'dehydration_severe',
  'envenomation', 'rabies_exposure', 'mental_health', 'fever_high_risk',
  'sepsis', 'gi_acute', 'metabolic_acute', 'burns', 'trauma', 'other',
] as const;

const SARVAM_M_PROMPT = `You are a clinical red-flag classifier for rural India primary care.
Given a patient utterance, return JSON: {"red_flag": boolean, "category": string, "confidence": number}.

Categories (use EXACTLY one of these strings):
cardiac, respiratory, hemoptysis, neuro, stroke_befast, obstetric, preeclampsia_eclampsia,
peds_danger, dehydration_severe, envenomation, rabies_exposure, mental_health,
fever_high_risk, sepsis, gi_acute, metabolic_acute, burns, trauma, other.

Rules:
- If confidence < 0.85, default to red_flag=true (safety-first).
- For code-switched Hindi-English (e.g. "seene mein chest pain"), classify normally.
- Negated/past tense ("vo behosh ho gaya tha bachpan mein" = "he fainted as a child") → red_flag=false.

Few-shot examples:
User: "seene mein dard ho raha hai aur paseena bhi" → {"red_flag":true,"category":"cardiac","confidence":0.95}
User: "saans nahi aa rahi, bahut takleef hai" → {"red_flag":true,"category":"respiratory","confidence":0.95}
User: "khansi mein khoon aaya aaj subah" → {"red_flag":true,"category":"hemoptysis","confidence":0.95}
User: "chehra ek taraf jhuk gaya, boli badli" → {"red_flag":true,"category":"stroke_befast","confidence":0.98}
User: "kutte ne kaata, khoon nikla" → {"red_flag":true,"category":"rabies_exposure","confidence":0.95}
User: "marne ka man kar raha hai" → {"red_flag":true,"category":"mental_health","confidence":0.95}
User: "pregnancy mein sir dard aur aankhon mein dhabbe" → {"red_flag":true,"category":"preeclampsia_eclampsia","confidence":0.95}
User: "bachcha doodh nahi pee raha do din se" → {"red_flag":true,"category":"peds_danger","confidence":0.95}
User: "halki khansi hai do din se" → {"red_flag":false,"category":"other","confidence":0.9}
User: "vo behosh ho gaya tha bachpan mein" → {"red_flag":false,"category":"other","confidence":0.9}`;

const NEGATION_TEMPORAL = /\b(nahi|nahin|not|no|never|tha|thi|the|pehle|bachpan|saal pehle|years ago|childhood|बचपन|पहले|नहीं|था|थी|थे)\b/u;

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  const masterKey = Deno.env.get('WEBHOOK_MASTER_KEY');
  if (!verifyBearer(req, masterKey)) {
    return new Response('unauthorized', { status: 401, headers: corsHeaders });
  }

  const body = await req.json().catch(() => null);
  const callId: string | undefined = body?.call_id;
  const turnId: number | undefined = body?.turn_id;
  const transcriptRaw: string = body?.transcript ?? '';
  const lang: string = body?.lang ?? 'hi';
  const patientId: string | undefined = body?.patient_id;
  const tenantId: string | undefined = body?.tenant_id;

  if (!callId || !transcriptRaw.trim()) {
    return new Response(JSON.stringify({ error: 'missing_call_id_or_transcript' }), {
      status: 400, headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }

  const sb = supabaseAdmin();
  const transcript = normalize(transcriptRaw);
  const hits: RedFlagHit[] = [];

  // ── Layer 1: Hardcoded phrase library (deterministic) ──────────
  // Migration 008 added requires_qualifier[]. A phrase fires RED only when
  // either (a) requires_qualifier is empty (unconditional — chest pain,
  // stroke, snake bite, suicidal ideation), or (b) at least one of its
  // qualifier tokens co-occurs anywhere in the transcript.
  const { data: phrases, error: phrasesErr } = await sb
    .from('v_red_flag_lookup')
    .select('category, lang, phrase, detection_method, min_confidence, requires_qualifier')
    .eq('lang', lang);

  if (phrasesErr) {
    console.error('[red-flag-check] phrases query failed', phrasesErr);
  }

  const seen = new Set<string>();
  for (const row of phrases ?? []) {
    const phrase = normalize(row.phrase);
    const match = matchPhrase(transcript, phrase, row.detection_method);
    if (!match.hit || isNegated(transcript, match.idx)) continue;
    // Qualifier gate (migration 008)
    const requires: string[] = Array.isArray(row.requires_qualifier) ? row.requires_qualifier : [];
    if (requires.length > 0 && !qualifierPresent(transcript, requires)) continue;
    const key = `${row.category}:${row.phrase}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({
      category: row.category,
      source: 'rule',
      confidence: 1.0,
      matched_phrase: row.phrase,
    });
  }

  // ── Layer 2: Sarvam-M fallback ─────────────────────────────────
  if (hits.length === 0 && transcript.split(/\s+/).length > 5) {
    try {
      const llm = await sarvamM({
        messages: [
          { role: 'system', content: SARVAM_M_PROMPT },
          { role: 'user', content: transcriptRaw },
        ],
        temperature: 0.1,
        maxTokens: 600,
        responseFormat: 'json_object',
      });
      const parsed = JSON.parse(llm.text.match(/\{[\s\S]*\}/)?.[0] ?? '{}');

      let conf = Number(parsed.confidence);
      if (!Number.isFinite(conf)) conf = 0.0;
      let category = String(parsed.category ?? 'other');
      if (!KNOWN_CATEGORIES.includes(category as any)) category = 'other';

      // Devansh §1: do NOT halt on uncertainty_default. Only halt when
      // Sarvam-M is HIGH-confidence positive AND it named a real category.
      // The previous behaviour ("conf<0.85 → push to hits") cascaded into
      // forceRedBand on every routine GREEN case, which the eval surfaced.
      if (parsed.red_flag === true && conf >= 0.85 && category !== 'other') {
        hits.push({
          category,
          source: 'llm',
          confidence: conf,
          matched_phrase: null,
        });
      }
    } catch (e) {
      console.error('[red-flag-check] sarvam-m failed', e);
      // Devansh §1 + Aanya safety review: Sarvam-M failure does NOT force
      // RED. The patient hasn't said anything our deterministic rules
      // matched, so the right behaviour is to let triage-score's Claude
      // layer make the call. Earlier "push to hits on failure" turned
      // every Sarvam-M outage into a false-positive RED — the eval
      // surfaced this as the dominant band-match failure mode.
    }
  }

  // ── Persist hits as red_flag_events (evidence) ─────────────────
  if (hits.length > 0) {
    await sb.from('red_flag_events').insert(
      hits.map((h) => ({
        call_id: callId,
        turn_id: turnId,
        patient_id: patientId,
        tenant_id: tenantId,
        category: h.category,
        source: h.source,
        confidence: h.confidence,
        matched_phrase: h.matched_phrase,
        action_taken: 'detected_pending_mo_page',
      })),
    );
  }

  return new Response(JSON.stringify({
    red_flags: hits,
    should_halt: hits.length > 0,
    transcript_chars: transcriptRaw.length,
  }), {
    status: 200,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
});

// ── Migration 008: qualifier-gate keyword bank ─────────────────
// Each qualifier label maps to a set of Devanagari / Romanized / English
// markers. When a phrase carries `requires_qualifier`, the gate fires
// only if at least one of these markers appears anywhere in the
// (normalised) transcript.
const QUALIFIER_MARKERS: Record<string, string[]> = {
  chest_pain:        ['सीने में दर्द', 'छाती में दर्द', 'दिल में दर्द', 'seenae mein dard', 'chest pain', 'chaati'],
  breath_diff:       ['साँस नहीं', 'साँस फूल', 'दम घुट', 'saans nahi', 'breathless', 'dyspnea'],
  jaw_pain:          ['जबड़े में दर्द', 'jaw pain', 'jaw'],
  diaphoresis:       ['पसीना बहुत', 'paseena bahut', 'sweating profuse'],
  speech_difficulty: ['बात नहीं', 'बात मुश्किल', 'difficulty speaking', 'unable to speak'],
  inhaler_failed:    ['इन्हेलर से फ़ायदा नहीं', 'inhaler nahi kar raha', 'inhaler not working'],
  accessory_use:     ['accessory muscle', 'मांसपेशी', 'retraction'],
  peds_under_5:      ['डेढ़ साल', 'दो साल', 'तीन साल', 'चार साल', '1 year', '2 years', '3 years', '4 years', 'months old', 'महीने'],
  no_feed:           ['दूध नहीं पी रहा', 'doodh nahi pee', 'not feeding', 'wont eat', 'खाना नहीं'],
  fever_high:        ['तेज़ बुख़ार', 'बहुत बुख़ार', 'high fever', '102', '103', '104', 'एक सौ दो', 'एक सौ तीन', 'एक सौ चार'],
  respiratory:       ['साँस', 'खाँसी', 'breathing', 'cough', 'wheeze', 'घरघराहट'],
  snake_marks:       ['साँप', 'सर्प', 'snake', 'काटा'],
  fang_marks:        ['दाँत के निशान', 'fang marks', 'two punctures', 'दो दाँत'],
  severe_pain:       ['बहुत दर्द', 'severe pain', 'तेज़ दर्द', 'unbearable pain'],
  fast_progression:  ['तेज़ी से', 'मिनट', 'fast', 'rapidly', 'minutes'],
  loc:               ['बेहोश', 'unconscious', 'loc', 'lost consciousness'],
  head_injury:       ['सिर', 'head injury', 'head trauma'],
  major_bleed:       ['खून बहुत', 'bleeding heavily', 'major bleed'],
  ams:               ['पहचान नहीं', 'भ्रम', 'confused', 'altered mental', 'AMS'],
  elderly:           ['पैंसठ', 'सत्तर', 'बहुत बूढ़े', 'पचहत्तर', 'eighty', 'seventy', '65', '70', '75', '80'],
  hypotension:       ['बहुत कम bp', 'low bp', 'hypotensive', 'fainted'],
  pregnancy:         ['गर्भ', 'pregnancy', 'pregnant', 'gestation', 'month', 'महीने का', 'सप्ताह'],
  abdominal_pain:    ['पेट में दर्द', 'पेट दर्द', 'abdominal pain', 'belly pain'],
  headache_severe:   ['सर भारी', 'सर बहुत', 'severe headache', 'सिर दर्द बहुत'],
  visual_changes:    ['धुंधला', 'blurred', 'visual change', 'धब्बे'],
  large_area:        ['बड़ी जलन', 'large burn', 'extensive', '20%', '30%'],
  face_neck:         ['चेहरा', 'गर्दन', 'face', 'neck', 'face burn'],
  airway:            ['airway', 'gasping', 'stridor', 'घरघराहट'],
  hot_liquid:        ['गरम पानी', 'गरम तेल', 'hot water', 'hot oil', 'scalding'],
  guarding:          ['guarding', 'पेट सख्त', 'rigid abdomen'],
  rigid_abdomen:     ['पेट सख्त', 'rigid abdomen', 'board-like'],
  vomiting:          ['उल्टी', 'vomiting', 'vomited'],
  fever:             ['बुख़ार', 'fever', 'temperature'],
  high_fever:        ['तेज़ बुख़ार', '102', '103', '104', 'high fever'],
  convulsion:        ['झटके', 'दौरा', 'convulsion', 'seizure', 'fits'],
  rash_petechiae:    ['rash', 'चकत्ते', 'दाने', 'petechiae'],
  duration_long:     ['एक हफ़्ता', 'सात दिन', 'दस दिन', 'week', 'many days'],
  lethargy:          ['सुस्त', 'lethargy', 'lethargic', 'drowsy'],
  hemoptysis:        ['खाँसी में खून', 'खून थूका', 'hemoptysis', 'blood in cough'],
  dyspnea:           ['साँस नहीं', 'breathless', 'dyspnea', 'sob'],
  weight_loss:       ['वज़न कम', 'weight loss', 'wasting'],
  dehydration:       ['पानी कम', 'सूखा मुँह', 'dehydration', 'dry mouth'],
  blood_in_stool:    ['खून के साथ', 'blood in stool', 'मल में खून'],
  high_volume:       ['बहुत बार', 'many times', '8 baar', '10 baar'],
  peds:              ['बच्चा', 'बच्ची', 'months', 'महीने', 'years old', 'साल का', 'baby', 'child'],
};

function qualifierPresent(transcript: string, qualifiers: string[]): boolean {
  const haystack = transcript; // already normalized by caller
  for (const q of qualifiers) {
    const markers = QUALIFIER_MARKERS[q];
    if (!markers || markers.length === 0) continue;
    for (const m of markers) {
      if (haystack.includes(normalize(m))) return true;
    }
  }
  return false;
}

// ── Aanya §8 fixes ──────────────────────────────────────────────

function normalize(t: string): string {
  return t.toLowerCase()
    .normalize('NFKD')
    .replace(/[।,.!?]/g, ' ')
    .replace(/\bmein\b/g, 'me')
    .replace(/\bnahin\b/g, 'nahi')
    .replace(/\s+/g, ' ')
    .trim();
}

function isNegated(haystack: string, phraseIdx: number): boolean {
  if (phraseIdx < 0) return false;
  // Look at ±40 chars window for negation/temporal markers
  const window = haystack.slice(Math.max(0, phraseIdx - 40), phraseIdx);
  return NEGATION_TEMPORAL.test(window);
}

function matchPhrase(
  haystack: string,
  phrase: string,
  method: string,
): { hit: boolean; idx: number } {
  const p = phrase.toLowerCase();
  // Word-boundary regex for short phrases (≤4 chars OR 1 token)
  if (p.length <= 4 || p.split(/\s+/).length === 1) {
    const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    try {
      const re = new RegExp(`(^|\\s|[।,.!?])(${escaped})($|\\s|[।,.!?])`, 'i');
      const m = haystack.match(re);
      if (m && typeof m.index === 'number') {
        // Adjust index to start of phrase, not the leading boundary
        return { hit: true, idx: m.index + m[1].length };
      }
      return { hit: false, idx: -1 };
    } catch {
      const i = haystack.indexOf(p);
      return { hit: i >= 0, idx: i };
    }
  }
  if (method === 'regex') {
    try {
      const re = new RegExp(p, 'i');
      const m = haystack.match(re);
      return { hit: !!m, idx: m?.index ?? -1 };
    } catch {
      const i = haystack.indexOf(p);
      return { hit: i >= 0, idx: i };
    }
  }
  const i = haystack.indexOf(p);
  return { hit: i >= 0, idx: i };
}
