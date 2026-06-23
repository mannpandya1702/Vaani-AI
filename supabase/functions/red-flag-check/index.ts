// red-flag-check/index.ts
// ╔════════════════════════════════════════════════════════════════╗
// ║  Hardcoded Red-Flag Detector — pre-LLM safety layer.            ║
// ║                                                                 ║
// ║  Aanya §2: ANY of 16 red flags = RED regardless of LLM verdict. ║
// ║  Runs against the v_red_flag_lookup view (138 seeded phrases    ║
// ║  across Hi/Ta/En × 16 categories), then escalates to Sarvam-M   ║
// ║  for low-confidence cases.                                      ║
// ║                                                                 ║
// ║  Input: { call_id, turn_id?, transcript, lang }                 ║
// ║  Output: { red_flags: RedFlagEvent[], should_halt: boolean }    ║
// ║                                                                 ║
// ║  Side effect: inserts rows into red_flag_events for evidence.   ║
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

const SARVAM_M_PROMPT = `You are a clinical red-flag classifier for rural India primary care.
Given a patient utterance, return JSON: {"red_flag": boolean, "category": string|null, "confidence": number}
Categories: cardiac, respiratory, neuro, obstetric, peds_danger, trauma, sepsis, mental_health, envenomation, burns, gi_acute, metabolic_acute, dehydration_severe, stroke_befast, preeclampsia_eclampsia, rabies_exposure, hemoptysis, fever_high_risk
Rules:
- If confidence < 0.85, default to red_flag=true (safety-first).
- Set red_flag=false ONLY if you are >0.85 confident the utterance is non-emergent.`;

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
  const transcript: string = body?.transcript ?? '';
  const lang: string = body?.lang ?? 'hi';
  const patientId: string | undefined = body?.patient_id;
  const tenantId: string | undefined = body?.tenant_id;

  if (!callId || !transcript.trim()) {
    return new Response(JSON.stringify({ error: 'missing_call_id_or_transcript' }), {
      status: 400, headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }

  const sb = supabaseAdmin();
  const hits: RedFlagHit[] = [];

  // ── Layer 1: Hardcoded phrase library (deterministic) ──────────
  const { data: phrases } = await sb
    .from('v_red_flag_lookup')
    .select('category, lang, phrase, severity_score, detection_method, min_confidence')
    .eq('lang', lang);

  const lower = transcript.toLowerCase();
  for (const row of phrases ?? []) {
    if (matchPhrase(lower, row.phrase, row.detection_method)) {
      hits.push({
        category: row.category,
        source: 'rule',
        confidence: 1.0,
        matched_phrase: row.phrase,
      });
    }
  }

  // ── Layer 2: Sarvam-M for low-coverage / multilingual cases ────
  // Only invoke if no rule hit AND transcript has >5 words (avoid trivials)
  if (hits.length === 0 && transcript.split(/\s+/).length > 5) {
    try {
      const llm = await sarvamM({
        messages: [
          { role: 'system', content: SARVAM_M_PROMPT },
          { role: 'user', content: transcript },
        ],
        temperature: 0.1,
        maxTokens: 200,
        responseFormat: 'json_object',
      });
      const parsed = JSON.parse(llm.text.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
      const conf = Number(parsed.confidence ?? 0.5);
      if (parsed.red_flag === true || conf < 0.85) {
        hits.push({
          category: parsed.category ?? 'other',
          source: conf < 0.85 ? 'uncertainty_default' : 'llm',
          confidence: conf,
          matched_phrase: null,
        });
      }
    } catch (e) {
      console.error('[red-flag-check] sarvam-m failed', e);
      // Safety: on classifier failure, escalate as uncertainty default
      hits.push({
        category: 'other',
        source: 'uncertainty_default',
        confidence: 0.0,
        matched_phrase: null,
      });
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
    transcript_chars: transcript.length,
  }), {
    status: 200,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
});

function matchPhrase(haystack: string, phrase: string, method: string): boolean {
  const p = phrase.toLowerCase();
  if (method === 'exact') return haystack.includes(p);
  if (method === 'regex') {
    try { return new RegExp(p, 'i').test(haystack); } catch { return haystack.includes(p); }
  }
  // 'semantic' falls back to substring at the deterministic layer
  return haystack.includes(p);
}
