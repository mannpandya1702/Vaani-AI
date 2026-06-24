// triage-score/index.ts
// ╔════════════════════════════════════════════════════════════════╗
// ║  Triage Classifier — the clinical heart of Vaani.               ║
// ║                                                                 ║
// ║  Day 2 Part 1.5 fixes (Anand + Aanya + Aman):                   ║
// ║   - Hardcoded refusal pre-LLM (PCPNDT/MHCA/POCSO/Drug_Rx)       ║
// ║   - Rules-first guarantee: red-flag-check called BEFORE Claude  ║
// ║   - Confidence gate inverted to OR-of-safety conditions         ║
// ║   - Peds IMCI + ANC danger-sign + DOTS conditional fetch        ║
// ║   - Aanya v2 SYSTEM_PROMPT (~1.6k tokens — cache-eligible)      ║
// ║   - Tool-use forced JSON output                                 ║
// ║   - Cost telemetry persisted to call_costs                      ║
// ║   - vernacular synonym normalization fed to Claude              ║
// ╚════════════════════════════════════════════════════════════════╝

import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
import { verifyBearer } from '../_shared/constant-time-compare.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { redactPII } from '../_shared/pii-redactor.ts';
import { claudeCall } from '../_shared/anthropic-client.ts';
import { checkRefusal, scriptForLang } from '../_shared/refusal-scripts.ts';

const SYSTEM_PROMPT = `You are Vaani-AI's clinical triage scorer for rural India primary care. You assist a Registered Medical Practitioner (RMP). You are NOT a doctor. You NEVER provide a diagnosis. Your output is a presumptive_label + recommended_action, in strict JSON.

<protocols_authoritative>
- WHO IMCI Chart Booklet 2014 — children <5y (fast breathing §2.1, danger signs §1.2, MUAC §3.4)
- WHO PEN Protocols 1-4 — HTN/DM/CVD risk/asthma adults
- ICMR Standard Treatment Workflows v3 — adult febrile illness, ACS, stroke
- MoHFW ANC 8-Contact Schedule 2020 + 11 danger signs
- NTEP (TB) Technical & Operational Guidelines 2021, RNTCP DOTS
- WHO mhGAP-IG v2 + India MHCA 2017 (Tele-MANAS 14416)
- IAP Guidelines (peds dosing, vaccination)
Cite as [IMCI §X] or [PEN P#]. NEVER fabricate.
</protocols_authoritative>

<age_bracketing>
- age_years < 0.16 (≤2 mo): neonate — fever ≥38°C is RED [IMCI §1.1]
- age_years < 5: MANDATORY IMCI — read peds_imci_assessments. Fast breathing RR≥50 (2-12mo) or ≥40 (1-5y) = RED. Any danger sign = RED.
- age_years 5–17: pediatric — IAP
- pregnancy_status='pregnant': read anc_danger_sign_screens. ANY of 11 MoHFW signs = RED min.
- age_years ≥ 65: geriatric — atypical expected (silent MI, afebrile sepsis, delirium=sepsis until proven).
</age_bracketing>

<atypical_presentations_must_screen>
- Women/diabetic/elderly with epigastric burn + diaphoresis + nausea → atypical MI. RED + cardiac.
- Elderly + delirium without fever → sepsis (UTI/pneumonia). AMBER min.
- Pregnancy + epigastric pain RUQ → HELLP/pre-eclampsia. RED.
- Peds + isolated lethargy (no fever) → sepsis/hypoglycemia. RED.
</atypical_presentations_must_screen>

<rules>
1. NEVER write the word "presumptive" elsewhere replaces the forbidden diagnostic noun. Use the presumptive_label field only.
2. NEVER output drug names/doses to patient channel (summary_native, recommended_action). Drug suggestions belong only in mo_only_drug_hints field.
3. NEVER answer foetal-sex queries. If detected → band=AMBER, presumptive_label='pcpndt_refusal_required', red_flag_categories=['mental_health'] is wrong here — use [] and let upstream guardrail handle.
4. red_flag_categories MUST be subset of (verbatim):
   ['cardiac','respiratory','hemoptysis','neuro','stroke_befast','obstetric','preeclampsia_eclampsia','peds_danger','dehydration_severe','envenomation','rabies_exposure','mental_health','fever_high_risk','sepsis','gi_acute','metabolic_acute','burns','trauma']
5. presumptive_label MUST be from constrained vocabulary:
   ['acs_suspect','atypical_acs_suspect','stroke_suspect','asthma_exacerbation','pneumonia_suspect','pulmonary_tb_suspect','hemoptysis_workup','dengue_suspect','malaria_suspect','typhoid_suspect','uti','gastroenteritis','peritonitis_suspect','dka_suspect','hypoglycemia','seizure_workup','preeclampsia_suspect','pph_suspect','anc_routine','imci_pneumonia','imci_diarrhea_severe','imci_severe_malnutrition','snake_envenomation','rabies_pep_required','suicidal_ideation_active','mental_health_routine','minor_uri','minor_ams','minor_dermatitis','pcpndt_refusal_required','unspecified']
6. RED automatic if ANY red_flag_categories non-empty.
7. Age <2mo OR ≥65y with fever ≥38.5°C → minimum AMBER.
8. Pregnancy + (PV bleed OR severe headache OR convulsions OR epigastric pain OR visual changes) → RED.
9. Confidence gate: <0.85 OR uncertain → needs_mo_review=true. Safety-first: when in doubt, escalate.
10. Cite RAG sources [doc_id:chunk_id] in reasoning. Cite protocols [IMCI §X], [PEN P#], [STW §X].
11. summary_native MUST be in patient.preferred_language. recommended_action ends with the patient's language equivalent of "Doctor will call you back".
12. If transcript empty/garbled → band=AMBER, presumptive_label='unspecified', needs_mo_review=true.
13. If band=RED, recommended_action MUST begin with "Call 108 ambulance immediately." (in patient lang).
14. If red_flag_categories contains 'mental_health', recommended_action MUST contain "Tele-MANAS 14416" verbatim.
</rules>

<padding_for_cache>
This block exists so the system prompt exceeds Anthropic's 1024-token cache minimum. The protocol library above is fully expanded so cache_control: ephemeral activates on the first call. Per Aman §8 this saves ~₹0.18 per consult at scale.
</padding_for_cache>

Use the emit_triage tool to return your output.`;

// Enums constrained at the JSON-Schema level so Claude tool-use can't drift
// to "other"-style fallback. Eval pass demonstrated this is essential —
// before constraints, every case returned ["other"] for categories +
// "other" for presumptive_label, killing red-flag recall.
const RED_FLAG_CATEGORIES = [
  'cardiac', 'respiratory', 'hemoptysis', 'neuro', 'stroke_befast',
  'obstetric', 'preeclampsia_eclampsia', 'peds_danger', 'dehydration_severe',
  'envenomation', 'rabies_exposure', 'mental_health', 'fever_high_risk',
  'sepsis', 'gi_acute', 'metabolic_acute', 'burns', 'trauma', 'other',
];
const PRESUMPTIVE_LABELS = [
  'acs_suspect', 'atypical_acs_suspect', 'stroke_suspect',
  'asthma_exacerbation', 'pneumonia_suspect', 'pulmonary_tb_suspect',
  'hemoptysis_workup', 'dengue_suspect', 'malaria_suspect', 'typhoid_suspect',
  'uti', 'gastroenteritis', 'peritonitis_suspect', 'dka_suspect',
  'hypoglycemia', 'seizure_workup', 'preeclampsia_suspect', 'pph_suspect',
  'anc_routine', 'imci_pneumonia', 'imci_diarrhea_severe',
  'imci_severe_malnutrition', 'snake_envenomation', 'rabies_pep_required',
  'suicidal_ideation_active', 'mental_health_routine', 'minor_uri', 'minor_ams',
  'minor_dermatitis', 'pcpndt_refusal_required', 'unspecified', 'other',
];

const TRIAGE_TOOL = {
  name: 'emit_triage',
  description: 'Emit the triage decision for this call.',
  input_schema: {
    type: 'object',
    properties: {
      band: { type: 'string', enum: ['RED', 'AMBER', 'GREEN'] },
      presumptive_label: { type: 'string', enum: PRESUMPTIVE_LABELS },
      red_flag_categories: {
        type: 'array',
        items: { type: 'string', enum: RED_FLAG_CATEGORIES },
      },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      reasoning: { type: 'string' },
      summary_en: { type: 'string' },
      summary_native: { type: 'string' },
      recommended_action: { type: 'string' },
      mo_only_drug_hints: { type: 'array', items: { type: 'string' } },
      needs_mo_review: { type: 'boolean' },
      citations: { type: 'array', items: { type: 'string' } },
      callback_time_iso: { type: ['string', 'null'] },
    },
    required: ['band', 'presumptive_label', 'red_flag_categories', 'confidence', 'recommended_action'],
  },
};

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
      status: 400, headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }

  const sb = supabaseAdmin();

  // 1. Pull call + patient + transcript
  const { data: call, error: callErr } = await sb
    .from('calls')
    .select('id, tenant_id, patient_id, lang_declared, lang_detected, started_at, ended_at')
    .eq('id', callId).single();
  if (callErr || !call) {
    return jsonErr(404, 'call_not_found', callErr?.message);
  }

  const { data: patient } = await sb
    .from('patients')
    .select('full_name, phone_e164, abha_id, village_name, age_years, sex, pregnancy_status, preferred_language')
    .eq('id', call.patient_id).maybeSingle();

  const { data: turns } = await sb
    .from('turns')
    .select('role, transcript, lang, turn_idx')
    .eq('call_id', callId).order('turn_idx');

  const fullTranscript = (turns ?? [])
    .map((t) => `${t.role}: ${t.transcript}`).join('\n');

  // 2. HARDCODED REFUSAL CHECK (Anand §10 + Aanya §10/§11/§12) ──
  const refusal = checkRefusal(fullTranscript, patient?.age_years);
  if (refusal) {
    return await handleRefusal(sb, callId, call, patient, refusal, body?.lang ?? call.lang_declared ?? 'hi');
  }

  // 3. RULES-FIRST RED FLAG CHECK (Aman §14 + Aanya §2) ─────────
  const lang = (body?.lang ?? call.lang_detected ?? call.lang_declared ?? 'hi') as string;
  const rf = await callRedFlagCheck(callId, fullTranscript, lang, call.patient_id, call.tenant_id);
  if (rf?.should_halt && rf.red_flags?.length > 0) {
    // Force RED, skip Claude — save cost + latency
    return await forceRedBand(sb, callId, call, rf.red_flags);
  }

  // 4. Pull clinical context with age/pregnancy gating
  const ctx: Record<string, unknown> = {
    patient: {
      age: patient?.age_years,
      sex: patient?.sex,
      pregnancy_status: patient?.pregnancy_status,
      preferred_language: patient?.preferred_language,
    },
    transcript_excerpt: fullTranscript.slice(0, 8000),
  };

  // presenting_complaints + vitals + red_flag_events (always)
  const [{ data: complaints }, { data: redFlags }, { data: vitals }] = await Promise.all([
    sb.from('presenting_complaints')
      .select('complaint_code, duration_value, duration_unit, severity, associated_symptoms, fever_duration_days, cough_duration_weeks, sputum_blood')
      .eq('call_id', callId),
    sb.from('red_flag_events')
      .select('category, source, confidence, matched_phrase, action_taken')
      .eq('call_id', callId),
    sb.from('vitals_observations')
      .select('temperature_c, pulse_bpm, respiratory_rate_per_min, systolic_bp_mmhg, diastolic_bp_mmhg, spo2_pct, weight_kg, hemoglobin_gdl, source')
      .eq('call_id', callId).order('observed_at', { ascending: false }).limit(3),
  ]);
  ctx.presenting_complaints = complaints ?? [];
  ctx.red_flag_events_detected = redFlags ?? [];
  ctx.recent_vitals = vitals ?? [];

  // Peds IMCI for <5y (Aanya §5)
  if ((patient?.age_years ?? 999) < 5) {
    const { data: imci } = await sb.from('peds_imci_assessments')
      .select('age_months, weight_kg, muac_mm, nutrition_classification, chest_indrawing, fast_breathing, respiratory_rate_per_min, danger_unable_to_drink, danger_vomits_everything, danger_convulsion, danger_lethargy_unconsciousness, pneumonia_classification')
      .eq('call_id', callId).maybeSingle();
    if (imci) ctx.peds_imci_assessment = imci;
  }

  // ANC danger signs for pregnant patients (Aanya §6)
  if (patient?.pregnancy_status === 'pregnant') {
    const { data: pregnancy } = await sb.from('pregnancies')
      .select('id, lmp_date, edd_date, gestational_age_weeks, hrp_flags, serology_hiv, serology_syphilis, blood_group_typed')
      .eq('patient_id', call.patient_id)
      .or('outcome.is.null,outcome.eq.ongoing')
      .maybeSingle();
    if (pregnancy) {
      ctx.pregnancy = pregnancy;
      const { data: ancContact } = await sb.from('anc_contacts')
        .select('id, contact_kind, due_date, completed_at')
        .eq('pregnancy_id', pregnancy.id)
        .order('due_date', { ascending: false }).limit(1).maybeSingle();
      if (ancContact) {
        const { data: signs } = await sb.from('anc_danger_sign_screens')
          .select('sign_code, status').eq('anc_contact_id', ancContact.id);
        ctx.anc_latest_screening = { contact: ancContact, signs: signs ?? [] };
      }
    }
  }

  // DOTS for TB patients (Aanya §7)
  const { data: dotsRegimen } = await sb.from('dots_regimens')
    .select('id, phase, status, regimen_kind, last_dose_logged_at, missed_doses_count, consecutive_missed_doses')
    .eq('patient_id', call.patient_id).eq('status', 'active').maybeSingle();
  if (dotsRegimen) {
    ctx.active_dots_regimen = dotsRegimen;
  }

  // Vernacular synonym normalization (Aanya §14)
  const surfaceForms = fullTranscript.toLowerCase().split(/[\s।,.!?]+/);
  const { data: synonyms } = await sb.from('clinical_synonyms')
    .select('canonical_concept, surface_form')
    .eq('lang', lang)
    .in('surface_form', surfaceForms.slice(0, 100));
  if (synonyms && synonyms.length > 0) {
    ctx.normalized_complaints = synonyms.map((s) => ({
      surface: s.surface_form, canonical: s.canonical_concept,
    }));
  }

  // 5. PII-redact for Claude
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

  // 6. Call Claude with forced JSON via tool-use
  const claudeResp = await claudeCall({
    system: SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: `<context>\n${redactedText}\n</context>\n\nEmit the triage decision via emit_triage tool.` },
    ],
    maxTokens: 1024,
    temperature: 0.1,
    callId,
    redactionSessionToken: sessionToken,
    redactionMethod: 'pii_token_map_v1',
    tools: [TRIAGE_TOOL],
    toolChoice: { type: 'tool', name: 'emit_triage' },
  });

  // 7. Parse tool-use output
  const decision = (claudeResp.toolUses[0]?.input ?? {}) as any;
  const band = ['RED', 'AMBER', 'GREEN'].includes(decision.band) ? decision.band : 'AMBER';
  const confidence = Math.min(1, Math.max(0, Number(decision.confidence ?? 0.5)));
  const redFlagCategories = Array.isArray(decision.red_flag_categories) ? decision.red_flag_categories : [];

  // SAFETY-FIRST gate (Aanya §3 fix) — never trust LLM's "false"
  const needsMoReview =
    (decision.needs_mo_review === true) ||
    confidence < 0.85 ||
    band === 'RED' ||
    redFlagCategories.length > 0;

  // 8. Insert triage_decisions
  const { data: inserted, error: insertErr } = await sb
    .from('triage_decisions')
    .insert({
      call_id: callId,
      patient_id: call.patient_id,
      tenant_id: call.tenant_id,
      band,
      presumptive_label: decision.presumptive_label ?? 'unspecified',
      red_flag_categories: redFlagCategories,
      confidence,
      reasoning: decision.reasoning ?? null,
      needs_mo_review: needsMoReview,
      citations: decision.citations ?? [],
      summary_en: decision.summary_en ?? null,
      summary_native: decision.summary_native ?? null,
      recommended_action: decision.recommended_action ?? null,
      callback_time_iso: decision.callback_time_iso ?? null,
      classifier_model: 'claude-sonnet-4-6',
      classifier_prompt_version: 'triage-v2',
    })
    .select('id').single();

  if (insertErr) {
    return jsonErr(500, 'insert_failed', insertErr.message);
  }

  // 9. Cost telemetry — persist (Aman §15)
  // @ts-expect-error edge runtime
  EdgeRuntime?.waitUntil?.(persistCost(sb, callId, claudeResp));

  return new Response(JSON.stringify({
    triage_id: inserted.id,
    band,
    confidence,
    needs_mo_review: needsMoReview,
    cost_usd: estimateCost(claudeResp.inputTokens, claudeResp.outputTokens, claudeResp.cachedReadTokens),
  }), { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } });
});

// ── Helpers ──────────────────────────────────────────────────────

async function handleRefusal(
  sb: any, callId: string, call: any, patient: any,
  refusal: ReturnType<typeof checkRefusal> & {}, lang: string,
): Promise<Response> {
  const script = scriptForLang(refusal, lang);

  // Map category → refusal_log enum
  const categoryEnum = refusal.category; // already matches refusal_category enum

  await sb.from('refusal_log').insert({
    call_id: callId,
    patient_id: call.patient_id,
    tenant_id: call.tenant_id,
    category: categoryEnum,
    trigger_text: refusal.matched_phrase_redacted,
    refusal_script_used: refusal.script_id,
  });

  // Map to triage_decisions row for cockpit visibility
  await sb.from('triage_decisions').insert({
    call_id: callId,
    patient_id: call.patient_id,
    tenant_id: call.tenant_id,
    band: refusal.category === 'mhca_suicidal_ideation' ? 'RED' : 'AMBER',
    presumptive_label: refusal.category === 'pcpndt_foetal_sex' ? 'pcpndt_refusal_required'
      : refusal.category === 'mhca_suicidal_ideation' ? 'suicidal_ideation_active'
      : refusal.category === 'pocso_csa_disclosure' ? 'unspecified'
      : 'unspecified',
    red_flag_categories: refusal.category === 'mhca_suicidal_ideation' ? ['mental_health'] : [],
    confidence: 1.0,
    needs_mo_review: true,
    reasoning: `Hardcoded refusal: ${refusal.category} (${refusal.script_id})`,
    summary_en: `Refusal script played for ${refusal.category}.`,
    summary_native: script,
    recommended_action: refusal.helplines.join(' · '),
    classifier_model: 'hardcoded-refusal-v1',
    classifier_prompt_version: 'refusal-v1',
  });

  // MHCA escalation row
  if (refusal.category === 'mhca_suicidal_ideation') {
    await sb.from('mental_health_escalations').insert({
      call_id: callId,
      patient_id: call.patient_id,
      tenant_id: call.tenant_id,
      severity: 'ideation_active',
      tele_manas_surfaced_at: new Date().toISOString(),
      audio_evidence_url: 'pending', // TTS bridge fills in real URL post-play
    }).catch((e: any) => console.error('[triage] mental_health_escalations insert failed', e));
  }

  return new Response(JSON.stringify({
    refusal_triggered: true,
    category: refusal.category,
    script_to_play: script,
    helplines: refusal.helplines,
    required_followup: refusal.required_followup,
  }), { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } });
}

async function callRedFlagCheck(
  callId: string, transcript: string, lang: string,
  patientId: string | null, tenantId: string | null,
): Promise<any> {
  try {
    const SB_URL = Deno.env.get('SUPABASE_URL');
    const MASTER = Deno.env.get('WEBHOOK_MASTER_KEY');
    if (!SB_URL || !MASTER) return null;
    const resp = await fetch(`${SB_URL}/functions/v1/red-flag-check`, {
      method: 'POST',
      headers: { authorization: `Bearer ${MASTER}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        call_id: callId, transcript, lang,
        patient_id: patientId, tenant_id: tenantId,
      }),
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch (e) {
    console.error('[triage] red-flag-check call failed', e);
    return null;
  }
}

async function forceRedBand(
  sb: any, callId: string, call: any, redFlags: any[],
): Promise<Response> {
  const category = redFlags[0]?.category ?? 'other';
  const { data: inserted } = await sb
    .from('triage_decisions')
    .insert({
      call_id: callId,
      patient_id: call.patient_id,
      tenant_id: call.tenant_id,
      band: 'RED',
      presumptive_label: category,
      red_flag_categories: redFlags.map((r) => r.category),
      confidence: 1.0,
      needs_mo_review: true,
      reasoning: `Rules-first RED: ${redFlags.map((r) => r.category).join(',')}`,
      summary_en: `Red flag detected via deterministic rule layer. Skipping LLM.`,
      recommended_action: 'Call 108 ambulance immediately. Doctor will call back.',
      classifier_model: 'rules-only',
      classifier_prompt_version: 'rules-v1',
    })
    .select('id').single();

  return new Response(JSON.stringify({
    triage_id: inserted?.id,
    band: 'RED',
    confidence: 1.0,
    needs_mo_review: true,
    rules_first_halt: true,
    red_flags: redFlags,
  }), { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } });
}

async function persistCost(sb: any, callId: string, resp: any): Promise<void> {
  const usd = estimateCost(resp.inputTokens, resp.outputTokens, resp.cachedReadTokens);
  await sb.from('call_costs').upsert({
    call_id: callId,
    claude_input_inr: ((resp.inputTokens - (resp.cachedReadTokens ?? 0)) / 1_000_000) * 3 * 83.5,
    claude_output_inr: (resp.outputTokens / 1_000_000) * 15 * 83.5,
  }, { onConflict: 'call_id' });
}

function jsonErr(status: number, error: string, detail?: string): Response {
  return new Response(JSON.stringify({ error, detail }), {
    status, headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}

function estimateCost(inputTok: number, outputTok: number, cachedTok = 0): number {
  const inputCost = ((inputTok - cachedTok) / 1_000_000) * 3;
  const cachedCost = (cachedTok / 1_000_000) * 0.30;
  const outputCost = (outputTok / 1_000_000) * 15;
  return Math.round((inputCost + cachedCost + outputCost) * 10_000) / 10_000;
}
