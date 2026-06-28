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
import { ICD10_CATALOGUE_PROMPT, validateIcd10 } from '../_shared/icd10-rural.ts';
import { retrieveProtocols, formatProtocolContext } from '../_shared/rag.ts';

const SYSTEM_PROMPT = `You are Vaani-AI's SOAP-note drafter for a named Registered Medical Practitioner (RMP) to review and sign. You are NOT a doctor. Your output is a structured eSanjeevani-format SOAP note in strict JSON via the emit_soap tool.

<rules>
1. NEVER use the word "diagnosis" anywhere. Use presumptive_screening_label only.
2. NEVER place drug names, doses, or brand names in subjective/objective/assessment/plan. Drug suggestions belong only in mo_only_drug_hints. The patient-facing Plan is non-pharmacological + "the doctor will call you back".
3. Subjective is in the patient's preferred_language (use Devanagari/Tamil/Telugu script natively). Objective/Assessment/Plan are in English (for MO chart review).
4. icd10_codes: choose ONLY from the <icd10_catalogue> below. Emit the exact code strings (e.g. "I21.9"), 1-3 codes, most-specific first. NEVER invent a code that is not in the catalogue — an off-catalogue code is dropped and counts as a miss. If nothing fits, emit []. icd11_codes (MMS) may be free-form when confident.
5. Assessment cites protocols [IMCI §X], [PEN P#], [STW §X], or [mhGAP] when relevant. Never fabricate.
6. Plan ends with "RMP <name> will call back within <window>" in the patient's preferred language.
7. esanjeevani_payload mirrors S/O/A/P plus the coded fields so the MO can paste-into the government EHR with one click.
8. patient_callback_eta_min: RED → 15-30, AMBER → 60-180, GREEN → 240-720.
9. differential_list: a RANKED top-3 (most likely first), each {label, likelihood (high|medium|low), confidence (0.0-1.0), rationale (≤30 words)}. This is the MO-only shadow differential — it is NEVER shown to the patient. Confidences are your own calibrated estimate and need not sum to 1. Emit fewer than 3 only when the transcript genuinely supports fewer.
10. mo_only_drug_hints: 0-5 items as plain strings like "Paracetamol 500mg BD x3d if T>38°C". Empty list is fine.
11. follow_up_channel: one of voice|whatsapp|sms — pick the most appropriate given triage band + patient profile.
12. If you don't have enough information for a field, use "" or [] rather than fabricating. Never invent a vital sign.
13. patient_callback_message: the spoken message Vaani reads ALOUD to the patient on the phone callback, IN THE PATIENT'S preferred_language (Devanagari for hi, Tamil script for ta — NEVER English, NEVER digits). 2-3 short, plain spoken sentences a villager understands: what the doctor advises them to do, and what to watch for. NO drug names, NO "diagnosis"/presumptive labels, NO English medical jargon, NO ICD codes. This is the ONLY clinical content the patient hears; it is spoken BETWEEN "the doctor has seen your report" and "rest well, we are with you", so do NOT repeat those framings. If you are unsure, keep it to a simple reassurance to follow the doctor's callback. This is the patient-language twin of the English Plan — same advice, spoken warmly in their tongue.
</rules>

<icd10_catalogue>
Choose icd10_codes ONLY from this curated rural-primary-care catalogue (code=title), grouped by clinical system:
${ICD10_CATALOGUE_PROMPT}
</icd10_catalogue>

<padding_for_cache>
This prompt is intentionally over the 1024-token Anthropic cache minimum so ephemeral cache_control activates. Subsequent calls within the cache window pay only the delta tokens. The icd10_catalogue above is part of the cached system block, so grounding the codes adds no per-turn cost in steady state.
</padding_for_cache>

Use the emit_soap tool to return your output.`;

// A patient row starts anonymous (full_name is a system placeholder). Only a
// placeholder may be overwritten by the name the caller actually stated — never
// a real, pre-existing name.
const NAME_PLACEHOLDER_RE = /anonymous web caller|web demo caller|pilot caller|unknown caller|web caller|^\s*$/i;
function isPlaceholderName(s?: string | null): boolean {
  return !s || NAME_PLACEHOLDER_RE.test(s.trim());
}
function isRealStatedName(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  const t = s.trim();
  if (t.length < 2 || t.length > 40) return false;
  // reject non-names the model might emit when no name was given
  if (/^(unknown|अज्ञात|n\/?a|none|patient|caller|मरीज़|कॉलर)$/i.test(t)) return false;
  return true;
}

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
      patient_callback_message: { type: 'string', description: "Spoken callback for the patient in THEIR language (hi=Devanagari, ta=Tamil — NEVER English, NEVER digits). 2-3 plain warm sentences: the doctor's advice + what to watch for. NO drug names, NO 'diagnosis', no English jargon, no ICD codes. The patient-language twin of Plan." },
      presumptive_screening_label: { type: 'string' },
      differential_list: {
        type: 'array',
        maxItems: 3,
        description: 'RANKED top-3 (most likely first). MO-only shadow differential — never patient-facing.',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            likelihood: { type: 'string', enum: ['high', 'medium', 'low'] },
            confidence: { type: 'number', minimum: 0, maximum: 1, description: 'Calibrated 0-1 confidence for this item' },
            rationale: { type: 'string' },
          },
          required: ['label', 'likelihood'],
        },
      },
      icd10_codes: { type: 'array', maxItems: 3, items: { type: 'string' }, description: 'Codes chosen from the icd10_catalogue only' },
      icd11_codes: { type: 'array', items: { type: 'string' } },
      mo_only_drug_hints: { type: 'array', items: { type: 'string' } },
      esanjeevani_payload: { type: 'object' },
      patient_callback_eta_min: { type: 'integer', minimum: 5, maximum: 720 },
      follow_up_channel: { type: 'string', enum: ['voice', 'whatsapp', 'sms'] },
      investigations_advised: { type: 'array', items: { type: 'string' } },
      // Demographics extracted FROM THE TRANSCRIPT (the patient stated them
      // during the demographic gate). Used to backfill the anonymous patient
      // row. Emit Unknown / omit if the patient never stated it — never guess.
      patient_name: { type: 'string', description: 'The name the patient stated when asked (Stage 2 of the call). Omit entirely if never stated — never guess, never use a placeholder like "caller".' },
      patient_age_years: { type: 'integer', minimum: 0, maximum: 120, description: 'Age the patient stated, else omit' },
      patient_sex: { type: 'string', enum: ['M', 'F', 'Other', 'Unknown'], description: 'Sex the patient stated/implied, else Unknown' },
      patient_pregnancy_status: { type: 'string', enum: ['not_pregnant', 'pregnant', 'postpartum', 'unknown'], description: 'Only if discussed, else unknown' },
    },
    required: [
      'subjective', 'objective', 'assessment', 'plan',
      'presumptive_screening_label', 'patient_callback_eta_min',
      // REQUIRED so the soul callback is ALWAYS in the patient's language —
      // when omitted, vaani-signoff fell back to the English plan body.
      'patient_callback_message',
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

  // ── RAG: ground the SOAP in cited national protocols (additive) ──
  // ADVISORY grounding for the clinician-facing note — adds [doc_id:chunk_id]
  // citations to the assessment/plan. This does NOT touch the triage band
  // (already decided upstream), so it carries none of the triage band-accuracy
  // risk the eval flagged — it's pure additive value for the signing RMP.
  // Embeds in-region (gte-small); query is digit/email-scrubbed.
  let protocolBlock = '';
  if (Deno.env.get('RAG_ENABLED') === 'true') {
    const ragQuery = [
      triage.presumptive_label ?? '',
      (triage.red_flag_categories ?? []).join(' '),
      triage.summary_en ?? '',
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
        content: `${protocolBlock ? protocolBlock + '\n\n' : ''}<context>\n${redactedText}\n</context>\n\nEmit the eSanjeevani SOAP note via emit_soap. Patient preferred language code: "${lang}".`,
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

  // ── Ground the ICD-10 codes against the curated catalogue ──────
  // Claude is constrained by the prompt, but we hard-validate anyway: any
  // off-catalogue code is dropped so the MO chart never carries an invented
  // code. dropped[] is logged as the hallucination signal.
  const icd10 = validateIcd10(soap.icd10_codes);
  if (icd10.dropped.length > 0) {
    console.warn(`[soap-generate] dropped off-catalogue ICD-10 codes for call ${callId}:`, icd10.dropped);
  }

  // ── Normalise the MO-only ranked differential ──────────────────
  // Keep a stable top-3, coerce per-item confidence into 0-1, and sort by
  // confidence (desc) when present so the cockpit renders a true ranking.
  const LIKELIHOOD_WEIGHT: Record<string, number> = { high: 0.9, medium: 0.6, low: 0.3 };
  const differential = (Array.isArray(soap.differential_list) ? soap.differential_list : [])
    .filter((d: any) => d && typeof d.label === 'string' && d.label.trim())
    .map((d: any) => {
      const likelihood = ['high', 'medium', 'low'].includes(d.likelihood) ? d.likelihood : 'medium';
      let conf = Number(d.confidence);
      if (!Number.isFinite(conf) || conf < 0 || conf > 1) conf = LIKELIHOOD_WEIGHT[likelihood];
      return {
        label: String(d.label).trim(),
        likelihood,
        confidence: Math.round(conf * 100) / 100,
        rationale: typeof d.rationale === 'string' ? d.rationale : '',
      };
    })
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3);

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
      icd10_codes: icd10.valid,
      icd11_codes: Array.isArray(soap.icd11_codes) ? soap.icd11_codes : [],
      presumptive_screening_label: String(soap.presumptive_screening_label ?? 'unspecified'),
      differential_list: differential,
      // Audit-§2 fix: persist mo_only_drug_hints (migration 009 added
      // the column). MO-only — never read by vaani-signoff or any
      // patient-facing surface.
      mo_only_drug_hints: Array.isArray(soap.mo_only_drug_hints) ? soap.mo_only_drug_hints : [],
      // Audit §4: persist these too (columns added in migration 010).
      patient_callback_eta_min: typeof soap.patient_callback_eta_min === 'number'
        ? soap.patient_callback_eta_min
        : null,
      safety_net_text: typeof soap.safety_net === 'string' ? soap.safety_net : null,
      // Audit §4: vitals_source was hardcoded NOT_AVAILABLE; honor LLM.
      vitals_source: typeof soap.vitals_source === 'string' ? soap.vitals_source : 'NOT_AVAILABLE',
      vitals_json: typeof soap.vitals === 'object' && soap.vitals !== null ? soap.vitals : {},
      esanjeevani_payload: soap.esanjeevani_payload ?? null,
      lang,
      original_text: JSON.stringify(soap),
      follow_up_channel: soap.follow_up_channel ?? null,
      investigations_advised: Array.isArray(soap.investigations_advised) ? soap.investigations_advised : [],
      patient_callback_message: typeof soap.patient_callback_message === 'string' && soap.patient_callback_message.trim()
        ? soap.patient_callback_message.trim()
        : null,
    })
    .select('id')
    .single();

  if (insertErr) return jsonErr(500, 'insert_failed', insertErr.message);

  // ── Backfill patient demographics from the transcript ──────────
  // Web/PSTN callers start as anonymous rows (age/sex null). The agent
  // captures age/sex/pregnancy in the demographic gate; Claude extracted
  // them above. Fill ONLY currently-null fields so we never overwrite a
  // real pre-existing record. This is why the cockpit showed no age/sex.
  if (call.patient_id) {
    const demoUpdate: Record<string, unknown> = {};
    const exAge = soap.patient_age_years;
    if (patient?.age_years == null && typeof exAge === 'number' && exAge > 0 && exAge <= 120) {
      demoUpdate.age_years = Math.round(exAge);
    }
    const exSex = soap.patient_sex;
    if (patient?.sex == null && typeof exSex === 'string' && ['M', 'F', 'Other'].includes(exSex)) {
      demoUpdate.sex = exSex;
    }
    const exPreg = soap.patient_pregnancy_status;
    if (patient?.pregnancy_status == null && typeof exPreg === 'string' && ['not_pregnant', 'pregnant', 'postpartum'].includes(exPreg)) {
      demoUpdate.pregnancy_status = exPreg;
    }
    // Name: overwrite ONLY a system placeholder ("Anonymous web caller · …")
    // with the name the caller actually stated — so the cockpit shows who
    // called instead of "Anonymous web caller". Never clobber a real name.
    if (isRealStatedName(soap.patient_name) && isPlaceholderName(patient?.full_name)) {
      demoUpdate.full_name = soap.patient_name.trim();
    }
    if (Object.keys(demoUpdate).length > 0) {
      await sb.from('patients').update(demoUpdate).eq('id', call.patient_id)
        .then(() => {}, (e: any) => console.error('[soap-generate] patient demo backfill', e));
    }
  }

  return new Response(JSON.stringify({
    soap_id: inserted.id,
    callback_eta_min: soap.patient_callback_eta_min ?? null,
    presumptive_label: soap.presumptive_screening_label,
    input_tokens: claudeResp.inputTokens,
    output_tokens: claudeResp.outputTokens,
    cached_read: claudeResp.cachedReadTokens,
  }), { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } });
});
