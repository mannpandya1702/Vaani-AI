-- ════════════════════════════════════════════════════════════════
-- Vaani-AI Migration 002 — REDLINES COMBINED
-- Authors: Aman + Aanya + Anand (synthesised by the Board, 2026-06-23)
--
-- Addresses 31 distinct BLOCKERs across the three board reviews:
--   • Aman §1-15 (architecture/perf/RLS-prep/cost/eval/observability)
--   • Aanya §1-14 (clinical surface: complaints, vitals, peds IMCI, drugs,
--                  pregnancy serology, MHCA, DOTS AE, pilot safety, audit)
--   • Anand §1-16 (DPDP s.5/6/9, CERT-In 6h, cross-border, RMP identity,
--                  retention, Rx co-sign, PCPNDT/MHCA/POCSO chains, DLT)
--
-- Layout:
--   PART A: Enum extensions
--   PART B: New tables — Legal/Regulatory chain (DPDP/CERT-In/cross-border)
--   PART C: New tables — Outbound (RMP snapshot + DLT)
--   PART D: New tables — Clinical extensions (Aanya)
--   PART E: New tables — Pilot safety + audit
--   PART F: New tables — Architecture (chat, audio catalog, eval cases)
--   PART G: ALTER existing tables (columns + retention_until + CHECKs)
--   PART H: Schema fixes (Aman §1, §7) — FK + index + helper renames
--   PART I: Functions + triggers (pilot halt, consent revocation, etc)
--   PART J: Comments
-- ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
-- PART A: ENUM EXTENSIONS
-- ════════════════════════════════════════════════════════════════

-- Aanya §2 — distinguish red-flag analytics
alter type red_flag_category add value if not exists 'stroke_befast';
alter type red_flag_category add value if not exists 'preeclampsia_eclampsia';
alter type red_flag_category add value if not exists 'rabies_exposure';
alter type red_flag_category add value if not exists 'hemoptysis';
alter type red_flag_category add value if not exists 'fever_high_risk';

-- Anand §2 — withdrawal channels for consent_withdrawal_requests
create type withdrawal_channel as enum (
  'ivr', 'whatsapp', 'sms_stop', 'asha_in_person', 'grievance_email', 'web_portal'
);
create type withdrawal_status as enum (
  'received', 'verified', 'processing', 'completed', 'rejected'
);

-- Anand §4 — Data Subject Request types (DPDP Rule 12)
create type dsr_type as enum (
  'access', 'correction', 'erasure', 'nominee', 'grievance', 'portability'
);
create type dsr_status as enum (
  'received', 'verified', 'in_progress', 'fulfilled', 'rejected', 'partially_fulfilled'
);

-- Anand §5 — breach scope class
create type breach_scope_class as enum (
  'confidentiality', 'integrity', 'availability', 'combined'
);

-- Anand §6 — LLM region for cross-border audit
create type llm_region as enum (
  'ap-south-1', 'asia-south1', 'in-mumbai', 'us-east-1', 'eu-west-1',
  'us-east-2', 'eu-central-1', 'unknown'
);

-- Anand §7 — outbound message status
create type outbound_status as enum (
  'queued', 'sent', 'delivered', 'read', 'failed', 'bounced'
);

-- Anand §9 — Rx drug class + Rx status
create type rx_drug_class as enum ('OTC', 'Schedule_H', 'Schedule_H1', 'Schedule_X');
create type rx_status as enum ('drafted', 'mo_signed', 'dispensed', 'revoked');

-- Anand §14 — ABDM environment discipline
create type abdm_environment as enum ('sandbox', 'staging', 'production');

-- Aanya §6 — IMCI peds classification
create type peds_pneumonia_class as enum (
  'severe', 'non_severe', 'no_pneumonia_cough_cold'
);
create type peds_nutrition_class as enum ('SAM', 'MAM', 'normal');

-- Aanya §5 — NTEP regimen types (lock)
create type dots_regimen_kind as enum (
  'new_DSTB', 'previously_treated_DSTB', 'MDR_TB', 'PreXDR', 'XDR', 'HR_TB'
);

-- Aanya §7 — High-Risk Pregnancy categories (HRP, ICMR-defined)
create type pregnancy_hrp_flag as enum (
  'prev_lscs', 'prev_pph', 'hypertension_chronic', 'GDM', 'anemia_severe',
  'grand_multipara', 'teenage_pregnancy', 'age_gte_35', 'prev_stillbirth',
  'rh_negative', 'heart_disease', 'TB_concurrent', 'epilepsy', 'preeclampsia_history'
);

-- Aanya §7 — Serology categorical
create type serology_status as enum ('reactive', 'non_reactive', 'not_done', 'unknown');

-- Aanya §7 — blood group
create type blood_group as enum (
  'A_pos', 'A_neg', 'B_pos', 'B_neg', 'AB_pos', 'AB_neg', 'O_pos', 'O_neg', 'unknown'
);

-- Aanya §8 — mental health instruments + severity
create type mh_instrument as enum ('PHQ-2', 'PHQ-9', 'GAD-2', 'GAD-7', 'SRQ-20');
create type mh_severity as enum (
  'minimal', 'mild', 'moderate', 'severe',
  'ideation_passive', 'ideation_active', 'plan', 'attempt_recent', 'attempt_in_progress'
);

-- Aanya §12 — adverse event taxonomy (CTCAE-aligned)
create type pilot_ae_type as enum (
  'missed_red_flag', 'wrong_band', 'delayed_mo_review', 'unsafe_advice',
  'wrong_drug_suggested', 'consent_breach', 'pii_leak',
  'death_within_72h', 'hospitalisation_within_72h', 'near_miss'
);
create type ae_described_by_role as enum (
  'MO', 'ASHA', 'patient_family', 'auto_detected', 'external_audit'
);

-- Anand §16 — PHI access purpose codes
create type phi_purpose as enum (
  'CARE', 'AUDIT', 'CONSENT_FULFILMENT', 'GRIEVANCE',
  'PUBLIC_HEALTH_REPORT', 'BILLING', 'RESEARCH_DEIDENTIFIED'
);

-- Aanya §4 — 11 MoHFW ANC danger signs
create type anc_danger_sign_code as enum (
  'severe_headache', 'blurred_vision', 'swelling_face_hands',
  'reduced_fetal_movement', 'vaginal_bleeding', 'leaking_pv',
  'fever', 'severe_abdo_pain', 'convulsions',
  'severe_pallor', 'breathlessness'
);
create type anc_sign_status as enum ('absent', 'present', 'unknown');

-- ════════════════════════════════════════════════════════════════
-- PART B: NEW TABLES — Legal/Regulatory Chain (Anand §§1-6)
-- ════════════════════════════════════════════════════════════════

-- ── Anand §1 — DPDP Notice Text Storage ─────────────────────────
create table dpdp_notices (
  id                       uuid primary key default gen_random_uuid(),
  version                  text not null,
  lang                     encounter_lang not null,
  notice_text              text not null,           -- verbatim, immutable
  notice_audio_url         text,                    -- for voice-played notices
  purposes                 text[] not null,         -- specific s.6(1) purposes
  retention_period         text not null,           -- s.5(1)(iii)
  rights_summary           text not null,           -- s.5(1)(iv) s.11-14 rights
  grievance_officer_name   text not null,
  grievance_email          text not null,
  effective_from           timestamptz not null,
  superseded_at            timestamptz,
  approved_by_dpo          uuid,                    -- references mo_users(id) — added in Anand §15
  created_at               timestamptz not null default now(),
  unique (version, lang)
);
create index idx_dpdp_notices_active on dpdp_notices (effective_from)
  where superseded_at is null;

-- FK from consents to notice shown at consent time
alter table consents
  add column dpdp_notice_id uuid references dpdp_notices(id);

-- ── Anand §2 — Consent Withdrawal Audit Chain ───────────────────
create table consent_withdrawal_requests (
  id                       uuid primary key default gen_random_uuid(),
  patient_id               uuid not null references patients(id),
  consent_id               uuid references consents(id),  -- nullable: blanket
  scope_withdrawn          consent_scope[] not null,
  channel                  withdrawal_channel not null,
  raw_request_text         text,
  audio_recording_url      text,
  received_at              timestamptz not null default now(),
  verified_at              timestamptz,
  verification_method      text,                        -- 'otp' | 'voiceprint' | 'asha_witness'
  processing_started_at    timestamptz,
  completed_at             timestamptz,
  status                   withdrawal_status not null default 'received',
  processed_by_user_id     uuid,                        -- FK added below
  sla_deadline             timestamptz not null
    generated always as (received_at + interval '72 hours') stored,
  downstream_actions_taken jsonb not null default '[]'::jsonb,
  retention_until          date not null
    default ((now() at time zone 'Asia/Kolkata') + interval '7 years')::date,
  created_at               timestamptz not null default now()
);
create index idx_consent_withdrawal_pending
  on consent_withdrawal_requests (sla_deadline)
  where status in ('received', 'verified', 'processing');
create index idx_consent_withdrawal_patient
  on consent_withdrawal_requests (patient_id, received_at desc);

-- ── Anand §3 — Verifiable Parental Consent ──────────────────────
create table parental_guardians (
  id                          uuid primary key default gen_random_uuid(),
  minor_patient_id            uuid not null references patients(id) on delete cascade,
  guardian_name               text not null,
  guardian_phone_e164         text not null,
  relationship                text not null check (relationship in (
    'mother', 'father', 'legal_guardian', 'asha_witnessed_caregiver'
  )),
  guardian_abha_id            text,
  -- DPDP Rule 10 verifiability
  verification_method         text not null check (verification_method in (
    'aadhaar_otp_guardian', 'asha_in_person_attest',
    'gov_id_photo', 'voice_self_declared_witnessed'
  )),
  verification_evidence_url   text,
  consent_id                  uuid not null references consents(id),
  consent_audio_url           text,
  consent_phrase_lang         encounter_lang not null,
  -- POCSO awareness — minor's own assent if ≥12
  minor_assent_captured       boolean not null default false,
  minor_assent_audio_url      text,
  retention_until             date not null
    default ((now() at time zone 'Asia/Kolkata') + interval '7 years')::date,
  created_at                  timestamptz not null default now()
);
create index idx_guardians_minor on parental_guardians (minor_patient_id);

-- ── Anand §4 — Data Subject Request Register (DPDP Rule 12) ─────
create table data_subject_requests (
  id                       uuid primary key default gen_random_uuid(),
  patient_id               uuid references patients(id),
  raw_identifier           text not null,           -- phone or ABHA as submitted
  request_type             dsr_type not null,
  request_text             text not null,
  channel                  withdrawal_channel not null,
  received_at              timestamptz not null default now(),
  verified_at              timestamptz,
  verification_method      text,
  sla_deadline             timestamptz not null
    generated always as (received_at + interval '30 days') stored,
  status                   dsr_status not null default 'received',
  assigned_to              uuid,                    -- FK to mo_users added below
  fulfilled_at             timestamptz,
  fulfilment_artefact_url  text,
  rejection_reason         text,
  retention_until          date not null
    default ((now() at time zone 'Asia/Kolkata') + interval '7 years')::date,
  created_at               timestamptz not null default now()
);
create index idx_dsr_pending on data_subject_requests (sla_deadline)
  where status in ('received', 'verified', 'in_progress');

-- ── Anand §5 — Data Breach Incident Chain (CERT-In 6h + DPDP) ───
create table data_breach_incidents (
  id                            uuid primary key default gen_random_uuid(),
  discovered_at                 timestamptz not null,
  occurred_at                   timestamptz,
  scope_class                   breach_scope_class not null,
  affected_patient_count        integer,
  affected_data_categories      text[] not null,        -- ['phi','phone','abha']
  root_cause                    text,
  containment_at                timestamptz,
  -- Statutory clocks
  cert_in_notified_at           timestamptz,            -- ≤6h
  cert_in_ref                   text,
  dpdp_board_notified_at        timestamptz,
  dpdp_board_ref                text,
  data_principals_notified_at   timestamptz,
  notification_template_url     text,
  abdm_security_notified_at     timestamptz,
  -- Forensics
  forensic_report_url           text,
  remediation_actions           jsonb not null default '[]'::jsonb,
  closed_at                     timestamptz,
  retention_until               date not null
    default ((now() at time zone 'Asia/Kolkata') + interval '7 years')::date,
  created_at                    timestamptz not null default now()
);
create index idx_breach_unclosed on data_breach_incidents (discovered_at desc)
  where closed_at is null;
-- Surface 6h-breach watch
create index idx_breach_cert_in_pending on data_breach_incidents (discovered_at)
  where cert_in_notified_at is null;

-- ── Anand §6 — Cross-Border Transfer Audit ──────────────────────
create table cross_border_transfers (
  id                       bigserial primary key,
  turn_id                  bigint references turns(id) on delete cascade,
  call_id                  uuid references calls(id),
  provider                 text not null,           -- 'bedrock' | 'anthropic' | 'sarvam'
  model                    text not null,
  region                   llm_region not null,
  region_attested_by       text not null,           -- 'aws_sdk_response_header' | ...
  payload_pii_redacted     boolean not null,
  redaction_method         text not null,           -- 'pii_token_map_v1'
  redaction_session_token  text,
  payload_sha256           text not null,
  payload_byte_size        integer,
  transferred_at           timestamptz not null default now(),
  retention_until          date not null
    default ((now() at time zone 'Asia/Kolkata') + interval '7 years')::date
);
create index idx_cbt_call on cross_border_transfers (call_id);
create index idx_cbt_unredacted on cross_border_transfers (transferred_at desc)
  where payload_pii_redacted = false;

-- ════════════════════════════════════════════════════════════════
-- PART C: NEW TABLES — Outbound (RMP snapshot + TRAI DLT)
-- ════════════════════════════════════════════════════════════════

-- ── Anand §15 — DLT Templates ───────────────────────────────────
create table dlt_templates (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references tenants(id),
  dlt_template_id       text not null,
  dlt_header            text not null,
  template_category     text not null check (template_category in (
    'service_implicit', 'service_explicit', 'transactional', 'promotional'
  )),
  template_lang         encounter_lang not null,
  template_body         text not null,             -- with {var1} placeholders
  variables             text[] not null,
  approved_at           timestamptz,
  active                boolean not null default true,
  unique (tenant_id, dlt_template_id)
);
create index idx_dlt_templates_active on dlt_templates (tenant_id, template_lang) where active;

-- ── Anand §7 — Outbound Messages with RMP Identity ──────────────
create table outbound_messages (
  id                            uuid primary key default gen_random_uuid(),
  tenant_id                     uuid not null references tenants(id),
  patient_id                    uuid references patients(id),
  patient_phone_e164            text not null,
  channel                       dispatch_channel not null,
  -- TPG identity snapshot (NOT NULL)
  rmp_user_id                   uuid not null references mo_users(id),
  rmp_name_snapshot             text not null,
  rmp_reg_number_snapshot       text not null,
  rmp_state_council_snapshot    text not null,
  -- TRAI DLT
  dlt_template_id               text not null,
  dlt_entity_id                 text not null,
  dlt_header                    text not null,
  -- Content
  body_text                     text not null,
  body_lang                     encounter_lang not null,
  -- Status
  provider_message_id           text,
  status                        outbound_status not null default 'queued',
  sent_at                       timestamptz,
  delivered_at                  timestamptz,
  failed_reason                 text,
  -- Linkage
  related_call_id               uuid references calls(id),
  related_dispatch_id           uuid references call_dispatch_queue(id),
  retention_until               date not null
    default ((now() at time zone 'Asia/Kolkata') + interval '7 years')::date,
  created_at                    timestamptz not null default now()
);
create index idx_outbound_patient on outbound_messages (patient_id, created_at desc);
create index idx_outbound_tenant_time on outbound_messages (tenant_id, created_at desc);
create index idx_outbound_status on outbound_messages (status, sent_at);

-- ════════════════════════════════════════════════════════════════
-- PART D: NEW TABLES — Clinical Extensions (Aanya §§1, 4-12)
-- ════════════════════════════════════════════════════════════════

-- ── Aanya §1 — Structured Presenting Complaints ─────────────────
create table presenting_complaints (
  id                          uuid primary key default gen_random_uuid(),
  call_id                     uuid not null references calls(id) on delete cascade,
  patient_id                  uuid not null references patients(id),
  complaint_code              text not null,             -- SNOMED-CT-IN subset
  complaint_native_text       text,                       -- patient's own words
  onset_at                    timestamptz,
  duration_value              smallint,
  duration_unit               text check (duration_unit in
    ('hours', 'days', 'weeks', 'months', 'years')),
  severity                    smallint check (severity between 1 and 10),
  location_body_site          text,
  associated_symptoms         text[] default '{}',
  -- TB suspect flags
  fever_duration_days         smallint,
  cough_duration_weeks        smallint,
  sputum_blood                boolean,
  night_sweats                boolean,
  weight_loss                 boolean,
  -- Audit
  created_at                  timestamptz not null default now()
);
create index idx_presenting_complaints_call on presenting_complaints (call_id);
create index idx_presenting_complaints_code on presenting_complaints (complaint_code);

-- ── Aanya §9 — Vernacular Symptom Dictionary ────────────────────
create table clinical_synonyms (
  id                          uuid primary key default gen_random_uuid(),
  canonical_concept           text not null,
  lang                        encounter_lang not null,
  surface_form                text not null,
  dialect_region              text,
  source                      text,
  is_red_flag_synonym         boolean not null default false,
  red_flag_category           red_flag_category,
  created_at                  timestamptz not null default now(),
  unique (canonical_concept, lang, surface_form)
);
create index idx_synonyms_fts on clinical_synonyms
  using gin (to_tsvector('simple', surface_form));
create index idx_synonyms_concept on clinical_synonyms (canonical_concept, lang);
create index idx_synonyms_redflag on clinical_synonyms (red_flag_category)
  where is_red_flag_synonym;

-- ── Aanya §10 — Structured Vitals ───────────────────────────────
create table vitals_observations (
  id                          uuid primary key default gen_random_uuid(),
  call_id                     uuid references calls(id) on delete set null,
  patient_id                  uuid not null references patients(id),
  pregnancy_id                uuid,                    -- FK added after pregnancies extended
  observed_at                 timestamptz not null default now(),
  source                      text not null check (source in
    ('asha_device', 'patient_self', 'clinic', 'not_available')),
  -- Vital signs (with physiologic CHECK constraints)
  temperature_c               numeric(3,1)
    check (temperature_c is null or temperature_c between 30.0 and 45.0),
  pulse_bpm                   smallint
    check (pulse_bpm is null or pulse_bpm between 20 and 250),
  respiratory_rate_per_min    smallint
    check (respiratory_rate_per_min is null or respiratory_rate_per_min between 5 and 80),
  systolic_bp_mmhg            smallint
    check (systolic_bp_mmhg is null or systolic_bp_mmhg between 50 and 260),
  diastolic_bp_mmhg           smallint
    check (diastolic_bp_mmhg is null or diastolic_bp_mmhg between 20 and 200),
  spo2_pct                    smallint
    check (spo2_pct is null or spo2_pct between 0 and 100),
  weight_kg                   numeric(5,2),
  height_cm                   numeric(5,1),
  muac_mm                     smallint,
  fundal_height_cm            smallint,
  hemoglobin_gdl              numeric(3,1),
  blood_sugar_random_mgdl     smallint,
  blood_sugar_fasting_mgdl    smallint,
  device_model                text,
  -- Audit
  recorded_by_user_id         uuid,                    -- ASHA or MO
  created_at                  timestamptz not null default now()
);
create index idx_vitals_patient_time on vitals_observations (patient_id, observed_at desc);
create index idx_vitals_call on vitals_observations (call_id) where call_id is not null;
create index idx_vitals_pregnancy on vitals_observations (pregnancy_id) where pregnancy_id is not null;

-- ── Aanya §4 — Structured ANC Danger Sign Screens ───────────────
create table anc_danger_sign_screens (
  id                          bigserial primary key,
  anc_contact_id              bigint not null references anc_contacts(id) on delete cascade,
  sign_code                   anc_danger_sign_code not null,
  status                      anc_sign_status not null default 'unknown',
  notes                       text,
  raised_red_flag_event_id    bigint references red_flag_events(id),
  screened_at                 timestamptz not null default now(),
  unique (anc_contact_id, sign_code)
);
create index idx_anc_signs_present on anc_danger_sign_screens (anc_contact_id)
  where status = 'present';

-- ── Aanya §5 — DOTS Phase Transitions ───────────────────────────
create table dots_phase_transitions (
  id                          bigserial primary key,
  regimen_id                  uuid not null references dots_regimens(id) on delete cascade,
  from_phase                  dots_phase,
  to_phase                    dots_phase not null,
  transitioned_at             timestamptz not null default now(),
  transitioned_by_mo_id       uuid references mo_users(id),
  sputum_smear_result         text,                    -- '+++' | '++' | '+' | 'negative' | 'not_done'
  sputum_culture_result       text,
  weight_kg                   numeric(5,2),
  notes                       text
);
create index idx_dots_transitions_regimen on dots_phase_transitions (regimen_id, transitioned_at);

-- ── Aanya §5 — DOTS Adverse Events (PvPI-reportable) ────────────
create table dots_adverse_events (
  id                          uuid primary key default gen_random_uuid(),
  regimen_id                  uuid not null references dots_regimens(id) on delete cascade,
  ae_code                     text not null,            -- e.g. 'hepatotoxicity', 'optic_neuritis'
  ae_grade                    smallint not null check (ae_grade between 1 and 5),  -- CTCAE
  onset_date                  date not null,
  action_taken                text not null check (action_taken in (
    'continue', 'dose_reduce', 'drug_substituted', 'regimen_held', 'hospitalised'
  )),
  reported_to_pvpi_at         timestamptz,
  pvpi_ref                    text,
  resolved_at                 timestamptz,
  outcome                     text,
  notes                       text,
  retention_until             date not null
    default ((now() at time zone 'Asia/Kolkata') + interval '7 years')::date,
  created_at                  timestamptz not null default now()
);
create index idx_dots_ae_regimen on dots_adverse_events (regimen_id, onset_date desc);
create index idx_dots_ae_pvpi_pending on dots_adverse_events (onset_date)
  where reported_to_pvpi_at is null and ae_grade >= 3;

-- ── Aanya §6 — Peds IMCI Assessments ────────────────────────────
create table peds_imci_assessments (
  id                                uuid primary key default gen_random_uuid(),
  call_id                           uuid not null references calls(id) on delete cascade,
  patient_id                        uuid not null references patients(id),
  age_months                        smallint not null check (age_months between 0 and 60),
  weight_kg                         numeric(4,2),
  height_cm                         numeric(5,1),
  muac_mm                           smallint,
  -- Z-scores from WHO growth standards
  weight_for_age_z                  numeric(4,2),
  weight_for_height_z               numeric(4,2),
  height_for_age_z                  numeric(4,2),
  nutrition_classification          peds_nutrition_class,
  edema_bilateral                   boolean,
  -- Respiratory IMCI markers
  chest_indrawing                   boolean,
  fast_breathing                    boolean,
  respiratory_rate_per_min          smallint,
  pneumonia_classification          peds_pneumonia_class,
  -- 4 IMCI Danger Signs (<5y)
  danger_unable_to_drink            boolean,
  danger_vomits_everything          boolean,
  danger_convulsion                 boolean,
  danger_lethargy_unconsciousness   boolean,
  -- UIP + Nutrition
  immunization_due_list             text[] default '{}',
  exclusive_bf_under_6m             boolean,
  complementary_feeding_started_6m  boolean,
  vitamin_a_due                     boolean,
  ors_zinc_advised                  boolean,
  notes                             text,
  assessed_at                       timestamptz not null default now(),
  created_at                        timestamptz not null default now()
);
create index idx_peds_imci_call on peds_imci_assessments (call_id);
create index idx_peds_imci_danger on peds_imci_assessments (assessed_at desc)
  where danger_unable_to_drink or danger_vomits_everything
     or danger_convulsion or danger_lethargy_unconsciousness;

-- ── Aanya §8 — Mental Health Screenings (PHQ-2/GAD-2/SRQ-20) ────
create table mental_health_screenings (
  id                          uuid primary key default gen_random_uuid(),
  call_id                     uuid not null references calls(id) on delete cascade,
  patient_id                  uuid not null references patients(id),
  instrument                  mh_instrument not null,
  score                       smallint not null,
  severity                    mh_severity not null,
  administered_lang           encounter_lang not null,
  items_json                  jsonb not null,           -- per-item responses
  fires_red_flag_event_id     bigint references red_flag_events(id),
  screened_at                 timestamptz not null default now(),
  retention_until             date not null
    default ((now() at time zone 'Asia/Kolkata') + interval '7 years')::date
);
create index idx_mh_screenings_patient on mental_health_screenings (patient_id, screened_at desc);

-- ── Anand §11 + Aanya §8 — MHCA s.18 Escalation Chain ───────────
create table mental_health_escalations (
  id                                  uuid primary key default gen_random_uuid(),
  call_id                             uuid not null references calls(id),
  patient_id                          uuid not null references patients(id),
  tenant_id                           uuid not null references tenants(id),
  screening_id                        uuid references mental_health_screenings(id),
  severity                            mh_severity not null,
  -- Statutory referrals (NOT NULL where applicable)
  tele_manas_surfaced_at              timestamptz,
  tele_manas_number_played            text default '14416',
  iCall_surfaced_at                   timestamptz,
  vandrevala_surfaced_at              timestamptz,
  kiran_surfaced_at                   timestamptz,
  nimhans_surfaced_at                 timestamptz,
  mhp_referral_user_id                uuid references mo_users(id),
  mhp_referred_at                     timestamptz,
  -- MHCA s.86 Person of Trust (PII tokenised)
  person_of_trust_name_token          text,
  person_of_trust_phone_token         text,
  person_of_trust_consent_audio_url   text,
  consent_to_share_with_pot           boolean default false,
  -- Outcome
  outcome                             text,
  resolved_at                         timestamptz,
  audio_evidence_url                  text not null,
  retention_until                     date not null
    default ((now() at time zone 'Asia/Kolkata') + interval '7 years')::date,
  created_at                          timestamptz not null default now()
);
create index idx_mh_escalations_pending on mental_health_escalations (created_at desc)
  where resolved_at is null;

-- ── Anand §12 — POCSO Mandatory Reporting Chain ─────────────────
create table pocso_reports (
  id                             uuid primary key default gen_random_uuid(),
  call_id                        uuid not null references calls(id),
  child_patient_id               uuid references patients(id),
  child_phone_e164               text not null,
  child_age_estimated            smallint,
  disclosure_summary_redacted    text not null,
  -- POCSO s.19 + JJ Act s.32 chain
  childline_1098_reported_at     timestamptz not null,
  childline_ref                  text,
  sjpu_reported_at               timestamptz not null,
  sjpu_jurisdiction              text not null,
  sjpu_ref                       text,
  cwc_notified_at                timestamptz,
  -- Caregiver
  caregiver_notified_at          timestamptz,
  caregiver_relationship         text,
  -- Internal
  compliance_officer_user_id     uuid not null references mo_users(id),
  evidence_audio_url             text not null,
  audio_hash                     text not null,
  retention_until                date not null
    default ((now() at time zone 'Asia/Kolkata') + interval '10 years')::date,
  created_at                     timestamptz not null default now()
);
create index idx_pocso_reports_child on pocso_reports (child_patient_id, created_at desc);

-- ── Aanya §11 + Anand §9 — Prescriptions (split from SOAP) ──────
create table prescriptions (
  id                              uuid primary key default gen_random_uuid(),
  soap_note_id                    uuid not null references soap_notes(id),
  patient_id                      uuid not null references patients(id),
  tenant_id                       uuid not null references tenants(id),
  -- TPG ¶3.7 RMP identity (NOT NULL)
  rmp_user_id                     uuid not null references mo_users(id),
  rmp_name_snapshot               text not null,
  rmp_reg_number_snapshot         text not null,
  rmp_state_council_snapshot      text not null,
  rmp_qualifications_snapshot     text[] not null,
  place_of_practice               text not null,
  -- Cross-state Rx red line (Anand §2.8 + Aanya §11)
  dispensing_state_code           text,
  -- Body
  rx_lang                         encounter_lang not null,
  rx_text                         text not null,         -- printable verbatim
  -- Refill (List B per TPG)
  is_refill                       boolean not null default false,
  refill_source_rx_id             uuid references prescriptions(id),
  refill_class                    text check (refill_class in ('A', 'B', 'C')),
  -- Signature
  signed_at                       timestamptz,
  signature_hash                  text,
  signature_method                text check (signature_method in (
    'aadhaar_esign', 'dsc_pkcs7', 'platform_audit_trail'
  )),
  status                          rx_status not null default 'drafted',
  -- Dispensing
  dispensed_at                    timestamptz,
  dispensing_pharmacy             text,
  retention_until                 date not null
    default ((now() at time zone 'Asia/Kolkata') + interval '7 years')::date,
  created_at                      timestamptz not null default now()
);
create index idx_prescriptions_patient on prescriptions (patient_id, created_at desc);
create index idx_prescriptions_mo on prescriptions (rmp_user_id, signed_at desc);

create table prescription_lines (
  id                              bigserial primary key,
  prescription_id                 uuid not null references prescriptions(id) on delete cascade,
  line_idx                        integer not null,
  drug_name_generic               text not null,
  drug_class                      rx_drug_class not null,
  schedule_h1_red_flag            boolean not null default false,
  dose                            text not null,
  frequency                       text not null,
  duration_days                   integer not null,
  route                           text check (route in (
    'PO', 'IM', 'IV', 'SC', 'PR', 'topical', 'inhalation'
  )),
  instructions_native             text,
  contraindication_check_passed   boolean,
  indication_icd11                text,
  prn                             boolean default false,
  total_quantity                  smallint,
  ayush_concurrent                boolean default false,
  unique (prescription_id, line_idx),
  -- Anand §9 — Schedule X is absolute refusal via DB constraint
  constraint chk_no_schedule_x check (drug_class <> 'Schedule_X')
);
create index idx_rx_lines_h1 on prescription_lines (prescription_id)
  where schedule_h1_red_flag;

-- ── Aanya §11 — Drug Safety Screen ──────────────────────────────
create table drug_safety_screen (
  id                          bigserial primary key,
  rx_line_id                  bigint not null references prescription_lines(id) on delete cascade,
  screen_type                 text not null check (screen_type in (
    'pregnancy_cat', 'pediatric', 'renal', 'interaction', 'allergy', 'hepatic'
  )),
  result                      text not null check (result in (
    'safe', 'caution', 'contraindicated', 'unknown'
  )),
  source                      text,                  -- 'NLEM_2022' | 'AWaRe' | 'MO_judgment'
  notes                       text,
  screened_at                 timestamptz not null default now()
);
create index idx_drug_safety_concern on drug_safety_screen (rx_line_id)
  where result in ('caution', 'contraindicated');

-- ── Aanya §13 — MO State Licenses (one MO can hold multiple) ────
create table mo_state_licenses (
  id                          uuid primary key default gen_random_uuid(),
  mo_user_id                  uuid not null references mo_users(id) on delete cascade,
  state_code                  text not null,
  smc_name                    text,
  registration_number         text not null,
  scope                       text check (scope in (
    'general_practice', 'specialty_only', 'restricted'
  )),
  issued_at                   date,
  expires_at                  date,
  status                      rmp_status not null default 'pending_verification',
  suspended_at                timestamptz,
  suspension_reason           text,
  verified_via                text,                  -- 'nmc_hpr_api' | 'manual' | 'smc_letter'
  verified_at                 timestamptz,
  retention_until             date not null
    default ((now() at time zone 'Asia/Kolkata') + interval '7 years')::date,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  unique (mo_user_id, state_code, registration_number)
);
create index idx_mo_licenses_active on mo_state_licenses (state_code, expires_at)
  where status = 'active';
create trigger tg_mo_licenses_updated_at before update on mo_state_licenses
  for each row execute function set_updated_at();

-- ════════════════════════════════════════════════════════════════
-- PART E: NEW TABLES — Pilot Safety + Audit (Aanya §§12, 14)
-- ════════════════════════════════════════════════════════════════

-- ── Aanya §12 — Pilot Cohorts (IRB wrapper) ─────────────────────
create table pilot_cohorts (
  id                          uuid primary key default gen_random_uuid(),
  pilot_name                  text not null,
  ethics_approval_id          text,
  iec_chair_email             text,
  start_date                  date not null,
  end_date                    date,
  target_n                    smallint not null,
  current_n                   smallint not null default 0,
  halt_criteria_json          jsonb not null default '{}'::jsonb,
  halted_at                   timestamptz,
  halt_reason                 text,
  created_at                  timestamptz not null default now()
);

-- ── Aanya §12 — Pilot Adverse Events (CTCAE) ────────────────────
create table pilot_adverse_events (
  id                          uuid primary key default gen_random_uuid(),
  pilot_cohort_id             uuid references pilot_cohorts(id),
  patient_id                  uuid references patients(id),
  call_id                     uuid references calls(id),
  triage_decision_id          uuid references triage_decisions(id),
  ae_type                     pilot_ae_type not null,
  grade                       smallint not null check (grade between 1 and 5),
  described_by                text,
  described_by_role           ae_described_by_role not null,
  root_cause_category         text,
  triggered_pilot_halt        boolean not null default false,
  reported_to_iec_at          timestamptz,
  reported_to_pvpi_at         timestamptz,
  narrative                   text,
  retention_until             date not null
    default ((now() at time zone 'Asia/Kolkata') + interval '7 years')::date,
  created_at                  timestamptz not null default now()
);
create index idx_pilot_ae_cohort on pilot_adverse_events (pilot_cohort_id, created_at desc);
create index idx_pilot_ae_halts on pilot_adverse_events (created_at desc)
  where triggered_pilot_halt;

-- ── Aanya §14 + Aman §12 — Triage Audit Log (timeline) ──────────
create table triage_audit_log (
  id                          bigserial primary key,
  triage_decision_id          uuid not null references triage_decisions(id) on delete cascade,
  event_type                  text not null check (event_type in (
    'created', 'assigned_to_mo', 'viewed', 'escalated_to_specialist',
    'band_overridden', 'reason_added', 'returned_for_more_info',
    'signed', 'reopened', 'expired_to_dmo'
  )),
  actor_user_id               uuid,
  actor_role                  text,
  previous_band               triage_band,
  new_band                    triage_band,
  previous_status             mo_review_status,
  new_status                  mo_review_status,
  sla_clock_state             text check (sla_clock_state in ('green', 'amber', 'breached')),
  notes                       text,
  occurred_at                 timestamptz not null default now()
);
create index idx_triage_audit_decision on triage_audit_log (triage_decision_id, occurred_at);

-- ── Anand §16 — PHI Access Log (DPDP s.7 audit) ─────────────────
create table phi_access_log (
  id                          bigserial primary key,
  accessed_at                 timestamptz not null default now(),
  auth_user_id                uuid not null,
  user_role                   text not null,         -- 'mo' | 'asha' | 'dmo' | 'service_role'
  table_name                  text not null,
  row_id                      text not null,
  patient_id                  uuid,
  purpose_code                phi_purpose not null,
  request_context             jsonb,
  retention_until             date not null
    default ((now() at time zone 'Asia/Kolkata') + interval '3 years')::date
);
create index idx_phi_access_patient on phi_access_log (patient_id, accessed_at desc);
create index idx_phi_access_user on phi_access_log (auth_user_id, accessed_at desc);

-- ════════════════════════════════════════════════════════════════
-- PART F: NEW TABLES — Architecture (Aman §§9, 14)
-- ════════════════════════════════════════════════════════════════

-- ── Aman §14 — MO Cockpit Chat (AI assistant for MO) ────────────
create table mo_cockpit_chat_messages (
  id                          bigserial primary key,
  triage_decision_id          uuid references triage_decisions(id) on delete cascade,
  patient_id                  uuid references patients(id),
  mo_user_id                  uuid not null references mo_users(id),
  role                        text not null check (role in ('user', 'assistant', 'system')),
  content                     text not null,
  model                       text,
  citations                   jsonb default '[]'::jsonb,
  tool_calls                  jsonb default '[]'::jsonb,
  created_at                  timestamptz not null default now()
);
create index idx_mo_chat_triage on mo_cockpit_chat_messages (triage_decision_id, created_at);
create index idx_mo_chat_mo on mo_cockpit_chat_messages (mo_user_id, created_at desc);

-- ── Aman §14 — Audio Recordings catalog (multi-segment) ─────────
create table audio_recordings (
  id                          uuid primary key default gen_random_uuid(),
  call_id                     uuid references calls(id) on delete cascade,
  patient_id                  uuid references patients(id),
  storage_url                 text not null,
  sha256                      text not null,
  duration_ms                 integer,
  segment_kind                text not null check (segment_kind in (
    'full', 'consent', 'refusal', 'red_flag', 'mh_escalation', 'pcpndt_refusal',
    'pocso_disclosure', 'dots_adherence', 'vaani_didi_signoff'
  )),
  segment_start_ms            integer,
  segment_end_ms              integer,
  encrypted                   boolean not null default true,
  encryption_key_ref          text,
  retention_until             date not null
    default ((now() at time zone 'Asia/Kolkata') + interval '7 years')::date,
  created_at                  timestamptz not null default now()
);
create index idx_audio_call on audio_recordings (call_id);
create index idx_audio_segment_kind on audio_recordings (segment_kind, created_at desc);

-- ── Aman §9 — Eval Case Results (per-language stratification) ───
create table eval_case_results (
  id                          bigserial primary key,
  eval_run_id                 uuid not null references eval_runs(id) on delete cascade,
  case_id                     text not null,
  lang                        encounter_lang,
  expected_band               triage_band,
  actual_band                 triage_band,
  band_match                  boolean,
  expected_red_flags          red_flag_category[],
  actual_red_flags            red_flag_category[],
  latency_ms                  integer,
  cost_inr                    numeric(10, 4),
  fail_reason                 text,
  raw_io                      jsonb
);
create index idx_eval_case_run on eval_case_results (eval_run_id, band_match);
create index idx_eval_case_lang on eval_case_results (eval_run_id, lang);

-- ── Aman §13 — Retention Policies (DPDP s.8(7) enforcement) ─────
create table retention_policies (
  table_name              text primary key,
  retention_column        text not null,
  enabled                 boolean not null default true,
  grace_period_days       smallint not null default 30,
  last_run_at             timestamptz,
  rows_purged_last_run    integer,
  rows_purged_cumulative  bigint not null default 0
);

-- ── ABDM Production Approvals (Anand §14 guard) ─────────────────
create table abdm_production_approvals (
  tenant_id              uuid primary key references tenants(id),
  approved_by_counsel    uuid not null references mo_users(id),
  m2_certification_ref   text not null,
  m3_certification_ref   text,
  approved_at            timestamptz not null,
  evidence_url           text not null,
  created_at             timestamptz not null default now()
);

-- ── ABDM Consent Access Log (Anand §13) ─────────────────────────
create table abdm_consent_access_log (
  id                          bigserial primary key,
  artefact_id                 uuid not null references abdm_consent_artefacts(id),
  hiu_id                      text not null,
  accessed_at                 timestamptz not null,
  hi_types_accessed           text[],
  request_id                  text,
  status                      text,
  created_at                  timestamptz not null default now()
);
create index idx_abdm_access_artefact on abdm_consent_access_log (artefact_id, accessed_at desc);

-- ════════════════════════════════════════════════════════════════
-- PART G: ALTER EXISTING TABLES
-- ════════════════════════════════════════════════════════════════

-- ── Aman §1 — Fix dangling FK (logical erase via purged_at) ─────
alter table patients add column purged_at timestamptz;
alter table patients add column purge_reason text;
comment on column patients.purged_at is
  'DPDP s.12 right-to-erasure: set to mark as purged. Audit (calls/triage/SOAP) survives.';

-- Wire the dangling FK that the comment promised
alter table consents
  add constraint fk_consents_abdm_artefact
  foreign key (abdm_consent_artefact_id) references abdm_consent_artefacts(id)
  on delete set null;

-- ── Wire DPDP Notice + DSR FKs to mo_users (deferred from PART B) ─
alter table dpdp_notices
  add constraint fk_dpdp_notices_dpo
  foreign key (approved_by_dpo) references mo_users(id);

alter table consent_withdrawal_requests
  add constraint fk_consent_withdrawal_processor
  foreign key (processed_by_user_id) references mo_users(id);

alter table data_subject_requests
  add constraint fk_dsr_assignee
  foreign key (assigned_to) references mo_users(id);

-- ── Aman §13 — IST-aware retention_until on existing tables ─────
-- (refusal_log + pii_token_map already +7yr UTC; switch to IST)
alter table refusal_log alter column retention_until set default
  ((now() at time zone 'Asia/Kolkata') + interval '7 years')::date;
alter table pii_token_map alter column retention_until set default
  ((now() at time zone 'Asia/Kolkata') + interval '7 years')::date;

-- ── Anand §8 — Retention on missing PHI tables ──────────────────
alter table soap_notes add column retention_until date not null
  default ((now() at time zone 'Asia/Kolkata') + interval '7 years')::date;
alter table triage_decisions add column retention_until date not null
  default ((now() at time zone 'Asia/Kolkata') + interval '7 years')::date;
alter table consents add column retention_until date not null
  default ((now() at time zone 'Asia/Kolkata') + interval '7 years')::date;
alter table turns add column retention_until date not null
  default ((now() at time zone 'Asia/Kolkata') + interval '7 years')::date;
alter table red_flag_events add column retention_until date not null
  default ((now() at time zone 'Asia/Kolkata') + interval '7 years')::date;
alter table abdm_consent_artefacts add column retention_until date not null
  default ((now() at time zone 'Asia/Kolkata') + interval '7 years')::date;

-- ── Aanya §3 — SOAP additions (eSanjeevani compliance) ──────────
alter table soap_notes
  add column immunization_status_json   jsonb default '{}'::jsonb,
  add column ayush_concurrent_meds      text[] default '{}',
  add column allopathic_meds_at_home    text[] default '{}',
  add column follow_up_at               timestamptz,
  add column follow_up_channel          dispatch_channel,
  add column investigations_advised     text[] default '{}',
  add column esanjeevani_pushed_at      timestamptz,
  add column esanjeevani_ref_id         text;

-- ── Aanya §7 — Pregnancy additions ──────────────────────────────
alter table pregnancies
  add column serology_hiv               serology_status default 'unknown',
  add column serology_syphilis          serology_status default 'unknown',
  add column serology_hbsag             serology_status default 'unknown',
  add column serology_hcv               serology_status default 'unknown',
  add column serology_tested_at         date,
  add column blood_group_typed          blood_group default 'unknown',
  add column tt_doses_given             smallint default 0,
  add column ifa_tablets_dispensed      integer default 0,
  add column hrp_flags                  pregnancy_hrp_flag[] default '{}',
  add column gestational_age_weeks      smallint generated always as (
    ((current_date - lmp_date) / 7)::smallint
  ) stored;

-- Wire vitals_observations.pregnancy_id FK now that pregnancies is extended
alter table vitals_observations
  add constraint fk_vitals_pregnancy
  foreign key (pregnancy_id) references pregnancies(id) on delete set null;

-- ── Aanya §5 — DOTS regimen extensions ──────────────────────────
alter table dots_regimens
  add column regimen_kind        dots_regimen_kind,
  add column weight_band         text check (weight_band in (
    '25-34kg', '35-49kg', '50-64kg', '65kg_plus'
  )),
  add column contact_screening_completed boolean default false;

-- ── Aanya §2 — red_flag_phrases detection metadata ──────────────
alter table red_flag_phrases
  add column detection_method  text not null default 'exact'
    check (detection_method in ('exact', 'regex', 'semantic')),
  add column min_confidence    numeric(3, 2) default 0.85;

-- ── Aman §10 — Per-turn model versioning ────────────────────────
alter table turns
  add column prompt_version    text,
  add column provider          text,           -- 'claude_bedrock' | 'sarvam_m' | 'sarvam_saarika'
  add column stt_confidence    numeric(3, 2);

-- ── Aman §1 — `red_flag_events.call_id` cascade ─────────────────
alter table red_flag_events drop constraint if exists red_flag_events_call_id_fkey;
alter table red_flag_events
  add constraint fk_red_flag_events_call
  foreign key (call_id) references calls(id) on delete cascade;

-- ── Aman §1 — `ops_incidents.related_call_id` set null ──────────
alter table ops_incidents drop constraint if exists ops_incidents_related_call_id_fkey;
alter table ops_incidents
  add constraint fk_ops_incidents_call
  foreign key (related_call_id) references calls(id) on delete set null;

-- ── Aman §6 — Channel-field consistency check ───────────────────
alter table call_dispatch_queue add constraint chk_channel_provider_fields check (
  (channel = 'voice'    and channel_message_id is null) or
  (channel <> 'voice'   and vapi_call_id is null)
);

-- ── Aman §1 — claimed_by_worker on dispatch queue ───────────────
alter table call_dispatch_queue add column claimed_by_worker_id text;

-- ── Aman §3 — asha_users.updated_at ─────────────────────────────
alter table asha_users
  add column updated_at timestamptz not null default now();
create trigger tg_asha_users_updated_at before update on asha_users
  for each row execute function set_updated_at();

-- ── Aman §8 — Cost precision bump + new line items ──────────────
alter table call_costs
  alter column exotel_inr           type numeric(10, 4),
  alter column sarvam_stt_inr       type numeric(10, 4),
  alter column sarvam_tts_inr       type numeric(10, 4),
  alter column claude_input_inr     type numeric(10, 4),
  alter column claude_output_inr    type numeric(10, 4),
  alter column sarvam_m_inr         type numeric(10, 4),
  alter column supabase_inr         type numeric(10, 4),
  alter column gupshup_inr          type numeric(10, 4);

alter table call_costs drop column total_inr;
alter table call_costs add column bedrock_surcharge_inr numeric(10, 4) default 0;
alter table call_costs add column msg91_inr             numeric(10, 4) default 0;
alter table call_costs add column total_inr numeric(12, 4) generated always as (
  coalesce(exotel_inr,0) + coalesce(sarvam_stt_inr,0) + coalesce(sarvam_tts_inr,0)
  + coalesce(claude_input_inr,0) + coalesce(claude_output_inr,0)
  + coalesce(sarvam_m_inr,0) + coalesce(supabase_inr,0) + coalesce(gupshup_inr,0)
  + coalesce(bedrock_surcharge_inr,0) + coalesce(msg91_inr,0)
) stored;

-- ── Aman §14 — Triage SLA helper cols ───────────────────────────
alter table triage_decisions
  add column first_viewed_at          timestamptz,
  add column escalation_count         smallint default 0,
  add column time_to_review_seconds   integer,
  add column time_to_override_seconds integer,
  add column sla_target_minutes       smallint not null default
    (case  -- defaulted per band post-create via trigger
       when 1 = 1 then 120 end);

-- ── Anand §14 — ABDM environment guards ─────────────────────────
alter table tenants add column abdm_environment abdm_environment not null default 'sandbox';
alter table abdm_consent_artefacts add column abdm_environment abdm_environment not null default 'sandbox';

-- ── Anand §13 — ABDM artefact field completeness ────────────────
alter table abdm_consent_artefacts
  add column signature_jws            text,
  add column revocation_callback_url  text,
  add column care_contexts            jsonb default '[]'::jsonb,
  add column notification_status      text,
  add column granularity              text;

-- ── Anand §15 — DLT entity registration on tenant ───────────────
alter table tenants
  add column dlt_entity_id            text,
  add column dlt_pe_id                text,
  add column dlt_registered_at        timestamptz;

-- ── MO indemnity active (generated col, Aanya §13) ──────────────
alter table mo_users
  add column indemnity_active boolean generated always as (
    pi_insurance_expires_at >= current_date
  ) stored;

-- ── Anand §10 — PCPNDT refusal_log NOT NULL tightening ──────────
-- CHECK constraint enforces evidence completeness on PCPNDT category
alter table refusal_log add constraint chk_pcpndt_complete check (
  category <> 'pcpndt_foetal_sex' or
  (audio_segment_url is not null
   and audio_segment_hash is not null
   and refusal_script_used is not null
   and call_id is not null
   and patient_id is not null)
);

-- ────────────────────────────────────────────────────────────────
-- Aman §7 — Tenant path uniqueness
-- ────────────────────────────────────────────────────────────────
create unique index uq_tenants_path on tenants (tenant_path);

-- ────────────────────────────────────────────────────────────────
-- Aman §2 — Index fixes
-- ────────────────────────────────────────────────────────────────
drop index if exists idx_patients_phone_trgm;
drop index if exists idx_triage_band_pending;
create index idx_triage_band_pending on triage_decisions (band, created_at)
  where mo_review_status = 'pending';

create index idx_calls_tenant_outcome on calls (tenant_id, outcome, started_at desc);
create index idx_red_flag_events_pager on red_flag_events (raised_at asc)
  where mo_paged_at is null;
create index idx_webhook_logs_req_id on dispatch_webhook_logs
  ((headers->>'x-request-id'));

-- ════════════════════════════════════════════════════════════════
-- PART H: FUNCTIONS + TRIGGERS
-- ════════════════════════════════════════════════════════════════

-- ── Aman §7 — Rename ancestry helper to clarify inclusive semantics
create or replace function is_ancestor_or_self(ancestor uuid, descendant uuid)
returns boolean language sql security definer stable as $$
  select exists(
    select 1 from tenants a, tenants d
    where a.id = ancestor and d.id = descendant
      and d.tenant_path <@ a.tenant_path
  );
$$;
-- Keep is_ancestor_tenant for back-compat as alias
create or replace function is_ancestor_tenant(ancestor uuid, descendant uuid)
returns boolean language sql security definer stable as $$
  select is_ancestor_or_self(ancestor, descendant);
$$;

-- ── Aanya §12 — Auto-halt pilot on AE ───────────────────────────
create or replace function trg_pilot_ae_halt() returns trigger as $$
begin
  if new.triggered_pilot_halt = true and new.pilot_cohort_id is not null then
    update pilot_cohorts
      set halted_at = now(),
          halt_reason = coalesce(halt_reason, '') ||
            '[AE ' || new.id::text || '] '
      where id = new.pilot_cohort_id and halted_at is null;
    -- Pause outbound on all tenants linked to this cohort
    update tenants
      set outbound_paused_at = now(),
          outbound_paused_reason = 'pilot_halt_auto_trigger'
      where id in (
        select tenant_id from calls where id = new.call_id
      ) and outbound_paused_at is null;
  end if;
  return new;
end;
$$ language plpgsql;
create trigger tg_pilot_ae_halt
  after insert on pilot_adverse_events
  for each row execute function trg_pilot_ae_halt();

-- ── Anand §2 — Auto-set consent.revoked_at on withdrawal complete ─
create or replace function trg_consent_withdrawal_complete() returns trigger as $$
begin
  if new.status = 'completed' and old.status <> 'completed' then
    update consents
      set status = 'revoked', revoked_at = coalesce(new.completed_at, now())
      where id = new.consent_id;
  end if;
  return new;
end;
$$ language plpgsql;
create trigger tg_consent_withdrawal_complete
  after update of status on consent_withdrawal_requests
  for each row execute function trg_consent_withdrawal_complete();

-- ── Aanya §11 — Cross-state Rx guard ────────────────────────────
create or replace function trg_rx_state_match() returns trigger as $$
declare
  ok boolean;
begin
  if new.dispensing_state_code is null then
    return new;  -- not yet dispensed
  end if;
  select exists(
    select 1 from mo_state_licenses
      where mo_user_id = new.rmp_user_id
        and state_code = new.dispensing_state_code
        and status = 'active'
        and (expires_at is null or expires_at >= current_date)
  ) into ok;
  if not ok then
    raise exception 'Cross-state Rx blocked: MO % has no active license for state %',
      new.rmp_user_id, new.dispensing_state_code;
  end if;
  return new;
end;
$$ language plpgsql;
create trigger tg_rx_state_match
  before insert or update of dispensing_state_code, rmp_user_id on prescriptions
  for each row execute function trg_rx_state_match();

-- ── Anand §14 — ABDM environment guard ──────────────────────────
create or replace function trg_abdm_production_guard() returns trigger as $$
begin
  if new.abdm_environment = 'production'
     and (old is null or old.abdm_environment <> 'production') then
    if not exists (
      select 1 from abdm_production_approvals where tenant_id = new.id
    ) then
      raise exception 'tenant.abdm_environment=production requires abdm_production_approvals row';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;
create trigger tg_abdm_production_guard
  before insert or update of abdm_environment on tenants
  for each row execute function trg_abdm_production_guard();

-- ── Aman §12 — Triage decision audit timeline ───────────────────
create or replace function trg_triage_audit() returns trigger as $$
begin
  if tg_op = 'INSERT' then
    insert into triage_audit_log (
      triage_decision_id, event_type, new_band, new_status, occurred_at
    ) values (
      new.id, 'created', new.band, new.mo_review_status, now()
    );
    return new;
  end if;
  if tg_op = 'UPDATE' then
    -- band override
    if new.mo_override_band is not null
       and (old.mo_override_band is null or old.mo_override_band <> new.mo_override_band) then
      insert into triage_audit_log (
        triage_decision_id, event_type, actor_user_id,
        previous_band, new_band, notes
      ) values (
        new.id, 'band_overridden', new.mo_user_id,
        coalesce(new.mo_override_band, old.band), new.mo_override_band,
        new.mo_override_reason
      );
    end if;
    -- review_status change
    if new.mo_review_status is distinct from old.mo_review_status then
      insert into triage_audit_log (
        triage_decision_id, event_type, actor_user_id,
        previous_status, new_status
      ) values (
        new.id,
        case new.mo_review_status
          when 'approved' then 'signed'
          when 'returned_for_more_info' then 'returned_for_more_info'
          when 'escalated' then 'escalated_to_specialist'
          else 'reason_added'
        end,
        new.mo_user_id, old.mo_review_status, new.mo_review_status
      );
    end if;
    return new;
  end if;
  return null;
end;
$$ language plpgsql;
create trigger tg_triage_audit
  after insert or update on triage_decisions
  for each row execute function trg_triage_audit();

-- ── Set SLA target by band on insert ────────────────────────────
create or replace function trg_triage_sla_default() returns trigger as $$
begin
  new.sla_target_minutes := case new.band
    when 'RED' then 15
    when 'AMBER' then 120
    when 'GREEN' then 1440
  end;
  return new;
end;
$$ language plpgsql;
create trigger tg_triage_sla_default
  before insert on triage_decisions
  for each row execute function trg_triage_sla_default();

-- ── Auto-create 11 ANC danger sign rows per contact (Aanya §4) ──
create or replace function trg_anc_signs_seed() returns trigger as $$
begin
  insert into anc_danger_sign_screens (anc_contact_id, sign_code, status)
  select new.id, code, 'unknown'
  from unnest(enum_range(null::anc_danger_sign_code)) code;
  return new;
end;
$$ language plpgsql;
create trigger tg_anc_signs_seed
  after insert on anc_contacts
  for each row execute function trg_anc_signs_seed();

-- ════════════════════════════════════════════════════════════════
-- PART I: SEED retention_policies
-- ════════════════════════════════════════════════════════════════

insert into retention_policies (table_name, retention_column) values
  ('pii_token_map',            'retention_until'),
  ('refusal_log',              'retention_until'),
  ('calls',                    'audio_retention_until'),
  ('soap_notes',               'retention_until'),
  ('triage_decisions',         'retention_until'),
  ('consents',                 'retention_until'),
  ('turns',                    'retention_until'),
  ('red_flag_events',          'retention_until'),
  ('abdm_consent_artefacts',   'retention_until'),
  ('parental_guardians',       'retention_until'),
  ('consent_withdrawal_requests', 'retention_until'),
  ('data_subject_requests',    'retention_until'),
  ('data_breach_incidents',    'retention_until'),
  ('cross_border_transfers',   'retention_until'),
  ('outbound_messages',        'retention_until'),
  ('prescriptions',            'retention_until'),
  ('mental_health_escalations','retention_until'),
  ('mental_health_screenings', 'retention_until'),
  ('pocso_reports',            'retention_until'),
  ('dots_adverse_events',      'retention_until'),
  ('pilot_adverse_events',     'retention_until'),
  ('audio_recordings',         'retention_until'),
  ('mo_state_licenses',        'retention_until'),
  ('phi_access_log',           'retention_until')
on conflict (table_name) do nothing;

-- ════════════════════════════════════════════════════════════════
-- PART J: COMMENTS
-- ════════════════════════════════════════════════════════════════
comment on table dpdp_notices is
  'Anand §1 — Immutable DPDP s.5 notice text per (version, lang). FK from consents.';
comment on table consent_withdrawal_requests is
  'Anand §2 — DPDP s.6(4) withdrawal-as-easy-as-giving audit chain with 72h SLA trigger.';
comment on table parental_guardians is
  'Anand §3 — DPDP s.9 verifiable parental consent. POCSO-aware minor assent ≥12y.';
comment on table data_subject_requests is
  'Anand §4 — DPDP Rule 12 register for ss.11-14 rights with 30-day SLA.';
comment on table data_breach_incidents is
  'Anand §5 — CERT-In 6h + DPDP s.8(6) breach chain. Indexed for unclosed + cert_in_pending.';
comment on table cross_border_transfers is
  'Anand §6 — Per-turn audit row for every Claude/Bedrock call. Index on unredacted alerts.';
comment on table outbound_messages is
  'Anand §7 — TPG ¶3.3 RMP identity snapshot + TRAI DLT IDs. NOT NULL = app cannot forget.';
comment on table dlt_templates is
  'Anand §15 — TRAI TCCCPR 2018 DLT-registered templates per tenant + lang.';
comment on table prescriptions is
  'Aanya §11 + Anand §9 — Rx as discrete signed instrument. Cross-state guard via trigger.';
comment on table prescription_lines is
  'Per-line Rx. CHECK chk_no_schedule_x makes Schedule X structurally impossible.';
comment on table mental_health_escalations is
  'Anand §11 + Aanya §8 — MHCA s.18/86 escalation chain. Tele-MANAS 14416 surfaced first.';
comment on table pocso_reports is
  'Anand §12 — POCSO s.19(1) mandatory reporting chain. 10-yr retention.';
comment on table peds_imci_assessments is
  'Aanya §6 — WHO IMCI under-5 assessment. 4 danger signs + nutrition Z-scores + UIP.';
comment on table vitals_observations is
  'Aanya §10 — Structured vitals w/ physiologic CHECK ranges. Source of truth.';
comment on table mo_state_licenses is
  'Aanya §13 — Per-state SMC registration. One MO may hold multiple. Active gate for Rx.';
comment on table pilot_adverse_events is
  'Aanya §12 — CTCAE-graded AE. triggered_pilot_halt=true auto-pauses outbound (trigger).';
comment on table triage_audit_log is
  'Aman §12 + Aanya §14 — Timeline of triage events. CPA defence + SLA breach evidence.';
comment on table mo_cockpit_chat_messages is
  'Aman §14 — MO ↔ AI chat for editing SOAP / clarifying triage.';
comment on table audio_recordings is
  'Aman §14 — Multi-segment recording catalog. KMS-encrypted. 7-yr retention.';
comment on table phi_access_log is
  'Anand §16 — Every PHI read logged with purpose_code. 3-yr retention. DPDP s.7 audit.';
comment on table retention_policies is
  'Aman §13 — Drives nightly pg_cron purge (next migration). DPDP s.8(7) compliance.';
comment on table cross_border_transfers is
  'Killer query: SELECT count(*) WHERE payload_pii_redacted=false → must be 0 always.';
comment on table dpdp_notices is
  'Killer query: SELECT notice_text WHERE version=$1 AND lang=$2 — reproduce exactly what patient saw.';
