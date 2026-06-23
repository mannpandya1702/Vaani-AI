-- ════════════════════════════════════════════════════════════════
-- Vaani-AI Baseline Schema
-- Author: Aman Khurana (VP AI Eng) + ⚖️ Anand Subramanian (Counsel) + 🩺 Aanya Sharma (CCO)
-- Date: 2026-06-23
--
-- Multi-tenant voice AI for rural India primary care.
-- Hierarchical scoping: ASHA ⊂ PHC ⊂ District ⊂ State.
-- Data residency: India only (Supabase ap-south-1) per ABDM HDM ¶7.6 + DPDP s.16.
-- All cross-border LLM calls require PII redaction via pii_token_map.
-- ════════════════════════════════════════════════════════════════

-- ─── Extensions ─────────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";
create extension if not exists "ltree";
create extension if not exists "vector";
create extension if not exists "pg_cron" with schema "pg_catalog";

-- ─── Enums ──────────────────────────────────────────────────────
create type tenant_level as enum (
  'state_cell', 'district_office', 'chc', 'phc', 'subcentre', 'demo'
);

create type dispatch_channel as enum ('voice', 'whatsapp', 'sms');
create type dispatch_status  as enum (
  'pending', 'claimed', 'dispatched', 'in_progress',
  'call_completed', 'completed', 'failed', 'cancelled', 'paused'
);
create type dispatch_event_type as enum (
  'voice_screening',
  'voice_followup',
  'voice_callback',
  'dots_adherence',
  'anc_reminder',
  'anc_contact_due',
  'medication_reminder',
  'cohort_outreach',
  'mo_handoff_red',
  'mo_handoff_amber',
  'vaani_didi_signoff'  -- the "डॉक्टर साहब ने देख लिया है" callback
);
create type dispatch_trigger as enum (
  'inbound_call', 'scanner', 'manual', 'webhook', 'cron', 'mo_action'
);

create type triage_band as enum ('RED', 'AMBER', 'GREEN');

create type consent_status as enum (
  'pending', 'granted', 'denied', 'revoked', 'expired'
);
create type consent_scope as enum (
  'screening_call', 'data_processing', 'audio_recording',
  'abdm_link', 'mo_share', 'whatsapp_followup', 'sms_followup'
);

create type mo_review_status as enum (
  'pending', 'approved', 'edited', 'escalated', 'overridden', 'returned_for_more_info'
);

create type red_flag_category as enum (
  'cardiac', 'respiratory', 'neuro', 'obstetric', 'peds_danger',
  'trauma', 'sepsis', 'mental_health', 'envenomation', 'burns',
  'gi_acute', 'metabolic_acute', 'dehydration_severe', 'other'
);

create type red_flag_source as enum ('rule', 'llm', 'mo_flag', 'uncertainty_default');

create type refusal_category as enum (
  'pcpndt_foetal_sex',
  'mhca_suicidal_ideation',
  'pocso_csa_disclosure',
  'drug_prescription_attempt',
  'diagnosis_attempt',
  'cross_state_rx',
  'off_topic'
);

create type call_outcome as enum (
  'completed', 'voicemail', 'no_pickup', 'tech_error',
  'patient_disconnected', 'consent_denied', 'abandoned', 'in_progress'
);

create type encounter_lang as enum (
  'hi', 'ta', 'te', 'kn', 'bn', 'mr', 'gu', 'pa', 'or', 'ml', 'en'
);

create type rmp_status as enum ('active', 'suspended', 'expired', 'pending_verification');

create type incident_severity as enum ('low', 'medium', 'high', 'critical');

-- ════════════════════════════════════════════════════════════════
-- TENANTS (multi-tenant hierarchy)  [ported & extended from ClinicPro.companies]
-- ════════════════════════════════════════════════════════════════
create table tenants (
  id                          uuid primary key default gen_random_uuid(),
  name                        text not null,
  level                       tenant_level not null,
  -- Hierarchical scoping per Aman §14: ASHA ⊂ PHC ⊂ District ⊂ State
  tenant_path                 ltree not null,
  parent_id                   uuid references tenants(id),
  -- India-specific
  state_code                  text,           -- ISO 3166-2:IN, e.g. "IN-KA"
  district_code               text,
  pin_code                    text,
  -- Provider IDs
  vapi_org_id                 text unique,
  exotel_account_sid          text,
  exotel_virtual_number       text,
  gupshup_app_name            text,
  gupshup_source_number       text,
  msg91_sender_id             text,
  abdm_facility_id            text,           -- ABDM HFR ID
  ntep_unit_id                text,           -- TB program tie-in
  -- Defaults
  timezone                    text not null default 'Asia/Kolkata',
  preferred_language          encounter_lang  default 'hi',
  -- Operational
  paused_at                   timestamptz,
  paused_reason               text,
  outbound_paused_at          timestamptz,
  outbound_paused_reason      text,
  -- DPDP / Consent
  dpdp_consent_template_id    text,
  data_processor_agreement_signed_at timestamptz,
  -- Rate card (per-channel + per-cohort pricing — Aman §6)
  rate_card_json              jsonb not null default '{}'::jsonb,
  -- Free-form config bag
  config_json                 jsonb not null default '{}'::jsonb,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);
create index idx_tenants_path on tenants using gist (tenant_path);
create index idx_tenants_parent on tenants (parent_id);
create index idx_tenants_vapi_org on tenants (vapi_org_id) where vapi_org_id is not null;

-- ════════════════════════════════════════════════════════════════
-- USERS — Medical Officers (RMPs) + ASHA workers + system admins
-- ════════════════════════════════════════════════════════════════
create table mo_users (
  id                          uuid primary key default gen_random_uuid(),
  auth_user_id                uuid unique references auth.users(id) on delete cascade,
  full_name                   text not null,
  email                       text not null unique,
  phone_e164                  text,
  -- NMC / SMC registration (Anand §6 + Red Line #8 — MUST verify)
  mci_registration_number     text not null,
  state_medical_council       text not null,  -- e.g. "Karnataka Medical Council"
  nmc_hpr_id                  text,           -- NMC Healthcare Professional Registry
  registration_verified_at    timestamptz,
  registration_status         rmp_status not null default 'pending_verification',
  qualifications              text[],         -- ['MBBS', 'MD General Medicine']
  -- Scope
  tenant_id                   uuid not null references tenants(id),
  specialty                   text,
  states_authorised           text[],         -- states where they may prescribe
  -- Operational
  on_call                     boolean not null default false,
  red_flag_pager_phone        text,           -- 15-min SLA for RED triage
  -- Indemnity
  pi_insurance_provider       text,
  pi_insurance_policy_number  text,
  pi_insurance_expires_at     date,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);
create index idx_mo_users_tenant on mo_users (tenant_id);
create index idx_mo_users_oncall on mo_users (on_call) where on_call;

create table asha_users (
  id                          uuid primary key default gen_random_uuid(),
  auth_user_id                uuid unique references auth.users(id) on delete cascade,
  full_name                   text not null,
  phone_e164                  text not null,
  asha_code                   text,           -- state-issued ASHA ID
  village_name                text,
  subcentre_tenant_id         uuid references tenants(id),
  preferred_language          encounter_lang  default 'hi',
  is_active                   boolean not null default true,
  created_at                  timestamptz not null default now()
);
create index idx_asha_users_tenant on asha_users (subcentre_tenant_id);

-- ════════════════════════════════════════════════════════════════
-- PATIENTS
-- ════════════════════════════════════════════════════════════════
create table patients (
  id                          uuid primary key default gen_random_uuid(),
  -- Identity (ABHA = Ayushman Bharat Health Account, the India national health ID)
  abha_id                     text unique,    -- 14-digit ABHA, format XX-XXXX-XXXX-XXXX
  abha_address                text unique,    -- ABHA address, format name@abdm
  phone_e164                  text not null,
  -- Demographics (kept in DB; redacted from any LLM call)
  full_name                   text,           -- store; never send to Claude
  display_initial             text,           -- e.g. "R.K." for cockpit display
  age_years                   smallint check (age_years between 0 and 150),
  date_of_birth               date,
  sex                         text check (sex in ('M','F','Other','Unknown')),
  -- Location
  village_name                text,
  district_code               text,
  state_code                  text,
  pin_code                    text,
  -- Preferences
  preferred_language          encounter_lang not null default 'hi',
  -- Clinical flags (parent vs child, pregnancy status etc — Aanya §7)
  is_minor                    boolean generated always as (age_years is not null and age_years < 18) stored,
  pregnancy_status            text check (pregnancy_status in ('not_pregnant','pregnant','postpartum','unknown')),
  -- Relationships
  primary_asha_id             uuid references asha_users(id),
  tenant_id                   uuid not null references tenants(id),
  -- DPDP s.9 — parental consent flag for minors
  parental_consent_captured   boolean not null default false,
  -- Audit
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);
create unique index uq_patients_phone_tenant on patients (phone_e164, tenant_id);
create index idx_patients_abha on patients (abha_id) where abha_id is not null;
create index idx_patients_asha on patients (primary_asha_id);
create index idx_patients_tenant on patients (tenant_id);
create index idx_patients_phone_trgm on patients using gin (phone_e164 gin_trgm_ops);

-- ════════════════════════════════════════════════════════════════
-- CONSENTS (DPDP Act 2023 + ABDM HDM Policy)
-- Anand §3 + §4: voice-recorded consent + ABDM CM artefact
-- ════════════════════════════════════════════════════════════════
create table consents (
  id                          uuid primary key default gen_random_uuid(),
  patient_id                  uuid not null references patients(id) on delete cascade,
  scope                       consent_scope not null,
  status                      consent_status not null default 'pending',
  -- Capture details
  granted_at                  timestamptz,
  revoked_at                  timestamptz,
  expires_at                  timestamptz,    -- ABDM CM artefacts expire
  granted_via                 text,           -- 'voice' | 'sms_otp' | 'written' | 'parental'
  granted_by                  text,           -- 'patient' | 'parent' | 'guardian'
  -- Voice consent — Anand §14 lock
  audio_recording_url         text,           -- KMS-encrypted S3
  audio_segment_start_ms      integer,
  audio_segment_end_ms        integer,
  audio_transcript            text,
  consent_phrase_detected     text,           -- e.g. "हाँ"
  -- DPDP notice version shown
  notice_version              text not null default 'v1.0',
  notice_language             encounter_lang not null,
  -- ABDM consent artefact reference (if scope = 'abdm_link')
  abdm_consent_artefact_id    uuid,           -- FK after artefacts table created
  -- Audit
  ip_address                  inet,
  created_at                  timestamptz not null default now()
);
create index idx_consents_patient on consents (patient_id, scope, status);
create index idx_consents_status_expires on consents (status, expires_at) where status = 'granted';

-- ABDM HIE Consent Manager artefacts (Anand §4)
create table abdm_consent_artefacts (
  id                          uuid primary key default gen_random_uuid(),
  patient_id                  uuid not null references patients(id),
  abdm_request_id             text not null unique,
  abdm_artefact_id            text unique,
  purpose_code                text,           -- CAREMGT | BILLING | PUBHLTH
  hi_types                    text[],         -- ['Prescription','OPConsultation', ...]
  hip_id                      text,
  hiu_id                      text,
  date_range_from             date,
  date_range_to               date,
  expires_at                  timestamptz,
  status                      consent_status not null default 'pending',
  raw_payload                 jsonb,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);
create index idx_abdm_artefacts_patient on abdm_consent_artefacts (patient_id);
create index idx_abdm_artefacts_status on abdm_consent_artefacts (status);

-- ════════════════════════════════════════════════════════════════
-- CALLS + TURNS (replaces ClinicPro single-row call_logs per Aman §6)
-- ════════════════════════════════════════════════════════════════
create table calls (
  id                          uuid primary key default gen_random_uuid(),
  tenant_id                   uuid not null references tenants(id),
  patient_id                  uuid references patients(id),
  asha_id                     uuid references asha_users(id),
  -- Provider IDs
  vapi_call_id                text unique,
  exotel_call_sid             text,
  vapi_assistant_id           text,
  -- Lifecycle
  channel                     dispatch_channel not null default 'voice',
  outcome                     call_outcome not null default 'in_progress',
  started_at                  timestamptz,
  ended_at                    timestamptz,
  duration_seconds            integer,
  -- Languages
  lang_declared               encounter_lang,
  lang_detected               encounter_lang,
  -- Cost (per Aman cost model)
  cost_inr                    numeric(8,2),
  cost_breakdown              jsonb default '{}'::jsonb, -- {stt, tts, llm_claude, llm_sarvam_m, telephony}
  -- Providers used per-call (dual-LLM routing per Aman §5e)
  providers_json              jsonb default '{}'::jsonb, -- {stt:'sarvam', tts:'sarvam', llm_clinical:'claude', llm_intent:'sarvam_m'}
  -- Quality signals
  avg_latency_ms              integer,
  user_interruptions          integer default 0,
  agent_interruptions         integer default 0,
  -- Consent gate (Anand)
  consent_captured            boolean not null default false,
  consent_id                  uuid references consents(id),
  -- Audit
  audio_recording_url         text,
  audio_retention_until       date,           -- 7 years per IMC Reg + CPA limit
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);
create index idx_calls_patient on calls (patient_id, started_at desc);
create index idx_calls_tenant_time on calls (tenant_id, started_at desc);
create index idx_calls_vapi on calls (vapi_call_id) where vapi_call_id is not null;
create index idx_calls_outcome on calls (outcome);

create table turns (
  id                          bigserial primary key,
  call_id                     uuid not null references calls(id) on delete cascade,
  turn_idx                    integer not null,
  role                        text not null check (role in ('user', 'assistant', 'tool', 'system')),
  transcript                  text,
  transcript_redacted         text,           -- PII-stripped, what we send to Claude
  lang                        encounter_lang,
  -- Provider data
  model                       text,
  tokens_in                   integer,
  tokens_out                  integer,
  -- Latency per Aman §2 budget
  stt_latency_ms              integer,
  llm_latency_ms              integer,
  tts_latency_ms              integer,
  total_latency_ms            integer,
  -- Audio
  audio_segment_url           text,
  audio_start_ms              integer,
  audio_end_ms                integer,
  -- Guardrail trips
  guardrail_trips             jsonb default '[]'::jsonb, -- ['pii_scrubbed','red_flag_rule','off_topic']
  -- LLM confidence
  confidence                  numeric(3,2),
  -- Cost per turn
  cost_inr                    numeric(8,4),
  created_at                  timestamptz not null default now()
);
create unique index uq_turns_call_idx on turns (call_id, turn_idx);
create index idx_turns_call on turns (call_id);

-- ════════════════════════════════════════════════════════════════
-- TRIAGE DECISIONS (Aman §5 — replaces ClinicPro disposition)
-- ════════════════════════════════════════════════════════════════
create table triage_decisions (
  id                          uuid primary key default gen_random_uuid(),
  call_id                     uuid not null unique references calls(id) on delete cascade,
  patient_id                  uuid not null references patients(id),
  tenant_id                   uuid not null references tenants(id),
  -- Core triage
  band                        triage_band not null,
  presumptive_label           text not null, -- 'tb_suspect' | 'preg_anemia' | 'anc_normal' | ...
  red_flag_categories         red_flag_category[] default '{}',
  confidence                  numeric(3,2) not null check (confidence between 0 and 1),
  reasoning                   text,
  needs_mo_review             boolean not null default true, -- safety default
  -- Citations from RAG
  citations                   jsonb default '[]'::jsonb,
  -- Outputs
  summary_en                  text,           -- for MO cockpit
  summary_native              text,           -- in patient's language
  recommended_action          text,
  callback_time_iso           timestamptz,
  -- MO review (Aanya + Anand)
  mo_review_status            mo_review_status not null default 'pending',
  mo_user_id                  uuid references mo_users(id),
  mo_reviewed_at              timestamptz,
  mo_acked_at                 timestamptz,    -- SLA tracking: RED 15min, AMBER 2h
  mo_override_band            triage_band,
  mo_override_reason          text,
  -- Models used
  classifier_model            text,
  classifier_prompt_version   text,
  -- Audit
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);
create index idx_triage_band_pending on triage_decisions (band, mo_review_status, created_at)
  where mo_review_status = 'pending';
create index idx_triage_tenant on triage_decisions (tenant_id, created_at desc);
create index idx_triage_patient on triage_decisions (patient_id, created_at desc);

-- ════════════════════════════════════════════════════════════════
-- SOAP NOTES (eSanjeevani-compatible — Aanya §4)
-- ════════════════════════════════════════════════════════════════
create table soap_notes (
  id                          uuid primary key default gen_random_uuid(),
  call_id                     uuid not null unique references calls(id),
  triage_decision_id          uuid references triage_decisions(id),
  patient_id                  uuid not null references patients(id),
  tenant_id                   uuid not null references tenants(id),
  -- SOAP fields
  subjective                  text not null,
  objective                   text not null,
  assessment                  text not null,
  plan                        text not null,
  -- Coded
  icd10_codes                 text[] default '{}',
  icd11_codes                 text[] default '{}',  -- India standard
  -- Presumptive label NEVER "diagnosis"
  presumptive_screening_label text not null,
  differential_list           jsonb default '[]'::jsonb,
  -- Vitals (ASHA-reported)
  vitals_source               text check (vitals_source in ('ASHA_DEVICE','PATIENT_SELF','NOT_AVAILABLE')),
  vitals_json                 jsonb default '{}'::jsonb,
  -- eSanjeevani payload — ready for paste-into-government-EHR
  esanjeevani_payload         jsonb,
  -- ABDM FHIR R4 Composition
  fhir_composition            jsonb,
  -- Languages — bilingual summary
  lang                        encounter_lang not null,
  original_text               text,           -- AI-drafted, never overwritten
  mo_edited_text              text,           -- MO redline
  edit_distance               integer,        -- feeds QA scorer
  -- Signature (Anand §6)
  mo_user_id                  uuid references mo_users(id),
  mo_signed_at                timestamptz,
  mo_signature_hash           text,
  -- Disclaimer text required by Anand
  disclaimer                  text not null default
    'Vaani-AI provides AI-assisted clinical decision support. Final medical decisions are made by the named Registered Medical Practitioner.',
  -- ABDM push status
  abdm_pushed_at              timestamptz,
  abdm_encounter_id           text,
  -- Audit
  generated_at                timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);
create index idx_soap_patient on soap_notes (patient_id, generated_at desc);
create index idx_soap_mo on soap_notes (mo_user_id, mo_signed_at desc) where mo_signed_at is not null;

-- ════════════════════════════════════════════════════════════════
-- RED FLAG EVENTS + PHRASE LIBRARY (Aanya §2)
-- ════════════════════════════════════════════════════════════════
create table red_flag_phrases (
  id                          uuid primary key default gen_random_uuid(),
  category                    red_flag_category not null,
  lang                        encounter_lang not null,
  phrase                      text not null,
  regex_pattern               text,           -- compiled at runtime
  severity_score              smallint not null check (severity_score between 1 and 10),
  example_context             text,
  authored_by_mo_id           uuid references mo_users(id),
  created_at                  timestamptz not null default now()
);
create unique index uq_red_flag_phrases on red_flag_phrases (category, lang, phrase);

create table red_flag_events (
  id                          bigserial primary key,
  call_id                     uuid references calls(id),
  turn_id                     bigint references turns(id),
  patient_id                  uuid references patients(id),
  tenant_id                   uuid references tenants(id),
  category                    red_flag_category not null,
  source                      red_flag_source not null,
  confidence                  numeric(3,2),
  matched_phrase              text,
  matched_phrase_id           uuid references red_flag_phrases(id),
  -- Action chain (Aanya §2: stop intake → emergency line → MO + 108)
  action_taken                text,
  mo_paged_at                 timestamptz,
  mo_paged_user_id            uuid references mo_users(id),
  ambulance_108_advised_at    timestamptz,
  asha_sos_at                 timestamptz,
  -- Outcome
  resolved_at                 timestamptz,
  resolution_note             text,
  raised_at                   timestamptz not null default now()
);
create index idx_red_flag_events_raised on red_flag_events (raised_at desc);
create index idx_red_flag_events_pending on red_flag_events (raised_at)
  where mo_paged_at is null;

-- ════════════════════════════════════════════════════════════════
-- REFUSAL LOG (Anand §10 + §11 — PCPNDT/MHCA/POCSO/Drug refusals)
-- These are EVIDENCE — retain 7 yrs.
-- ════════════════════════════════════════════════════════════════
create table refusal_log (
  id                          bigserial primary key,
  call_id                     uuid references calls(id),
  turn_id                     bigint references turns(id),
  patient_id                  uuid references patients(id),
  tenant_id                   uuid references tenants(id),
  category                    refusal_category not null,
  trigger_text                text not null,  -- what the patient said
  refusal_script_used         text not null,  -- verbatim refusal we played
  audio_segment_url           text,
  audio_segment_hash          text,
  retention_until             date not null
    default (now() + interval '7 years')::date,
  created_at                  timestamptz not null default now()
);
create index idx_refusal_log_category on refusal_log (category, created_at desc);
create index idx_refusal_log_patient on refusal_log (patient_id, created_at desc);

-- ════════════════════════════════════════════════════════════════
-- DOTS REGIMENS (Aanya §6 — NTEP TB adherence)
-- ════════════════════════════════════════════════════════════════
create type dots_phase as enum ('intensive', 'continuation', 'extended');
create type dots_regimen_status as enum ('active', 'completed', 'defaulted', 'lost_to_followup', 'died');

create table dots_regimens (
  id                          uuid primary key default gen_random_uuid(),
  patient_id                  uuid not null references patients(id),
  tenant_id                   uuid not null references tenants(id),
  nikshay_id                  text unique,    -- TB program ID
  diagnosis_date              date not null,
  regimen_type                text not null,  -- 'new', 'previously_treated', 'MDR'
  phase                       dots_phase not null default 'intensive',
  phase_start_date            date not null,
  expected_completion_date    date,
  status                      dots_regimen_status not null default 'active',
  -- Adherence
  adherence_pct               numeric(5,2),
  last_dose_logged_at         timestamptz,
  missed_doses_count          integer default 0,
  consecutive_missed_doses    integer default 0,
  -- Nikshay Poshan Yojana DBT
  next_dbt_date               date,
  -- Audit
  enrolled_at                 timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);
create index idx_dots_active on dots_regimens (status, last_dose_logged_at)
  where status = 'active';
create index idx_dots_patient on dots_regimens (patient_id);

create table dots_dose_logs (
  id                          bigserial primary key,
  regimen_id                  uuid not null references dots_regimens(id) on delete cascade,
  dose_date                   date not null,
  taken                       boolean not null,
  taken_via                   text,           -- 'voice_ack' | 'whatsapp_reply' | 'asha_witness'
  reason_missed               text,
  side_effects_reported       text[],
  reported_at                 timestamptz not null default now()
);
create unique index uq_dots_dose on dots_dose_logs (regimen_id, dose_date);

-- ════════════════════════════════════════════════════════════════
-- PREGNANCIES (Aanya §7 — ANC MoHFW 8-contact schedule)
-- ════════════════════════════════════════════════════════════════
create type anc_contact_kind as enum (
  'anc_1_registration', 'anc_2', 'anc_3_anomaly_scan', 'anc_4',
  'anc_5_tt_ifa', 'anc_6', 'anc_7_birth_prep', 'anc_8',
  'postpartum_6w'
);

create table pregnancies (
  id                          uuid primary key default gen_random_uuid(),
  patient_id                  uuid not null references patients(id),
  tenant_id                   uuid not null references tenants(id),
  lmp_date                    date not null,
  edd_date                    date generated always as (lmp_date + interval '280 days') stored,
  gravida                     smallint,
  para                        smallint,
  living                      smallint,
  abortions                   smallint,
  outcome                     text,           -- 'live_birth' | 'still_birth' | 'mtp' | 'ongoing' | 'miscarriage'
  outcome_date                date,
  high_risk_flags             text[] default '{}',
  registered_under_jsy        boolean default false,
  registered_under_pmmvy      boolean default false,
  -- Audit
  registered_at               timestamptz not null default now(),
  closed_at                   timestamptz
);
create index idx_pregnancies_active on pregnancies (patient_id, edd_date)
  where outcome is null or outcome = 'ongoing';

create table anc_contacts (
  id                          bigserial primary key,
  pregnancy_id                uuid not null references pregnancies(id) on delete cascade,
  contact_kind                anc_contact_kind not null,
  due_date                    date not null,
  completed_at                timestamptz,
  call_id                     uuid references calls(id),
  danger_signs_screened       text[] default '{}',
  vitals_json                 jsonb default '{}'::jsonb,
  notes                       text
);
create unique index uq_anc_contact on anc_contacts (pregnancy_id, contact_kind);

-- ════════════════════════════════════════════════════════════════
-- DISPATCH QUEUE (LIFT from ClinicPro call_dispatch_queue — Aman §1)
-- Extended with multi-channel (voice/whatsapp/sms) per Aman §11
-- ════════════════════════════════════════════════════════════════
create table call_dispatch_queue (
  id                          uuid primary key default gen_random_uuid(),
  tenant_id                   uuid not null references tenants(id),
  patient_id                  uuid references patients(id),
  patient_phone_e164          text not null,
  -- Polymorphic event
  event_type                  dispatch_event_type not null,
  event_metadata              jsonb default '{}'::jsonb,
  -- Channel (NEW vs ClinicPro)
  channel                     dispatch_channel not null default 'voice',
  -- Lifecycle
  status                      dispatch_status not null default 'pending',
  scheduled_at                timestamptz not null,
  claimed_at                  timestamptz,
  dispatched_at               timestamptz,
  completed_at                timestamptz,
  -- Provider IDs
  vapi_call_id                text,
  channel_message_id          text,
  last_delivery_status        text,
  -- Trigger
  trigger                     dispatch_trigger,
  trigger_source_table        text,
  trigger_source_id           text,
  -- Retry / harassment guards (lifted from ClinicPro)
  attempt_number              integer not null default 1,
  max_attempts                integer not null default 3,
  error_count                 integer not null default 0,
  last_error                  text,
  -- Sequence linking
  parent_queue_id             uuid references call_dispatch_queue(id),
  sequence_id                 uuid,
  -- Idempotency
  idempotency_key             text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);
create index idx_dispatch_queue_pending
  on call_dispatch_queue (scheduled_at, tenant_id)
  where status = 'pending';
create index idx_dispatch_queue_dedup
  on call_dispatch_queue (patient_phone_e164, event_type, status)
  where status in ('pending', 'claimed', 'dispatched', 'in_progress');
create unique index uq_dispatch_idempotency on call_dispatch_queue (idempotency_key)
  where idempotency_key is not null;

-- ════════════════════════════════════════════════════════════════
-- INBOUND WEBHOOK AUDIT (LIFT — Aman §11 lesson #5)
-- "Log payload first, parse later"
-- ════════════════════════════════════════════════════════════════
create table dispatch_webhook_logs (
  id                          bigserial primary key,
  source                      text not null,  -- 'vapi' | 'gupshup_in' | 'gupshup_dlr' | 'msg91_dlr' | 'exotel' | 'abdm'
  raw_body                    text,
  parsed_body                 jsonb,
  headers                     jsonb,
  signature_valid             boolean,
  http_status                 integer,
  processing_ms               integer,
  error                       text,
  received_at                 timestamptz not null default now()
);
create index idx_webhook_logs_source_time on dispatch_webhook_logs (source, received_at desc);

-- ════════════════════════════════════════════════════════════════
-- VAPI ASSISTANT CACHE (LIFT)
-- ════════════════════════════════════════════════════════════════
create table vapi_assistants (
  id                          uuid primary key default gen_random_uuid(),
  vapi_assistant_id           text not null unique,
  tenant_id                   uuid references tenants(id),
  name                        text,
  model                       text,
  voice_provider              text,
  voice_id                    text,
  transcription_provider      text,
  -- Versioning per Aman §15 SKILL lesson
  prompt_version              text,
  metadata                    jsonb default '{}'::jsonb,
  last_synced_at              timestamptz,
  created_at                  timestamptz not null default now()
);
create index idx_vapi_assistants_tenant on vapi_assistants (tenant_id);

-- ════════════════════════════════════════════════════════════════
-- PII TOKEN MAP (Anand §3.9 — PII redaction before Claude)
-- Encrypted at rest; reverse-map kept server-side only.
-- ════════════════════════════════════════════════════════════════
create table pii_token_map (
  id                          uuid primary key default gen_random_uuid(),
  session_token               text not null unique,  -- e.g. "Patient-Session-7G4F"
  call_id                     uuid references calls(id) on delete cascade,
  -- Encrypted original PII (pgcrypto AES via service-role key)
  encrypted_name              bytea,
  encrypted_phone             bytea,
  encrypted_abha              bytea,
  encrypted_village           bytea,
  -- Token map for the LLM payload
  token_map                   jsonb not null default '{}'::jsonb, -- {"NAME_1":"Ramesh", "PHONE_1":"+91..."}
  created_at                  timestamptz not null default now(),
  -- Retention: as long as the call recording retained (7 yrs)
  retention_until             date not null
    default (now() + interval '7 years')::date
);
create index idx_pii_token_call on pii_token_map (call_id);

-- ════════════════════════════════════════════════════════════════
-- COST + QA SIGNALS + EVAL RUNS (Aman §8)
-- ════════════════════════════════════════════════════════════════
create table call_costs (
  call_id                     uuid primary key references calls(id) on delete cascade,
  exotel_inr                  numeric(8,4) default 0,
  sarvam_stt_inr              numeric(8,4) default 0,
  sarvam_tts_inr              numeric(8,4) default 0,
  claude_input_inr            numeric(8,4) default 0,
  claude_output_inr           numeric(8,4) default 0,
  sarvam_m_inr                numeric(8,4) default 0,
  supabase_inr                numeric(8,4) default 0,
  gupshup_inr                 numeric(8,4) default 0,
  total_inr                   numeric(8,4) generated always as (
    coalesce(exotel_inr,0) + coalesce(sarvam_stt_inr,0) + coalesce(sarvam_tts_inr,0)
    + coalesce(claude_input_inr,0) + coalesce(claude_output_inr,0)
    + coalesce(sarvam_m_inr,0) + coalesce(supabase_inr,0) + coalesce(gupshup_inr,0)
  ) stored,
  computed_at                 timestamptz not null default now()
);

create table call_qa_signals (
  call_id                     uuid primary key references calls(id) on delete cascade,
  triage_accuracy_score       integer,        -- 0-100
  red_flag_detection_score    integer,
  vernacular_fluency_score    integer,
  refusal_hygiene_score       integer,
  consent_capture_score       integer,
  mo_satisfaction_score       integer,        -- from MO cockpit star + edit-distance
  flags                       text[] default '{}',
  severity                    incident_severity,
  evaluated_at                timestamptz,
  evaluator_model             text,
  evaluator_prompt_version    text
);

create table eval_runs (
  id                          uuid primary key default gen_random_uuid(),
  git_sha                     text,
  prompt_version              text,
  triage_accuracy             numeric(5,2),
  red_flag_recall             numeric(5,2),
  red_flag_precision          numeric(5,2),
  off_topic_redirect          numeric(5,2),
  p50_latency_ms              integer,
  p95_latency_ms              integer,
  avg_cost_inr                numeric(8,4),
  per_case_results            jsonb,
  ran_at                      timestamptz not null default now()
);

-- ════════════════════════════════════════════════════════════════
-- RAG CHUNKS (Aman §4 — ICMR/WHO guidelines)
-- ════════════════════════════════════════════════════════════════
create table rag_chunks (
  id                          text primary key,  -- e.g. "STW_v2_p47_c3"
  doc_id                      text not null,
  page                        integer,
  section                     text,
  content                     text not null,
  embedding                   vector(1024),      -- intfloat/multilingual-e5-large
  token_count                 integer,
  lang                        encounter_lang default 'en',
  tags                        text[] default '{}',
  source_authority            text,              -- 'ICMR' | 'WHO' | 'MoHFW' | 'NMC'
  guideline_version           text,
  created_at                  timestamptz not null default now()
);
create index idx_rag_embedding on rag_chunks using hnsw (embedding vector_cosine_ops);
create index idx_rag_fts on rag_chunks using gin (to_tsvector('simple', content));
create index idx_rag_doc on rag_chunks (doc_id);

-- ════════════════════════════════════════════════════════════════
-- OPS INCIDENTS (replaces ClickUp logger — Aman §1)
-- ════════════════════════════════════════════════════════════════
create table ops_incidents (
  id                          uuid primary key default gen_random_uuid(),
  severity                    incident_severity not null,
  source                      text not null,
  category                    text,
  title                       text not null,
  description                 text,
  related_call_id             uuid references calls(id),
  related_tenant_id           uuid references tenants(id),
  payload                     jsonb,
  acknowledged_at             timestamptz,
  acknowledged_by             uuid references auth.users(id),
  resolved_at                 timestamptz,
  resolution_note             text,
  created_at                  timestamptz not null default now()
);
create index idx_ops_incidents_open on ops_incidents (severity, created_at desc)
  where resolved_at is null;

-- ════════════════════════════════════════════════════════════════
-- COHORT RULES (Aman §4 — replaces reactivation_rules)
-- ════════════════════════════════════════════════════════════════
create type cohort_match_type as enum (
  'icd11_prefix', 'dots_overdue', 'anc_missed', 'htn_overdue',
  'ncd_screening_lapse', 'new_patient', 'default'
);

create table cohort_rules (
  id                          uuid primary key default gen_random_uuid(),
  tenant_id                   uuid references tenants(id),  -- null = global rule
  match_type                  cohort_match_type not null,
  match_value                 text,
  cadence_days                integer not null,
  priority                    integer not null default 100,
  active                      boolean not null default true,
  event_type                  dispatch_event_type not null,
  channel                     dispatch_channel not null default 'voice',
  created_at                  timestamptz not null default now()
);
create index idx_cohort_rules_priority on cohort_rules (tenant_id, priority) where active;

-- ════════════════════════════════════════════════════════════════
-- HMIS PUSH FAILURES — dead-letter for state-HMIS retries (Aman §18)
-- ════════════════════════════════════════════════════════════════
create table hmis_push_failures (
  id                          uuid primary key default gen_random_uuid(),
  source_table                text not null,
  source_row_id               text not null,
  adapter                     text not null,  -- 'abdm' | 'karnataka_hmis' | 'nikshay' | ...
  payload                     jsonb,
  last_error                  text,
  attempt_count               integer not null default 0,
  next_retry_at               timestamptz,
  resolved_at                 timestamptz,
  created_at                  timestamptz not null default now()
);
create index idx_hmis_pending on hmis_push_failures (next_retry_at)
  where resolved_at is null;

-- ════════════════════════════════════════════════════════════════
-- updated_at TRIGGERS
-- ════════════════════════════════════════════════════════════════
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger tg_tenants_updated_at before update on tenants
  for each row execute function set_updated_at();
create trigger tg_mo_users_updated_at before update on mo_users
  for each row execute function set_updated_at();
create trigger tg_patients_updated_at before update on patients
  for each row execute function set_updated_at();
create trigger tg_abdm_artefacts_updated_at before update on abdm_consent_artefacts
  for each row execute function set_updated_at();
create trigger tg_calls_updated_at before update on calls
  for each row execute function set_updated_at();
create trigger tg_triage_updated_at before update on triage_decisions
  for each row execute function set_updated_at();
create trigger tg_soap_updated_at before update on soap_notes
  for each row execute function set_updated_at();
create trigger tg_dots_updated_at before update on dots_regimens
  for each row execute function set_updated_at();
create trigger tg_dispatch_updated_at before update on call_dispatch_queue
  for each row execute function set_updated_at();

-- ════════════════════════════════════════════════════════════════
-- HELPER FUNCTIONS for RLS (used by next migration)
-- ════════════════════════════════════════════════════════════════
create or replace function get_user_tenant_id(uid uuid) returns uuid
language sql security definer stable as $$
  select coalesce(
    (select tenant_id from mo_users where auth_user_id = uid limit 1),
    (select subcentre_tenant_id from asha_users where auth_user_id = uid limit 1)
  );
$$;

create or replace function is_ancestor_tenant(ancestor uuid, descendant uuid) returns boolean
language sql security definer stable as $$
  select exists(
    select 1 from tenants a, tenants d
    where a.id = ancestor and d.id = descendant
      and d.tenant_path <@ a.tenant_path
  );
$$;

-- ════════════════════════════════════════════════════════════════
-- COMMENTS for downstream tooling
-- ════════════════════════════════════════════════════════════════
comment on table tenants is 'Hierarchical multi-tenancy: ASHA ⊂ PHC ⊂ District ⊂ State. tenant_path is the ltree.';
comment on table patients is 'PHI. Name + phone + ABHA stay in DB. NEVER sent to Claude (US). Sarvam-M (IN) gets raw.';
comment on table consents is 'DPDP s.6 voice-recorded consent + ABDM CM artefact. Anand §14.';
comment on table refusal_log is 'Anand §10/§11 — PCPNDT + MHCA + POCSO + Drug refusals. Evidence. Retain 7 yrs.';
comment on table pii_token_map is 'Anand §3.9 — PII redaction before any Claude call.';
comment on table soap_notes is 'eSanjeevani-compatible. Aanya §4. NEVER write the word "diagnosis" — only "presumptive_screening_label".';
comment on table triage_decisions is 'R/A/G + 0.85 confidence gate. <0.85 → mandatory MO review.';
comment on table red_flag_events is 'Pre-LLM hardcoded rules. Aanya §2 — 16 flags. Action chain logged for evidence.';
