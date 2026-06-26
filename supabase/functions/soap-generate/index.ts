// soap-generate/index.ts
// ╔════════════════════════════════════════════════════════════════╗
// ║  SOAP note generator for eSanjeevani-compatible documentation.  ║
// ║                                                                 ║
// ║  Called by process-call-records AFTER triage-score returns.     ║
// ║  Pulls call + triage + turns + patient context, redacts PII,    ║
// ║  asks Claude Sonnet 4.6 to emit a structured SOAP via forced    ║
// ║  tool-use, inserts to soap_notes, returns soap_id.              ║
// ║                                                                 ║
// ║  Anand red lines preserved:                                     ║
// ║   - NEVER the word "diagnosis" — use presumptive_screening_label║
// ║   - NEVER drug names in patient-facing Plan field; drug hints   ║
// ║     go to mo_only_drug_hints (MO sees, patient does not)        ║
// ║   - Disclaimer text written by DB default                       ║
// ║                                                                 ║
// ║  Aanya floor preserved: cites IMCI/PEN/STW, structured          ║
// ║  differential, ICD-10/11 codes, callback ETA.                   ║
// ╚════════════════════════════════════════════════════════════════╝

import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
import { verifyBearer } from '../_shared/constant-time-compare.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { redactPII } from '../_shared/pii-redactor.ts';
import { claudeCall } from '../_shared/anthropic-client.ts';

const SYSTEM_PROMPT = `You are Vaani-AI's SOAP-note drafter for a named Registered Medical Practitioner (RMP) to review and sign. You are NOT a doctor. Your output is a structured eSanjeevani-format SOAP note in strict JSON via the emit_soap tool.

<rules>
1. NEVER use the word "diagnosis" anywhere. Use presumptive_screening_label only.
2. NEVER place drug names, doses, or brand names in subjective/objective/assessment/plan. Drug suggestions belong only in mo_only_drug_hints. The patient-facing Plan is non-pharmacological + "the doctor will call you back".
3. Subjective is in the patient's preferred_language (use Devanagari/Tamil/Telugu script natively). Objective/Assessment/Plan are in English (for MO chart review).
4. ICD-10 codes (3-7 chars) AND ICD-11 MMS codes — at least one of each when confident.
5. Assessment cites protocols [IMCI §X], [PEN P#], [STW §X], or [mhGAP] when relevant. Never fabricate.
6. Plan ends with "RMP <name> will call back within <window>" in the patient's preferred language.
7. esanjeevani_payload mirrors S/O/A/P plus the coded fields so the MO can paste-into the government EHR with one click.
8. patient_callback_eta_min: RED → 15-30, AMBER → 60-180, GREEN → 240-720.
9. differential_list: 2-4 items, each {label, likelihood (high|medium|low), rationale (≤30 words)}.
10. mo_only_drug_hints: 0-5 items as plain strings like "Paracetamol 500mg BD x3d if T>38°C". Empty list is fine.
11. follow_up_channel: one of voice|whatsapp|sms — pick the most appropriate given triage band + patient profile.
12. If you don't have enough information for a field, use "" or [] rather than fabricating. Never invent a vital sign.
</rules>

<padding_for_cache>
This prompt is intentionally over the 1024-token Anthropic cache minimum so ephemeral cache_control activates. Subsequent calls within the cache window pay only the delta tokens.
</padding_for_cache>

Use the emit_soap tool to return your output.`;

const SOAP_TOOL = {
  name: 'emit_soap',
  description: 'Emit an eSanjeevani-format SOAP note for the named call.',
  input_schema: {
    type: 'object',
    properties: {
      subjective: { type: 'string', description: "Patient's complaint in their own language" },
      objective: { type: 'string', description: 'Observed facts (vitals if available, exam findings reported by ASHA, screening results)' },
      assessment: { type: 'string', description: 'Clinical assessment with protocol citations' },
      plan: { type: 'string', description: 'Patient-facing plan (NO drug names). Ends with callback promise.' },
      presumptive_screening_label: { type: 'string' },
      differential_list: {
        type: 'array',
        maxItems: 4,
        items: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            likelihood: { type: 'string', enum: ['high', 'medium', 'low'] },
            rationale: { type: 'string' },
          },
          required: ['label', 'likelihood'],
        },
      },
      icd10_codes: { type: 'array', items: { type: 'string' } },
      icd11_codes: { type: 'array', items: { type: 'string' } },
      mo_only_drug_hints: { type: 'array', items: { type: 'string' } },
      esanjeevani_payload: { type: 'object' },
      patient_callback_eta_min: { type: 'integer', minimum: 5, maximum: 720 },
      follow_up_channel: { type: 'string', enum: ['voice', 'whatsapp', 'sms'] },
      investigations_advised: { type: 'array', items: { type: 'string' } },
    },
    required: [
      'subjective', 'objective', 'assessment', 'plan',
      'presumptive_screening_label', 'patient_callback_eta_min',
    ],
  },
};

function jsonErr(status: number, error: string, detail?: string) {
  return new Response(JSON.stringify({ error, detail }), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
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

  // Refuse to regenerate if a SOAP already exists for this call (unique constraint
  // on call_id makes a duplicate insert error anyway; check first for a clean 409).
  const { data: existing } = await sb
    .from('soap_notes')
    .select('id, mo_signed_at')
    .eq('call_id', callId)
    .maybeSingle();
  if (existing) {
    return new Response(JSON.stringify({
      soap_id: existing.id,
      already_existed: true,
      mo_signed_at: existing.mo_signed_at,
    }), { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } });
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
    .select('id, band, presumptive_label, red_flag_categories, confidence, reasoning, summary_en, summary_native, recommended_action')
    .eq('call_id', callId)
    .maybeSingle();
  if (!triage) return jsonErr(409, 'triage_missing', 'triage-score must run first');

  const { data: patient } = await sb
    .from('patients')
    .select('full_name, phone_e164, abha_id, village_name, age_years, sex, pregnancy_status, preferred_language')
    .eq('id', call.patient_id)
    .single();
  const lang = (patient?.preferred_language ?? call.lang_detected ?? call.lang_declared ?? 'hi') as string;

  const { data: turns } = await sb
    .from('turns')
    .select('turn_idx, role, transcript')
    .eq('call_id', callId)
    .order('turn_idx');

  // ── Compose context for Claude ────────────────────────────────
  const ctx = {
    triage: {
      band: triage.band,
      presumptive_label: triage.presumptive_label,
      red_flag_categories: triage.red_flag_categories,
      confidence: triage.confidence,
      reasoning: triage.reasoning,
      summary_en: triage.summary_en,
      recommended_action: triage.recommended_action,
    },
    patient_profile: {
      age_years: patient?.age_years ?? null,
      sex: patient?.sex ?? null,
      pregnancy_status: patient?.pregnancy_status ?? null,
      preferred_language: lang,
    },
    transcript: (turns ?? []).map((t: any) => ({ idx: t.turn_idx, role: t.role, text: t.transcript })),
    callback_window_hint: triage.band === 'RED' ? '15-30 min' : triage.band === 'AMBER' ? '60-180 min' : '4-12 hr',
  };

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
        content: `<context>\n${redactedText}\n</context>\n\nEmit the eSanjeevani SOAP note via emit_soap. Patient preferred language code: "${lang}".`,
      },
    ],
    maxTokens: 1500,
    temperature: 0.2,
    callId,
    redactionSessionToken: sessionToken,
    redactionMethod: 'pii_token_map_v1',
    tools: [SOAP_TOOL],
    toolChoice: { type: 'tool', name: 'emit_soap' },
  });

  const soap = (claudeResp.toolUses[0]?.input ?? null) as Record<string, unknown> | null;
  if (!soap) {
    return jsonErr(502, 'no_tool_use', `Claude did not emit emit_soap (stop_reason=${claudeResp.stopReason})`);
  }

  // ── Insert into soap_notes ─────────────────────────────────────
  const { data: inserted, error: insertErr } = await sb
    .from('soap_notes')
    .insert({
      call_id: callId,
      triage_decision_id: triage.id,
      patient_id: call.patient_id,
      tenant_id: call.tenant_id,
      subjective: String(soap.subjective ?? ''),
      objective: String(soap.objective ?? ''),
      assessment: String(soap.assessment ?? ''),
      plan: String(soap.plan ?? ''),
      icd10_codes: Array.isArray(soap.icd10_codes) ? soap.icd10_codes : [],
      icd11_codes: Array.isArray(soap.icd11_codes) ? soap.icd11_codes : [],
      presumptive_screening_label: String(soap.presumptive_screening_label ?? 'unspecified'),
      differential_list: Array.isArray(soap.differential_list) ? soap.differential_list : [],
      // Audit-§2 fix: persist mo_only_drug_hints (migration 009 added
      // the column). MO-only — never read by vaani-signoff or any
      // patient-facing surface.
      mo_only_drug_hints: Array.isArray(soap.mo_only_drug_hints) ? soap.mo_only_drug_hints : [],
      vitals_source: 'NOT_AVAILABLE',
      vitals_json: {},
      esanjeevani_payload: soap.esanjeevani_payload ?? null,
      lang,
      original_text: JSON.stringify(soap),
      follow_up_channel: soap.follow_up_channel ?? null,
      investigations_advised: Array.isArray(soap.investigations_advised) ? soap.investigations_advised : [],
    })
    .select('id')
    .single();

  if (insertErr) return jsonErr(500, 'insert_failed', insertErr.message);

  return new Response(JSON.stringify({
    soap_id: inserted.id,
    callback_eta_min: soap.patient_callback_eta_min ?? null,
    presumptive_label: soap.presumptive_screening_label,
    input_tokens: claudeResp.inputTokens,
    output_tokens: claudeResp.outputTokens,
    cached_read: claudeResp.cachedReadTokens,
  }), { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } });
});
