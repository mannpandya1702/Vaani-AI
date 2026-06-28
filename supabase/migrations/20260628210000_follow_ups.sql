-- ════════════════════════════════════════════════════════════════
-- Stage 5 · Post-Visit Follow-up loop
-- ════════════════════════════════════════════════════════════════
-- The sign-off callback ("the doctor has seen you") CLOSES the consult.
-- A follow-up is the scheduled check-in DAYS later: "are you better or
-- worse?" — and if the patient is worsening, it RE-ESCALATES a fresh card
-- to the cockpit. This is the symptom-worsening-alert + scheduled-follow-up
-- the brief's Stage 5 names.
--
-- Lifecycle:  scheduled → sent (Vaani called/messaged) → responded
--             → (if worsening) escalated  |  cancelled
-- ════════════════════════════════════════════════════════════════

create table if not exists follow_ups (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id),
  patient_id          uuid references patients(id),
  call_id             uuid references calls(id) on delete set null,
  soap_id             uuid references soap_notes(id) on delete set null,

  -- what we're following up on (derived from triage + the doctor's safety-net)
  watch_for           text,
  band                text,                       -- original triage band (RED/AMBER/GREEN)
  lang                text not null default 'hi',

  -- scheduling
  scheduled_for       timestamptz not null,
  status              text not null default 'scheduled'
                        check (status in ('scheduled','sent','responded','escalated','cancelled')),
  channel             text not null default 'voice',  -- voice callback (prod: Exotel/WhatsApp)

  -- content (the in-language check-in question Vaani asks)
  message             text,

  -- the patient's response
  outcome             text check (outcome in ('improving','unchanged','worsening')),
  response_note       text,
  escalated_triage_id uuid references triage_decisions(id),

  -- audit
  created_at          timestamptz not null default now(),
  sent_at             timestamptz,
  responded_at        timestamptz
);

-- one follow-up per signed note (idempotent scheduling on re-sign)
create unique index if not exists uq_follow_ups_soap on follow_ups (soap_id) where soap_id is not null;
create index if not exists idx_follow_ups_due on follow_ups (scheduled_for) where status = 'scheduled';
create index if not exists idx_follow_ups_patient on follow_ups (patient_id, created_at desc);
create index if not exists idx_follow_ups_tenant_time on follow_ups (tenant_id, scheduled_for desc);

-- RLS on (PHI). Edge functions read/write with the service role (bypasses RLS),
-- exactly like triage_decisions / cockpit-feed. No direct anon/auth access.
alter table follow_ups enable row level security;
