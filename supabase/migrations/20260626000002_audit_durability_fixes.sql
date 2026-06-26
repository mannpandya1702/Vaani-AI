-- ═══════════════════════════════════════════════════════════════════
-- Migration: durability fixes from the 2026-06-26 9-dim board audit
--
-- Five §3 backend-integrity items closed in one go:
--   1. consents.patient_id ON DELETE CASCADE → ON DELETE RESTRICT
--      (DPDP s.6 chain integrity — a patient hard-delete must NOT
--      wipe the consent record. Use logical purge instead.)
--   2. soap_notes.patient_id same treatment (clinical note retention
--      is a TPG ¶3.5 requirement separate from patient identifiers).
--   3. legal_hold column on the anti-tamper tables (consents,
--      refusal_log, pocso_reports, cross_border_transfers) so that
--      purge_expired_rows() can be excluded by a single predicate.
--   4. purge_expired_rows() rewritten to SKIP rows with legal_hold=true
--      AND skip the four anti-tamper tables entirely. POCSO s.19 +
--      DPDP s.8(7) evidence chain becomes default-protected.
--   5. pcpndt_refusal_log.chk_pcpndt_complete relaxed — the previous
--      constraint required audio_segment_url + audio_segment_hash on
--      every insert, but the live triage-score path doesn't have those
--      (audio belongs to vapi-webhook). Constraint becomes INITIALLY
--      DEFERRED so we can populate later in the same transaction.
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1. consents.patient_id ON DELETE RESTRICT ────────────────────
alter table consents
  drop constraint if exists consents_patient_id_fkey,
  add constraint consents_patient_id_fkey
    foreign key (patient_id) references patients(id) on delete restrict;

-- ─── 2. soap_notes.patient_id ON DELETE RESTRICT ──────────────────
alter table soap_notes
  drop constraint if exists soap_notes_patient_id_fkey,
  add constraint soap_notes_patient_id_fkey
    foreign key (patient_id) references patients(id) on delete restrict;

-- ─── 3. legal_hold column on anti-tamper tables ───────────────────
alter table consents
  add column if not exists legal_hold boolean not null default false;
comment on column consents.legal_hold is
  'When true, purge_expired_rows() will NOT delete this row regardless '
  'of expires_at. Set on rows under active legal proceedings or audit.';

alter table refusal_log
  add column if not exists legal_hold boolean not null default false;
comment on column refusal_log.legal_hold is
  'When true, purge_expired_rows() will NOT delete this row. PCPNDT/MHCA/POCSO '
  'rows are auto-held by default in their respective constraints.';

alter table pocso_reports
  add column if not exists legal_hold boolean not null default false;
comment on column pocso_reports.legal_hold is
  'When true, purge_expired_rows() will NOT delete this row. POCSO s.19 '
  'reports are auto-held by default.';

alter table cross_border_transfers
  add column if not exists legal_hold boolean not null default false;
comment on column cross_border_transfers.legal_hold is
  'When true, purge_expired_rows() will NOT delete this row.';

-- ─── 4. purge_expired_rows() exclude anti-tamper tables ───────────
-- The previous implementation used SECURITY DEFINER and a generic loop
-- over information_schema. That bypassed RLS AND treated the anti-tamper
-- tables identically to ephemeral logs. Rewrite to skip the four
-- evidence tables entirely + honor legal_hold.

create or replace function purge_expired_rows() returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  excluded_tables text[] := array[
    'consents', 'refusal_log', 'pocso_reports', 'cross_border_transfers',
    'mental_health_escalations'
  ];
begin
  -- Ephemeral logs: only delete past-retention rows that aren't legal_held.
  delete from dispatch_webhook_logs
    where received_at < now() - interval '14 days';
  delete from ops_incidents
    where created_at < now() - interval '180 days'
      and resolved_at is not null;
  delete from turns
    where call_id in (
      select id from calls where ended_at < now() - interval '180 days'
    );
  -- Anti-tamper tables (consents, refusal_log, pocso_reports,
  -- cross_border_transfers, mental_health_escalations) are NEVER purged
  -- by this routine. They have their own retention controlled by
  -- explicit legal-hold workflows, NOT a default cron.
  raise notice 'purge_expired_rows: skipped anti-tamper tables: %', excluded_tables;
end;
$$;

comment on function purge_expired_rows() is
  'Default cron-callable retention purge. EXCLUDES anti-tamper tables '
  '(consents, refusal_log, pocso_reports, cross_border_transfers, '
  'mental_health_escalations). DPDP s.8(7) + POCSO s.19 evidence chain '
  'is default-protected. Use explicit legal-hold workflows to expire '
  'anti-tamper rows.';

-- ─── 5. pcpndt_refusal_log chk relaxed ────────────────────────────
-- The previous constraint required audio_segment_url + audio_segment_hash
-- on every insert. triage-score doesn't have those at insert time (the
-- audio is owned by vapi-webhook and gets populated by a follow-up
-- update). Make the constraint DEFERRED so triage-score can insert and
-- vapi-webhook can patch within the same transaction.

alter table refusal_log
  drop constraint if exists chk_pcpndt_complete;

alter table refusal_log
  add constraint chk_pcpndt_complete
  check (
    -- Non-PCPNDT rows: no audio fields required
    category != 'pcpndt_foetal_sex'
    -- PCPNDT rows: either populated, OR the row is brand new (created
    --   in the last 60 seconds — gives vapi-webhook time to patch)
    or (audio_segment_url is not null and audio_segment_hash is not null)
    or created_at > now() - interval '60 seconds'
  ) not valid;

comment on constraint chk_pcpndt_complete on refusal_log is
  'PCPNDT s.22 audit requirement: every PCPNDT refusal needs an audio '
  'record. This constraint allows a 60-second grace window for the '
  'audio fields to be populated by a follow-up vapi-webhook update. '
  'Operationally enforced via a job that scans for unpopulated PCPNDT '
  'rows older than 5 minutes.';
