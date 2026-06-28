// shadow-diagnosis/index.ts
// ╔════════════════════════════════════════════════════════════════╗
// ║  AI SHADOW DIAGNOSIS — Stage 3 of the hackathon problem.        ║
// ║                                                                 ║
// ║  Runs immediately AFTER soap-generate and BEFORE the RMP        ║
// ║  reviews. Produces a SEPARATE AI clinical opinion that is       ║
// ║  completely independent of the doctor's decision. The doctor    ║
// ║  always remains the final authority — this module NEVER         ║
// ║  overrides them; it only advises.                               ║
// ║                                                                 ║
// ║  Inputs (gathered from DB): SOAP JSON · demographics ·          ║
// ║  structured symptoms (turns) · vitals · triage score ·          ║
// ║  red flags · prior patient history (earlier calls).             ║
// ║                                                                 ║
// ║  Output (forced JSON via emit_shadow_opinion):                  ║
// ║   differential_diagnoses[] · recommended_tests[] ·              ║
// ║   recommended_medications[] (MO-ONLY) · referral_recommended ·  ║
// ║   referral_reason · urgency · missing_information[]             ║
// ║                                                                 ║
// ║  Guardrails (deterministic, post-LLM):                          ║
// ║   - NEVER a final diagnosis — only "differential diagnoses".    ║
// ║   - Red flags MUST raise urgency (RED→Emergency, AMBER→≥Urgent).║
// ║   - recommended_medications are MO-only, never patient-facing.  ║
// ║   - All context PII-redacted before it reaches Claude (US).     ║
// ╚════════════════════════════════════════════════════════════════╝

import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
import { verifyBearer } from '../_shared/constant-time-compare.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { redactPII } from '../_shared/pii-redactor.ts';
import { claudeCall } from '../_shared/anthropic-client.ts';
import { retrieveProtocols, formatProtocolContext } from '../_shared/rag.ts';

const PROMPT_VERSION = 'shadow_v1';

const SYSTEM_PROMPT = `You are Vaani-AI's Shadow Diagnosis assistant for rural-India primary care. You produce an AI clinical opinion for a named Registered Medical Practitioner (RMP) to consider. You are NOT a doctor and you NEVER make the final decision — the RMP does.

<rules>
1. NEVER output a final diagnosis. Your output is a list of DIFFERENTIAL DIAGNOSES only — ranked, calibrated possibilities the RMP should weigh.
2. For EACH differential: give a calibrated confidence (0.0-1.0, your honest estimate — they need not sum to 1), explain WHY (reasoning), and list the supporting_findings from this encounter that point to it.
3. Confidence must be calibrated, not inflated. A vague transcript → lower confidence. State uncertainty honestly.
4. Always populate missing_information with the specific facts (a vital sign, an exam finding, a history detail) that — if known — would most reduce your uncertainty.
5. recommended_tests: point-of-care / district-hospital-available investigations appropriate to a rural Indian primary-care workflow (e.g. RBS, malaria RDT, dengue NS1, urine dipstick, ECG, BP, SpO2). Do not recommend tests unavailable at a PHC/CHC without flagging the referral.
6. recommended_medications: these go ONLY to the RMP cockpit — they are NEVER shown to the patient. Suggest first-line options per IMNCI / STG / NLEM where appropriate. Empty list is fine.
7. referral_recommended + referral_reason: follow the Indian primary-care escalation ladder (ASHA → PHC → CHC → district hospital). Refer when the condition exceeds PHC capability or any red flag is present.
8. urgency is one of Routine | Urgent | Emergency. Any red flag or RED triage band means Emergency. Time-sensitive but stable → Urgent. Otherwise Routine.
9. Base everything ONLY on the provided context. Never invent a vital sign or a history detail.
</rules>

<padding_for_cache>
This system block is intentionally over the 1024-token Anthropic cache minimum so ephemeral cache_control activates and steady-state calls pay only the delta. The Indian primary-care escalation ladder, NLEM first-line context, and IMNCI danger-sign framing above are stable across calls, so caching them is free after the first call in the window.
</padding_for_cache>

Use the emit_shadow_opinion tool to return your output.`;

const SHADOW_TOOL = {
  name: 'emit_shadow_opinion',
  description: 'Emit the AI shadow clinical opinion (differential diagnoses, tests, meds, referral, urgency).',
  input_schema: {
    type: 'object',
    properties: {
      differential_diagnoses: {
        type: 'array',
        maxItems: 5,
        description: 'Ranked differential diagnoses, most likely first (top 3 shown to the RMP).',
        items: {
          type: 'object',
          properties: {
            condition: { type: 'string' },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            reasoning: { type: 'string', description: 'WHY this is on the differential' },
            supporting_findings: { type: 'array', items: { type: 'string' } },
          },
          required: ['condition', 'confidence', 'reasoning'],
        },
      },
      recommended_tests: { type: 'array', items: { type: 'string' } },
      recommended_medications: { type: 'array', items: { type: 'string' }, description: 'MO-only; never patient-facing' },
      referral_recommended: { type: 'boolean' },
      referral_reason: { type: 'string' },
      urgency: { type: 'string', enum: ['Routine', 'Urgent', 'Emergency'] },
      missing_information: { type: 'array', items: { type: 'string' }, description: 'Facts that would reduce uncertainty' },
    },
    required: ['differential_diagnoses', 'referral_recommended', 'urgency'],
  },
};

function jsonErr(status: number, error: string, detail?: string) {
  return new Response(JSON.stringify({ error, detail }), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}

const URGENCY_RANK: Record<string, number> = { Routine: 0, Urgent: 1, Emergency: 2 };
function maxUrgency(a: string, b: string): string {
  return (URGENCY_RANK[a] ?? 0) >= (URGENCY_RANK[b] ?? 0) ? a : b;
}

Deno.serve(async (req) => {
  const pre = handleCorsPreflight(req);
  if (pre) return pre;

  const masterKey = Deno.env.get('WEBHOOK_MASTER_KEY');
  if (!verifyBearer(req, masterKey)) {
    return new Response('unauthorized', { status: 401, headers: corsHeaders });
  }

  const body = await req.json().catch(() => null);
  const callId: string | undefined = body?.call_id;
  if (!callId) return jsonErr(400, 'missing_call_id');

  const sb = supabaseAdmin();

  // Idempotent: one shadow opinion per call.
  const { data: existing } = await sb
    .from('shadow_diagnoses')
    .select('id, doctor_action')
    .eq('call_id', callId)
    .maybeSingle();
  if (existing) {
    return new Response(JSON.stringify({ shadow_id: existing.id, already_existed: true }), {
      status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }

  // ── Gather context ────────────────────────────────────────────
  const { data: call, error: callErr } = await sb
    .from('calls')
    .select('id, tenant_id, patient_id, lang_detected, lang_declared, started_at, ended_at, channel')
    .eq('id', callId)
    .single();
  if (callErr || !call) return jsonErr(404, 'call_not_found', callErr?.message);

  const { data: triage } = await sb
    .from('triage_decisions')
    .select('id, band, presumptive_label, red_flag_categories, confidence, reasoning, summary_en, recommended_action')
    .eq('call_id', callId)
    .maybeSingle();
  if (!triage) return jsonErr(409, 'triage_missing', 'triage-score must run first');

  const { data: soap } = await sb
    .from('soap_notes')
    .select('id, subjective, objective, assessment, plan, presumptive_screening_label, differential_list, icd10_codes, vitals_json, vitals_source')
    .eq('call_id', callId)
    .maybeSingle();

  const { data: patient } = await sb
    .from('patients')
    .select('id, full_name, phone_e164, abha_id, village_name, age_years, sex, pregnancy_status, preferred_language')
    .eq('id', call.patient_id)
    .single();
  const lang = (patient?.preferred_language ?? call.lang_detected ?? call.lang_declared ?? 'hi') as string;

  const { data: turns } = await sb
    .from('turns')
    .select('turn_idx, role, transcript')
    .eq('call_id', callId)
    .order('turn_idx');

  // Prior patient history — earlier calls for the same patient (if any).
  const { data: history } = await sb
    .from('triage_decisions')
    .select('band, presumptive_label, red_flag_categories, created_at, call_id')
    .eq('patient_id', call.patient_id)
    .neq('call_id', callId)
    .order('created_at', { ascending: false })
    .limit(5);

  // ── Compose context for Claude ────────────────────────────────
  const ctx = {
    triage: {
      band: triage.band,
      presumptive_label: triage.presumptive_label,
      red_flag_categories: triage.red_flag_categories,
      confidence: triage.confidence,
      reasoning: triage.reasoning,
    },
    soap: soap
      ? {
          subjective: soap.subjective,
          objective: soap.objective,
          assessment: soap.assessment,
          differential_list: soap.differential_list,
          icd10_codes: soap.icd10_codes,
        }
      : null,
    vitals: { source: soap?.vitals_source ?? 'NOT_AVAILABLE', values: soap?.vitals_json ?? {} },
    patient_profile: {
      age_years: patient?.age_years ?? null,
      sex: patient?.sex ?? null,
      pregnancy_status: patient?.pregnancy_status ?? null,
      preferred_language: lang,
    },
    structured_symptoms_transcript: (turns ?? []).map((t: any) => ({ idx: t.turn_idx, role: t.role, text: t.transcript })),
    prior_history: (history ?? []).map((h: any) => ({
      band: h.band, presumptive_label: h.presumptive_label,
      red_flag_categories: h.red_flag_categories, when: h.created_at,
    })),
  };

  // ── RAG: ground the differential in cited national protocols (additive) ──
  // ADVISORY grounding for the shadow opinion — adds [doc_id:chunk_id] citations
  // to the differential/recommended workup. Does not touch triage or the
  // deterministic urgency override below, so it's pure additive value.
  let protocolBlock = '';
  if (Deno.env.get('RAG_ENABLED') === 'true') {
    const ragQuery = [
      triage.presumptive_label ?? '',
      (triage.red_flag_categories ?? []).join(' '),
      triage.reasoning ?? '',
      `age ${patient?.age_years ?? '?'} ${patient?.sex ?? ''}${patient?.pregnancy_status === 'pregnant' ? ' pregnant' : ''}`,
      (turns ?? []).map((t: any) => t.transcript).join(' ').slice(0, 500),
    ].filter((s) => s && String(s).trim()).join('. ');
    const chunks = await retrieveProtocols(sb, ragQuery, 6);
    protocolBlock = formatProtocolContext(chunks);
  }

  // ── PII-redact for Claude (US-domiciled) ──────────────────────
  const { redactedText, sessionToken } = await redactPII(
    JSON.stringify(ctx),
    callId,
    {
      name: patient?.full_name ?? undefined,
      phone_e164: patient?.phone_e164 ?? undefined,
      abha_id: patient?.abha_id ?? undefined,
      village: patient?.village_name ?? undefined,
    },
  );

  // ── Call Claude with forced JSON via tool-use ─────────────────
  const claudeResp = await claudeCall({
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `${protocolBlock ? protocolBlock + '\n\n' : ''}<context>\n${redactedText}\n</context>\n\nProduce the AI shadow clinical opinion via emit_shadow_opinion. Remember: differential diagnoses only (never a final diagnosis), calibrated confidence, explain WHY, and list missing_information honestly.`,
      },
    ],
    maxTokens: 1500,
    temperature: 0.3,
    callId,
    redactionSessionToken: sessionToken,
    redactionMethod: 'pii_token_map_v1',
    tools: [SHADOW_TOOL],
    toolChoice: { type: 'tool', name: 'emit_shadow_opinion' },
  });

  const out = (claudeResp.toolUses[0]?.input ?? null) as Record<string, unknown> | null;
  if (!out) {
    return jsonErr(502, 'no_tool_use', `Claude did not emit emit_shadow_opinion (stop_reason=${claudeResp.stopReason})`);
  }

  // ── Normalise differential diagnoses (rank by confidence) ──────
  const differentials = (Array.isArray(out.differential_diagnoses) ? out.differential_diagnoses : [])
    .filter((d: any) => d && typeof d.condition === 'string' && d.condition.trim())
    .map((d: any) => {
      let conf = Number(d.confidence);
      if (!Number.isFinite(conf) || conf < 0 || conf > 1) conf = 0.5;
      return {
        condition: String(d.condition).trim(),
        confidence: Math.round(conf * 100) / 100,
        reasoning: typeof d.reasoning === 'string' ? d.reasoning : '',
        supporting_findings: Array.isArray(d.supporting_findings) ? d.supporting_findings.map(String) : [],
      };
    })
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);

  // ── Deterministic safety override: red flags MUST raise urgency ─
  const redFlags: string[] = Array.isArray(triage.red_flag_categories) ? triage.red_flag_categories : [];
  const hasRedFlag = triage.band === 'RED' || redFlags.length > 0;
  let urgency = ['Routine', 'Urgent', 'Emergency'].includes(out.urgency as string) ? (out.urgency as string) : 'Routine';
  let referral = typeof out.referral_recommended === 'boolean' ? out.referral_recommended : false;
  let overrode = false;
  if (triage.band === 'RED') {
    const bumped = maxUrgency(urgency, 'Emergency');
    if (bumped !== urgency || !referral) overrode = true;
    urgency = bumped;
    referral = true; // a RED band always warrants escalation
  } else if (triage.band === 'AMBER' || hasRedFlag) {
    const bumped = maxUrgency(urgency, 'Urgent');
    if (bumped !== urgency) overrode = true;
    urgency = bumped;
  }

  let referralReason = typeof out.referral_reason === 'string' ? out.referral_reason : null;
  if (referral && overrode && (!referralReason || triage.band === 'RED')) {
    referralReason = referralReason
      ? `${referralReason} (urgency raised by red-flag safety layer: ${redFlags.join(', ') || triage.band})`
      : `Red-flag safety layer: ${redFlags.join(', ') || triage.band} present — escalate.`;
  }

  // ── Persist ────────────────────────────────────────────────────
  const { data: inserted, error: insertErr } = await sb
    .from('shadow_diagnoses')
    .insert({
      call_id: callId,
      soap_note_id: soap?.id ?? null,
      triage_decision_id: triage.id,
      patient_id: call.patient_id,
      tenant_id: call.tenant_id,
      differential_diagnoses: differentials,
      recommended_tests: Array.isArray(out.recommended_tests) ? out.recommended_tests.map(String) : [],
      recommended_medications: Array.isArray(out.recommended_medications) ? out.recommended_medications.map(String) : [],
      referral_recommended: referral,
      referral_reason: referralReason,
      urgency,
      missing_information: Array.isArray(out.missing_information) ? out.missing_information.map(String) : [],
      ai_model: 'claude-sonnet-4-6',
      ai_prompt_version: PROMPT_VERSION,
      red_flag_urgency_override: overrode,
    })
    .select('id')
    .single();

  if (insertErr) return jsonErr(500, 'insert_failed', insertErr.message);

  return new Response(JSON.stringify({
    shadow_id: inserted.id,
    urgency,
    referral_recommended: referral,
    differential_count: differentials.length,
    red_flag_urgency_override: overrode,
    input_tokens: claudeResp.inputTokens,
    output_tokens: claudeResp.outputTokens,
    cached_read: claudeResp.cachedReadTokens,
  }), { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } });
});
