// triage-score/index.ts
// ╔════════════════════════════════════════════════════════════════╗
// ║  Triage Classifier — the clinical heart of Vaani.               ║
// ║                                                                 ║
// ║  Input: call_id (which has turns + presenting_complaints +      ║
// ║         vitals + red_flag_events already populated).            ║
// ║  Pipeline:                                                      ║
// ║   1. Pull call context (with PII intact for Sarvam-M)           ║
// ║   2. PII-redact for Claude                                      ║
// ║   3. Call Claude with strict triage prompt + RAG citations      ║
// ║   4. Validate JSON schema (zod-like)                            ║
// ║   5. Apply 0.85 confidence gate                                 ║
// ║   6. Insert into triage_decisions                               ║
// ║   7. Trigger soap-generate (downstream)                         ║
// ║                                                                 ║
// ║  Output schema:                                                 ║
// ║    {                                                            ║
// ║      band: "RED" | "AMBER" | "GREEN",                           ║
// ║      presumptive_label: string,                                 ║
// ║      red_flag_categories: string[],                             ║
// ║      confidence: number 0-1,                                    ║
// ║      reasoning: string,                                         ║
// ║      summary_en: string,                                        ║
// ║      summary_native: string,                                    ║
// ║      recommended_action: string,                                ║
// ║      citations: string[],                                       ║
// ║      callback_time_iso: string | null                           ║
// ║    }                                                            ║
// ╚════════════════════════════════════════════════════════════════╝

import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
import { verifyBearer } from '../_shared/constant-time-compare.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { redactPII } from '../_shared/pii-redactor.ts';
import { claudeCall } from '../_shared/anthropic-client.ts';

const SYSTEM_PROMPT = `You are Vaani-AI's clinical triage scorer.
You assist a Registered Medical Practitioner (RMP) in India. You are NOT a doctor and you NEVER provide a diagnosis.
Your output is a presumptive screening + recommended action, in strict JSON.

<protocols>
- WHO IMCI (for children <5y)
- WHO PEN (for HTN/diabetes/NCDs)
- ICMR Standard Treatment Workflows
- MoHFW ANC schedule (8 contacts)
- NTEP (TB), RNTCP (DOTS)
- mhGAP (mental health)
</protocols>

<rules>
1. Never write the word "diagnosis". Use "presumptive_label".
2. Any of these = RED, confidence 1.0:
   chest pain (with sweating/radiation/dyspnea), dyspnea at rest, altered consciousness, seizure, snake/scorpion bite, postpartum hemorrhage, fever in newborn or >5d with rash/petechiae, child unable to drink, severe dehydration, suicidal ideation, stroke (BE-FAST any), pre-eclampsia signs, mammal bite (Cat III), hemoptysis, peritonitis, major burns >10%.
3. If a red flag is present, presumptive_label MUST match the flag category.
4. Age <2mo OR >65 with fever ≥38.5°C → minimum AMBER.
5. Pregnancy + (bleeding OR severe headache OR convulsions) → RED.
6. If confidence < 0.85, set needs_mo_review=true. Default safety-first: when uncertain, escalate.
7. Cite RAG sources inline as [doc_id:chunk_id] in reasoning.
</rules>

<output_schema>
Return ONLY valid JSON matching this shape:
{
  "band": "RED" | "AMBER" | "GREEN",
  "presumptive_label": string,
  "red_flag_categories": string[],
  "confidence": number,
  "reasoning": string,
  "summary_en": string,
  "summary_native": string,
  "recommended_action": string,
  "needs_mo_review": boolean,
  "citations": string[],
  "callback_time_iso": string | null
}
</output_schema>`;

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  const masterKey = Deno.env.get('WEBHOOK_MASTER_KEY');
  if (!verifyBearer(req, masterKey)) {
    return new Response('unauthorized', { status: 401, headers: corsHeaders });
  }

  const body = await req.json().catch(() => null);
  const callId: string | undefined = body?.call_id;
  if (!callId) {
    return new Response(JSON.stringify({ error: 'missing_call_id' }), {
      status: 400,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }

  const sb = supabaseAdmin();

  // 1. Pull call context
  const { data: call, error: callErr } = await sb
    .from('calls')
    .select('id, tenant_id, patient_id, lang_declared, lang_detected, started_at, ended_at')
    .eq('id', callId)
    .single();
  if (callErr || !call) {
    return new Response(JSON.stringify({ error: 'call_not_found', detail: callErr?.message }), {
      status: 404,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }

  const { data: patient } = await sb
    .from('patients')
    .select('full_name, phone_e164, abha_id, village_name, age_years, sex, pregnancy_status, preferred_language')
    .eq('id', call.patient_id)
    .maybeSingle();

  const { data: turns } = await sb
    .from('turns')
    .select('role, transcript, lang')
    .eq('call_id', callId)
    .order('turn_idx');

  const { data: complaints } = await sb
    .from('presenting_complaints')
    .select('complaint_code, duration_value, duration_unit, severity, associated_symptoms, fever_duration_days, cough_duration_weeks, sputum_blood')
    .eq('call_id', callId);

  const { data: redFlags } = await sb
    .from('red_flag_events')
    .select('category, source, confidence, matched_phrase, action_taken')
    .eq('call_id', callId);

  const { data: vitals } = await sb
    .from('vitals_observations')
    .select('temperature_c, pulse_bpm, respiratory_rate_per_min, systolic_bp_mmhg, diastolic_bp_mmhg, spo2_pct, weight_kg, hemoglobin_gdl, source')
    .eq('call_id', callId)
    .order('observed_at', { ascending: false })
    .limit(3);

  // 2. Build the user message with all clinical context
  const contextText = JSON.stringify({
    patient: {
      age: patient?.age_years,
      sex: patient?.sex,
      pregnancy_status: patient?.pregnancy_status,
      preferred_language: patient?.preferred_language,
    },
    transcript_excerpt: (turns ?? [])
      .map((t) => `${t.role}: ${t.transcript}`)
      .join('\n')
      .slice(0, 8000),
    presenting_complaints: complaints ?? [],
    red_flag_events: redFlags ?? [],
    recent_vitals: vitals ?? [],
  });

  // 3. PII-redact before Claude
  const { redactedText, sessionToken } = await redactPII(contextText, callId, {
    name: patient?.full_name ?? undefined,
    phone_e164: patient?.phone_e164 ?? undefined,
    abha_id: patient?.abha_id ?? undefined,
    village: patient?.village_name ?? undefined,
  });

  // 4. Call Claude with prompt-caching on the system block
  const claudeResp = await claudeCall({
    system: SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: `<context>\n${redactedText}\n</context>\n\nProduce the JSON triage decision now.` },
    ],
    maxTokens: 1024,
    temperature: 0.1,
    callId,
    redactionSessionToken: sessionToken,
    redactionMethod: 'pii_token_map_v1',
  });

  // 5. Parse + validate
  let decision: any;
  try {
    decision = JSON.parse(claudeResp.text.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
  } catch {
    decision = {};
  }
  const band = ['RED', 'AMBER', 'GREEN'].includes(decision.band) ? decision.band : 'AMBER';
  const confidence = Math.min(1, Math.max(0, Number(decision.confidence ?? 0.5)));
  const needsMoReview = decision.needs_mo_review ?? confidence < 0.85;

  // 6. Insert triage_decisions row
  const { data: inserted, error: insertErr } = await sb
    .from('triage_decisions')
    .insert({
      call_id: callId,
      patient_id: call.patient_id,
      tenant_id: call.tenant_id,
      band,
      presumptive_label: decision.presumptive_label ?? 'unspecified',
      red_flag_categories: decision.red_flag_categories ?? [],
      confidence,
      reasoning: decision.reasoning ?? null,
      needs_mo_review: needsMoReview,
      citations: decision.citations ?? [],
      summary_en: decision.summary_en ?? null,
      summary_native: decision.summary_native ?? null,
      recommended_action: decision.recommended_action ?? null,
      callback_time_iso: decision.callback_time_iso ?? null,
      classifier_model: 'claude-sonnet-4-6',
      classifier_prompt_version: 'triage-v1',
    })
    .select('id')
    .single();

  if (insertErr) {
    return new Response(JSON.stringify({ error: 'insert_failed', detail: insertErr.message }), {
      status: 500,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({
    triage_id: inserted.id,
    band,
    confidence,
    needs_mo_review: needsMoReview,
    cost_usd: estimateCost(claudeResp.inputTokens, claudeResp.outputTokens, claudeResp.cachedTokens),
  }), {
    status: 200,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
});

function estimateCost(inputTok: number, outputTok: number, cachedTok = 0): number {
  // Sonnet 4.6: $3/M input, $15/M output, $0.30/M cached read.
  const inputCost = ((inputTok - cachedTok) / 1_000_000) * 3;
  const cachedCost = (cachedTok / 1_000_000) * 0.30;
  const outputCost = (outputTok / 1_000_000) * 15;
  return Math.round((inputCost + cachedCost + outputCost) * 10_000) / 10_000;
}
