-- ═══════════════════════════════════════════════════════════════════
-- Migration: AI Shadow Diagnosis (Stage 3 of the hackathon problem statement)
--
-- A SEPARATE AI clinical opinion generated immediately after SOAP, BEFORE
-- the RMP reviews. It NEVER overrides the doctor — we store the AI
-- recommendation AND the doctor's final decision side-by-side so we can
-- measure agreement, referral accuracy, and FP/FN referrals.
--
-- Anand/Aanya guardrails encoded elsewhere (shadow-diagnosis edge fn):
--   - output is "differential diagnoses", never a final diagnosis
--   - recommended_medications are MO-ONLY (never patient-facing)
--   - red flags deterministically raise urgency (safety override)
-- ═══════════════════════════════════════════════════════════════════

create type shadow_urgency as enum ('Routine', 'Urgent', 'Emergency');

-- What the doctor did with the AI opinion at the cockpit.
create type shadow_doctor_action as enum ('pending', 'ignored', 'accepted', 'edited');

create table if not exists shadow_diagnoses (
  id                       uuid primary key default gen_random_uuid(),
  call_id                  uuid not null unique references calls(id) on delete cascade,
  soap_note_id             uuid references soap_notes(id) on delete cascade,
  triage_decision_id       uuid references triage_decisions(id),
  patient_id               uuid not null references patients(id),
  tenant_id                uuid not null references tenants(id),

  -- ── AI recommendation (written once by shadow-diagnosis, immutable) ──
  -- differential_diagnoses: [{condition, confidence(0-1), reasoning, supporting_findings[]}]
  differential_diagnoses   jsonb   not null default '[]'::jsonb,
  recommended_tests        text[]  default '{}',
  recommended_medications  text[]  default '{}',   -- MO-ONLY · never patient-facing
  referral_recommended     boolean,
  referral_reason          text,
  urgency                  shadow_urgency,
  missing_information       text[]  default '{}',   -- what would reduce uncertainty
  ai_model                 text,
  ai_prompt_version        text,
  red_flag_urgency_override boolean not null default false, -- true if red flags forced urgency up

  -- ── Doctor's final decision (captured at the cockpit) ──────────────
  doctor_action            shadow_doctor_action not null default 'pending',
  doctor_final_differential jsonb,                -- doctor's edited version, if any
  doctor_referral_decision boolean,
  doctor_urgency           shadow_urgency,
  doctor_notes             text,
  doctor_user_id           uuid references mo_users(id),
  doctor_decided_at        timestamptz,

  -- ── Audit ──────────────────────────────────────────────────────────
  generated_at             timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists idx_shadow_diagnoses_call    on shadow_diagnoses(call_id);
create index if not exists idx_shadow_diagnoses_patient on shadow_diagnoses(patient_id);
create index if not exists idx_shadow_diagnoses_tenant  on shadow_diagnoses(tenant_id, generated_at desc);
create index if not exists idx_shadow_diagnoses_action  on shadow_diagnoses(doctor_action);

comment on table shadow_diagnoses is
  'AI Shadow Diagnosis (Stage 3). A separate AI clinical opinion generated '
  'after SOAP and before RMP review. Stores the AI recommendation AND the '
  'doctor''s final decision so agreement/referral metrics can be computed. '
  'The AI NEVER overrides the doctor.';
comment on column shadow_diagnoses.recommended_medications is
  'MO-ONLY drug hints. Per Anand red line these are NEVER sent to the patient '
  'channel — cockpit display only, drug-scrubbed out of any callback.';
comment on column shadow_diagnoses.red_flag_urgency_override is
  'true when the deterministic safety layer raised urgency because the triage '
  'band was RED / red_flag_categories were non-empty.';

-- RLS: service-role edge functions (cockpit-feed, shadow-diagnosis,
-- shadow-diagnosis-review) bypass RLS. Enable it so no anon/authenticated
-- role can read PHI-adjacent rows directly. Mirrors the soap_notes posture.
alter table shadow_diagnoses enable row level security;

-- keep updated_at fresh on doctor-decision writes
create or replace function set_shadow_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_shadow_updated_at
  before update on shadow_diagnoses
  for each row execute function set_shadow_updated_at();
