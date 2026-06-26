// eval/seed-demo.ts
// ╔══════════════════════════════════════════════════════════════════╗
// ║  One-shot demo seed for the Cockpit. Idempotent: wipes the       ║
// ║  __demo_cockpit__ tenant's rows first, then inserts 4 cases:      ║
// ║                                                                   ║
// ║   1. RED, UNSIGNED   — classical ACS, 65yo male (pulsing card)    ║
// ║   2. RED, SIGNED     — stroke BE-FAST, 58yo male (soul callback)  ║
// ║   3. AMBER           — dengue suspect, 35yo male                  ║
// ║   4. GREEN           — URI, 28yo female                           ║
// ║                                                                   ║
// ║  Usage (from /home/user/Vaani-AI):                                ║
// ║    set -a && . ./.env.local && set +a && \                        ║
// ║    deno run --allow-env --allow-net eval/seed-demo.ts              ║
// ║                                                                   ║
// ║  After running, the Cockpit at /cockpit shows 4 cards immediately.║
// ╚══════════════════════════════════════════════════════════════════╝

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env');
  Deno.exit(2);
}

const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const DEMO_TENANT_NAME = '__demo_cockpit__';

async function ensureTenant(): Promise<string> {
  const { data: existing } = await sb
    .from('tenants').select('id').eq('name', DEMO_TENANT_NAME).maybeSingle();
  if (existing) return existing.id;
  const { data, error } = await sb.from('tenants').insert({
    name: DEMO_TENANT_NAME,
    level: 'demo',
    tenant_path: 'demo',
    timezone: 'Asia/Kolkata',
    preferred_language: 'hi',
  }).select('id').single();
  if (error) throw new Error(`tenant insert: ${error.message}`);
  return data.id;
}

async function wipe(tenantId: string) {
  const { data: prevCalls } = await sb.from('calls').select('id').eq('tenant_id', tenantId);
  const { data: prevPatients } = await sb.from('patients').select('id').eq('tenant_id', tenantId);
  const callIds = (prevCalls ?? []).map((c) => c.id);
  const patientIds = (prevPatients ?? []).map((p) => p.id);
  if (callIds.length > 0) {
    await sb.from('turns').delete().in('call_id', callIds);
    await sb.from('triage_decisions').delete().in('call_id', callIds);
    await sb.from('soap_notes').delete().in('call_id', callIds);
    await sb.from('pii_token_map').delete().in('call_id', callIds);
    await sb.from('cross_border_transfers').delete().in('call_id', callIds);
    await sb.from('call_costs').delete().in('call_id', callIds);
    await sb.from('call_dispatch_queue').delete().in('patient_id', patientIds);
    await sb.from('calls').delete().in('id', callIds);
  }
  if (patientIds.length > 0) await sb.from('patients').delete().in('id', patientIds);
}

// ─── Case spec ────────────────────────────────────────────────
type Sex = 'M' | 'F' | 'Other' | 'Unknown';
type Band = 'RED' | 'AMBER' | 'GREEN';

interface Spec {
  full_name: string;
  age_years: number;
  sex: Sex;
  village: string;
  preferred_language: 'hi' | 'ta' | 'en';
  minutes_ago: number;          // when the call ended
  band: Band;
  presumptive_label: string;
  red_flag_categories: string[];
  confidence: number;
  reasoning: string;
  summary_en: string;
  summary_native: string;
  recommended_action: string;
  soap: {
    subjective: string;
    objective: string;
    assessment: string;
    plan: string;
    presumptive_screening_label: string;
    differential_list: { label: string; likelihood: string; rationale?: string }[];
    icd10: string[];
    icd11: string[];
  };
  sign_now?: boolean;           // mark this SOAP signed
}

const SPECS: Spec[] = [
  {
    full_name: 'Rajesh Yadav',
    age_years: 65, sex: 'M', village: 'Bagdogra',
    preferred_language: 'hi',
    minutes_ago: 2,
    band: 'RED',
    presumptive_label: 'acs_suspect',
    red_flag_categories: ['cardiac'],
    confidence: 0.96,
    reasoning: 'Crushing retrosternal pain >30 min, diaphoresis, left-arm radiation. Classic ACS pattern in a 65-year-old male.',
    summary_en: 'Crushing chest pain ≥30 min radiating to left arm. Sweating. Suspect ACS — call 108, give chewable aspirin if no allergy.',
    summary_native: 'सीने में ज़ोर का दर्द आधे घंटे से, बायें हाथ तक जा रहा है, पसीना बहुत आ रहा है। दिल का दौरा हो सकता है — तुरंत 108 बुलाइए।',
    recommended_action: 'Call 108. Chewable aspirin 300 mg if no allergy. ECG within 10 min. Stay with patient.',
    soap: {
      subjective: 'सीने के बीच में भारी दबाव जैसा दर्द, करीब 30-40 मिनट से। पसीना बहुत आ रहा है। बायें हाथ में भी दर्द है। एक बार उल्टी हुई।',
      objective: 'Age 65, male. BP not recorded at site. ASHA reports patient is diaphoretic, anxious, ambulatory but uncomfortable.',
      assessment: 'Presumptive ACS in a 65-year-old male — classic pattern (retrosternal pressure, diaphoresis, left-arm radiation, vomiting). Time-critical.',
      plan: 'Immediate 108 dispatch. Chewable aspirin 300 mg if no contraindication. ECG within 10 minutes of PHC arrival. Continuous monitoring. Inform family.',
      presumptive_screening_label: 'acs_suspect',
      differential_list: [
        { label: 'ACS / NSTEMI', likelihood: 'high', rationale: 'Classic pattern + age + diaphoresis' },
        { label: 'Aortic dissection', likelihood: 'low', rationale: 'No tearing quality, no back radiation reported' },
        { label: 'GERD', likelihood: 'very low', rationale: 'Severity + duration + sweating make this unlikely' },
      ],
      icd10: ['I20.0', 'I21.9'],
      icd11: ['BA40', 'BA41'],
    },
  },
  {
    full_name: 'Mohan Singh',
    age_years: 58, sex: 'M', village: 'Saharanpur',
    preferred_language: 'hi',
    minutes_ago: 18,
    band: 'RED',
    presumptive_label: 'stroke_suspect',
    red_flag_categories: ['neuro'],
    confidence: 0.94,
    reasoning: 'Sudden onset facial droop + right-arm weakness + slurred speech, 45 minutes ago. BE-FAST positive on three signs. Within thrombolysis window.',
    summary_en: 'Sudden facial droop, right-arm weakness, slurred speech 45 min ago. BE-FAST positive. Thrombolysis window — call 108 now.',
    summary_native: 'अचानक चेहरा एक तरफ झुक गया, दाहिना हाथ कमज़ोर है, बोली लड़खड़ा रही है — 45 मिनट पहले शुरू हुआ। तुरंत 108 बुलाइए, बड़े अस्पताल ले जाइए।',
    recommended_action: 'Call 108 immediately. Note exact time of onset. Do NOT give food or water. Transport to nearest stroke-ready hospital.',
    soap: {
      subjective: 'मरीज़ के बेटे का कहना है कि 45 मिनट पहले अचानक चेहरा एक तरफ़ झुक गया। दाहिना हाथ उठा नहीं पा रहे। बोलने में दिक्कत है — शब्द साफ़ नहीं आ रहे।',
      objective: 'Age 58, male. BE-FAST positive (Balance unsteady, Eye normal, Face droop right, Arm drift right, Speech slurred, Time of onset 45 min ago).',
      assessment: 'Acute ischemic stroke — left MCA territory most likely. Within thrombolysis window if PHC can dispatch to stroke-ready centre quickly.',
      plan: 'Call 108. NPO. Note exact onset time. Transport to nearest stroke-ready hospital (Saharanpur Civil). Inform family. Do not give aspirin until imaging.',
      presumptive_screening_label: 'stroke_suspect',
      differential_list: [
        { label: 'Acute ischemic stroke (left MCA)', likelihood: 'high', rationale: 'BE-FAST positive + acute onset' },
        { label: 'Hemorrhagic stroke', likelihood: 'moderate', rationale: 'Cannot distinguish without imaging' },
        { label: "Bell's palsy", likelihood: 'low', rationale: 'Limb involvement makes this unlikely' },
      ],
      icd10: ['I63.9'],
      icd11: ['8B11'],
    },
    sign_now: true,
  },
  {
    full_name: 'Pradeep Sharma',
    age_years: 35, sex: 'M', village: 'Aligarh',
    preferred_language: 'hi',
    minutes_ago: 32,
    band: 'AMBER',
    presumptive_label: 'dengue_suspect',
    red_flag_categories: [],
    confidence: 0.78,
    reasoning: '3-day high fever + severe retro-orbital pain + body ache. No bleeding, no danger signs yet. Local dengue outbreak underway — high pretest probability.',
    summary_en: '3 days of fever + severe body ache + retro-orbital pain. No bleeding/no danger signs. Suspect dengue — send for CBC + NS1 today.',
    summary_native: 'तीन दिन से तेज़ बुख़ार, बहुत बदन दर्द, आँखों के पीछे दर्द। कोई खून नहीं आ रहा। डेंगू की जाँच के लिए आज ही CBC और NS1 करवाइए।',
    recommended_action: 'Same-day CBC + NS1 antigen. ORS + paracetamol. NO ibuprofen, NO aspirin. Watch for bleeding, severe abdominal pain, persistent vomiting — then ER.',
    soap: {
      subjective: 'तीन दिन से बुख़ार है, 102-103 के आसपास रहता है। बहुत बदन दर्द है, खासकर पीठ और जोड़ों में। आँखों के पीछे दर्द। एक बार उल्टी हुई कल।',
      objective: 'Age 35, male. Self-reported temp 102-103°F intermittent. No rash. No bleeding. No abdominal tenderness reported by ASHA.',
      assessment: 'Presumptive dengue (NS1 + CBC pending). Currently AMBER — no warning signs but local outbreak elevates pretest probability.',
      plan: 'Send for same-day CBC + NS1 antigen. Paracetamol 500 mg q6h PRN fever. ORS sips. Avoid NSAIDs and aspirin. Daily ASHA check. Return if bleeding gums, black stools, severe abdominal pain, persistent vomiting.',
      presumptive_screening_label: 'dengue_suspect',
      differential_list: [
        { label: 'Dengue fever', likelihood: 'high', rationale: 'Triad of fever + retro-orbital pain + myalgia + local outbreak' },
        { label: 'Malaria', likelihood: 'moderate', rationale: 'Same geography, cannot rule out without smear' },
        { label: 'Typhoid', likelihood: 'low', rationale: 'No GI prodrome, no rose spots reported' },
      ],
      icd10: ['A90'],
      icd11: ['1D2Z'],
    },
  },
  {
    full_name: 'Sunita Kumari',
    age_years: 28, sex: 'F', village: 'Hapur',
    preferred_language: 'hi',
    minutes_ago: 48,
    band: 'GREEN',
    presumptive_label: 'uri',
    red_flag_categories: [],
    confidence: 0.88,
    reasoning: '2-day mild URI — nasal congestion, mild sore throat, no fever, no breathing difficulty, eating-drinking well. Self-limiting.',
    summary_en: '2-day mild cold. No fever, no breathing trouble, eating well. Self-care + ASHA check tomorrow.',
    summary_native: 'दो दिन से हल्की सर्दी-ज़ुकाम है। बुख़ार नहीं है, साँस ठीक है, खाना-पीना चल रहा है। आराम कीजिए — कल आशा दीदी फिर पूछेंगी।',
    recommended_action: 'Steam inhalation + warm fluids + rest. Paracetamol PRN if fever develops. ASHA telephone check in 24h. Return if fever >38.5°C, breathing difficulty, ear pain.',
    soap: {
      subjective: 'दो दिन से नाक बह रही है, हल्का गले में खराश है। बुख़ार नहीं है। थोड़ा थकान है। खाना-पीना ठीक है।',
      objective: 'Age 28, female. Afebrile. No respiratory distress reported. ASHA notes patient was conversational throughout the call.',
      assessment: 'Viral upper respiratory infection — uncomplicated. GREEN band. Self-limiting in 5-7 days.',
      plan: 'Symptomatic care: steam inhalation 2x/day, warm fluids, salt-water gargle, rest. Paracetamol 500 mg PRN if fever. ASHA tele-follow-up in 24 hours. Return immediately if fever >38.5°C, shortness of breath, ear pain, or symptoms worsen after day 4.',
      presumptive_screening_label: 'uri',
      differential_list: [
        { label: 'Viral URI', likelihood: 'high', rationale: 'Classic 2-day mild prodrome, no red flags' },
        { label: 'Allergic rhinitis', likelihood: 'low', rationale: 'No prior history mentioned' },
      ],
      icd10: ['J06.9'],
      icd11: ['CA07.Z'],
    },
  },
];

async function seedOne(tenantId: string, spec: Spec) {
  const startedAt = new Date(Date.now() - (spec.minutes_ago + 4) * 60 * 1000).toISOString();
  const endedAt = new Date(Date.now() - spec.minutes_ago * 60 * 1000).toISOString();

  // Patient
  const { data: patient, error: pErr } = await sb.from('patients').insert({
    tenant_id: tenantId,
    full_name: spec.full_name,
    phone_e164: `+9190000${String(Math.floor(Math.random() * 100000)).padStart(5, '0')}`,
    age_years: spec.age_years,
    sex: spec.sex,
    preferred_language: spec.preferred_language,
    pregnancy_status: 'not_pregnant',
    village_name: spec.village,
  }).select('id').single();
  if (pErr) throw new Error(`patient ${spec.full_name}: ${pErr.message}`);

  // Call
  const { data: call, error: cErr } = await sb.from('calls').insert({
    tenant_id: tenantId,
    patient_id: patient.id,
    channel: 'voice',
    outcome: 'completed',
    started_at: startedAt,
    ended_at: endedAt,
    duration_seconds: 240,
    lang_declared: spec.preferred_language,
    lang_detected: spec.preferred_language,
  }).select('id').single();
  if (cErr) throw new Error(`call ${spec.full_name}: ${cErr.message}`);

  // Triage decision
  const { error: tErr } = await sb.from('triage_decisions').insert({
    call_id: call.id,
    patient_id: patient.id,
    tenant_id: tenantId,
    band: spec.band,
    presumptive_label: spec.presumptive_label,
    red_flag_categories: spec.red_flag_categories,
    confidence: spec.confidence,
    reasoning: spec.reasoning,
    summary_en: spec.summary_en,
    summary_native: spec.summary_native,
    recommended_action: spec.recommended_action,
    needs_mo_review: spec.band !== 'GREEN',
    classifier_model: 'claude-sonnet-4-6',
    classifier_prompt_version: 'v1.3.0',
    created_at: endedAt,
  });
  if (tErr) throw new Error(`triage ${spec.full_name}: ${tErr.message}`);

  // SOAP note
  const { error: sErr } = await sb.from('soap_notes').insert({
    call_id: call.id,
    patient_id: patient.id,
    tenant_id: tenantId,
    subjective: spec.soap.subjective,
    objective: spec.soap.objective,
    assessment: spec.soap.assessment,
    plan: spec.soap.plan,
    presumptive_screening_label: spec.soap.presumptive_screening_label,
    differential_list: spec.soap.differential_list,
    icd10_codes: spec.soap.icd10,
    icd11_codes: spec.soap.icd11,
    lang: spec.preferred_language,
    mo_signed_at: spec.sign_now ? endedAt : null,
    mo_user_id: spec.sign_now ? null : null,
    generated_at: endedAt,
  });
  if (sErr) throw new Error(`soap ${spec.full_name}: ${sErr.message}`);

  console.log(`  ✓ ${spec.band.padEnd(5)} · ${spec.full_name.padEnd(20)} · ${spec.presumptive_label}${spec.sign_now ? '  (signed)' : ''}`);
}

async function main() {
  console.log('Seeding demo cockpit data…');
  const tenantId = await ensureTenant();
  console.log(`  tenant: ${tenantId}`);
  await wipe(tenantId);
  console.log('  wiped previous demo rows');
  for (const s of SPECS) await seedOne(tenantId, s);
  console.log();
  console.log(`Seeded ${SPECS.length} cases. Reload /cockpit to see them.`);
}

main().catch((e) => {
  console.error(e);
  Deno.exit(1);
});
