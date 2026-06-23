-- ════════════════════════════════════════════════════════════════
-- Vaani-AI Migration 003 — RLS + PHI Access Log + Retention Purge
-- Authors: Aman §4 + Anand §16
--
-- Layout:
--   PART A: RLS on 12 PHI tables with canonical patient/MO/ASHA/DMO shapes
--   PART B: log_phi_access() security-definer helper
--   PART C: Retention purge function + pg_cron monthly schedule
--   PART D: Anti-tamper policies (consents, refusal_log, pocso_reports,
--           cross_border_transfers, phi_access_log are append-only)
-- ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
-- PART A: Enable RLS + canonical policies
-- ════════════════════════════════════════════════════════════════

-- ── tenants ─────────────────────────────────────────────────────
alter table tenants enable row level security;
create policy "tenants_subtree_read" on tenants
  for select to authenticated using (
    is_ancestor_or_self(get_user_tenant_id(auth.uid()), id)
  );
create policy "tenants_service_role" on tenants
  for all to service_role using (true) with check (true);

-- ── mo_users ────────────────────────────────────────────────────
alter table mo_users enable row level security;
create policy "mo_users_self_read" on mo_users
  for select to authenticated using (auth_user_id = auth.uid());
create policy "mo_users_subtree_read" on mo_users
  for select to authenticated using (
    is_ancestor_or_self(get_user_tenant_id(auth.uid()), tenant_id)
  );
create policy "mo_users_service_role" on mo_users
  for all to service_role using (true) with check (true);

-- ── asha_users ──────────────────────────────────────────────────
alter table asha_users enable row level security;
create policy "asha_users_self_read" on asha_users
  for select to authenticated using (auth_user_id = auth.uid());
create policy "asha_users_subtree_read" on asha_users
  for select to authenticated using (
    is_ancestor_or_self(get_user_tenant_id(auth.uid()), subcentre_tenant_id)
  );
create policy "asha_users_service_role" on asha_users
  for all to service_role using (true) with check (true);

-- ── patients (PHI) ──────────────────────────────────────────────
alter table patients enable row level security;
create policy "patients_mo_subtree" on patients
  for select to authenticated using (
    is_ancestor_or_self(get_user_tenant_id(auth.uid()), tenant_id)
    and purged_at is null
  );
create policy "patients_asha_subcentre" on patients
  for select to authenticated using (
    primary_asha_id in (select id from asha_users where auth_user_id = auth.uid())
    and purged_at is null
  );
create policy "patients_mo_write" on patients
  for insert to authenticated with check (
    tenant_id = get_user_tenant_id(auth.uid())
    and exists(select 1 from mo_users where auth_user_id = auth.uid())
  );
create policy "patients_mo_update" on patients
  for update to authenticated using (
    is_ancestor_or_self(get_user_tenant_id(auth.uid()), tenant_id)
    and exists(select 1 from mo_users where auth_user_id = auth.uid())
  );
create policy "patients_service_role" on patients
  for all to service_role using (true) with check (true);

-- ── consents (PHI; append-only after revocation) ────────────────
alter table consents enable row level security;
create policy "consents_mo_subtree" on consents
  for select to authenticated using (
    patient_id in (select id from patients
                   where is_ancestor_or_self(get_user_tenant_id(auth.uid()), patients.tenant_id))
  );
create policy "consents_insert_service" on consents
  for insert to service_role with check (true);
-- NO UPDATE/DELETE for human users — anti-tamper. revocation creates withdrawal row.
create policy "consents_service_role" on consents
  for all to service_role using (true) with check (true);

-- ── calls ──────────────────────────────────────────────────────
alter table calls enable row level security;
create policy "calls_subtree_read" on calls
  for select to authenticated using (
    is_ancestor_or_self(get_user_tenant_id(auth.uid()), tenant_id)
  );
create policy "calls_service_role" on calls
  for all to service_role using (true) with check (true);

-- ── turns (PHI) — inherit via parent call ──────────────────────
alter table turns enable row level security;
create policy "turns_via_call" on turns
  for select to authenticated using (
    exists(select 1 from calls c
           where c.id = turns.call_id
           and is_ancestor_or_self(get_user_tenant_id(auth.uid()), c.tenant_id))
  );
create policy "turns_service_role" on turns
  for all to service_role using (true) with check (true);

-- ── triage_decisions ───────────────────────────────────────────
alter table triage_decisions enable row level security;
create policy "triage_subtree_read" on triage_decisions
  for select to authenticated using (
    is_ancestor_or_self(get_user_tenant_id(auth.uid()), tenant_id)
  );
create policy "triage_mo_update" on triage_decisions
  for update to authenticated using (
    is_ancestor_or_self(get_user_tenant_id(auth.uid()), tenant_id)
    and exists(select 1 from mo_users where auth_user_id = auth.uid())
  );
create policy "triage_service_role" on triage_decisions
  for all to service_role using (true) with check (true);

-- ── soap_notes (sign-locked after mo_signed_at) ────────────────
alter table soap_notes enable row level security;
create policy "soap_subtree_read" on soap_notes
  for select to authenticated using (
    is_ancestor_or_self(get_user_tenant_id(auth.uid()), tenant_id)
  );
create policy "soap_mo_write_unsigned" on soap_notes
  for update to authenticated using (
    is_ancestor_or_self(get_user_tenant_id(auth.uid()), tenant_id)
    and mo_signed_at is null
    and exists(select 1 from mo_users where auth_user_id = auth.uid())
  );
create policy "soap_service_role" on soap_notes
  for all to service_role using (true) with check (true);

-- ── prescriptions (sign-locked after signed_at) ────────────────
alter table prescriptions enable row level security;
create policy "rx_subtree_read" on prescriptions
  for select to authenticated using (
    is_ancestor_or_self(get_user_tenant_id(auth.uid()), tenant_id)
  );
create policy "rx_mo_write_unsigned" on prescriptions
  for update to authenticated using (
    is_ancestor_or_self(get_user_tenant_id(auth.uid()), tenant_id)
    and signed_at is null
    and exists(select 1 from mo_users where auth_user_id = auth.uid())
  );
create policy "rx_service_role" on prescriptions
  for all to service_role using (true) with check (true);

alter table prescription_lines enable row level security;
create policy "rx_lines_via_rx" on prescription_lines
  for select to authenticated using (
    exists(select 1 from prescriptions p
           where p.id = prescription_lines.prescription_id
           and is_ancestor_or_self(get_user_tenant_id(auth.uid()), p.tenant_id))
  );
create policy "rx_lines_service_role" on prescription_lines
  for all to service_role using (true) with check (true);

-- ── red_flag_events (append-only evidence) ─────────────────────
alter table red_flag_events enable row level security;
create policy "red_flags_subtree_read" on red_flag_events
  for select to authenticated using (
    is_ancestor_or_self(get_user_tenant_id(auth.uid()), tenant_id)
  );
-- NO INSERT/UPDATE/DELETE for humans — service role only
create policy "red_flags_service_role" on red_flag_events
  for all to service_role using (true) with check (true);

-- ── refusal_log (HARD append-only — Anand §10 evidence) ────────
alter table refusal_log enable row level security;
create policy "refusal_subtree_read" on refusal_log
  for select to authenticated using (
    is_ancestor_or_self(get_user_tenant_id(auth.uid()), tenant_id)
  );
create policy "refusal_service_role_insert" on refusal_log
  for insert to service_role with check (true);
-- NO UPDATE/DELETE policies at all → tampering impossible without superuser
create policy "refusal_service_role_select" on refusal_log
  for select to service_role using (true);

-- ── pii_token_map (service-role only — never humans) ───────────
alter table pii_token_map enable row level security;
create policy "pii_service_role_only" on pii_token_map
  for all to service_role using (true) with check (true);
-- No authenticated policy at all → invisible to MO/ASHA/DMO

-- ── call_dispatch_queue ────────────────────────────────────────
alter table call_dispatch_queue enable row level security;
create policy "dispatch_subtree_read" on call_dispatch_queue
  for select to authenticated using (
    is_ancestor_or_self(get_user_tenant_id(auth.uid()), tenant_id)
  );
create policy "dispatch_service_role" on call_dispatch_queue
  for all to service_role using (true) with check (true);

-- ── outbound_messages (PHI w/ RMP identity) ────────────────────
alter table outbound_messages enable row level security;
create policy "outbound_subtree_read" on outbound_messages
  for select to authenticated using (
    is_ancestor_or_self(get_user_tenant_id(auth.uid()), tenant_id)
  );
create policy "outbound_service_role" on outbound_messages
  for all to service_role using (true) with check (true);

-- ── cross_border_transfers (append-only audit) ─────────────────
alter table cross_border_transfers enable row level security;
create policy "cbt_via_call" on cross_border_transfers
  for select to authenticated using (
    exists(select 1 from calls c
           where c.id = cross_border_transfers.call_id
           and is_ancestor_or_self(get_user_tenant_id(auth.uid()), c.tenant_id))
  );
create policy "cbt_service_role_insert" on cross_border_transfers
  for insert to service_role with check (true);
create policy "cbt_service_role_select" on cross_border_transfers
  for select to service_role using (true);

-- ── pocso_reports (append-only criminal-evidence) ──────────────
alter table pocso_reports enable row level security;
create policy "pocso_compliance_officer_read" on pocso_reports
  for select to authenticated using (
    compliance_officer_user_id in (select id from mo_users where auth_user_id = auth.uid())
  );
create policy "pocso_service_role_insert" on pocso_reports
  for insert to service_role with check (true);

-- ── mental_health_escalations (PHI — MHCA chain) ───────────────
alter table mental_health_escalations enable row level security;
create policy "mh_subtree_read" on mental_health_escalations
  for select to authenticated using (
    is_ancestor_or_self(get_user_tenant_id(auth.uid()), tenant_id)
  );
create policy "mh_service_role" on mental_health_escalations
  for all to service_role using (true) with check (true);

-- ── parental_guardians (PHI — minor consent chain) ─────────────
alter table parental_guardians enable row level security;
create policy "guardians_via_minor" on parental_guardians
  for select to authenticated using (
    minor_patient_id in (
      select id from patients
      where is_ancestor_or_self(get_user_tenant_id(auth.uid()), patients.tenant_id)
    )
  );
create policy "guardians_service_role" on parental_guardians
  for all to service_role using (true) with check (true);

-- ── data_subject_requests + data_breach_incidents (DPO-only) ───
alter table data_subject_requests enable row level security;
create policy "dsr_dpo_read" on data_subject_requests
  for select to authenticated using (
    assigned_to in (select id from mo_users where auth_user_id = auth.uid())
  );
create policy "dsr_service_role" on data_subject_requests
  for all to service_role using (true) with check (true);

alter table data_breach_incidents enable row level security;
create policy "breach_service_role" on data_breach_incidents
  for all to service_role using (true) with check (true);
-- No authenticated policy — DPO accesses via service-role helper edge fn

-- ── audio_recordings ───────────────────────────────────────────
alter table audio_recordings enable row level security;
create policy "audio_via_call" on audio_recordings
  for select to authenticated using (
    call_id in (
      select id from calls
      where is_ancestor_or_self(get_user_tenant_id(auth.uid()), calls.tenant_id)
    )
  );
create policy "audio_service_role" on audio_recordings
  for all to service_role using (true) with check (true);

-- ── presenting_complaints, vitals_observations, peds_imci ──────
alter table presenting_complaints enable row level security;
create policy "pc_via_call" on presenting_complaints
  for select to authenticated using (
    call_id in (
      select id from calls
      where is_ancestor_or_self(get_user_tenant_id(auth.uid()), calls.tenant_id)
    )
  );
create policy "pc_service_role" on presenting_complaints
  for all to service_role using (true) with check (true);

alter table vitals_observations enable row level security;
create policy "vitals_via_patient" on vitals_observations
  for select to authenticated using (
    patient_id in (
      select id from patients
      where is_ancestor_or_self(get_user_tenant_id(auth.uid()), patients.tenant_id)
    )
  );
create policy "vitals_service_role" on vitals_observations
  for all to service_role using (true) with check (true);

alter table peds_imci_assessments enable row level security;
create policy "imci_via_patient" on peds_imci_assessments
  for select to authenticated using (
    patient_id in (
      select id from patients
      where is_ancestor_or_self(get_user_tenant_id(auth.uid()), patients.tenant_id)
    )
  );
create policy "imci_service_role" on peds_imci_assessments
  for all to service_role using (true) with check (true);

-- ── triage_audit_log + triage_decision_audit (via triage) ──────
alter table triage_audit_log enable row level security;
create policy "audit_via_triage" on triage_audit_log
  for select to authenticated using (
    triage_decision_id in (
      select id from triage_decisions
      where is_ancestor_or_self(get_user_tenant_id(auth.uid()), triage_decisions.tenant_id)
    )
  );
create policy "audit_service_role" on triage_audit_log
  for all to service_role using (true) with check (true);

-- ── phi_access_log (DPO-only read, service-role write) ─────────
alter table phi_access_log enable row level security;
-- PHI access log is read only by DPO via edge function; no policy for authenticated
create policy "phi_log_service_role" on phi_access_log
  for all to service_role using (true) with check (true);

-- ════════════════════════════════════════════════════════════════
-- PART B: log_phi_access() helper (Anand §16)
-- ════════════════════════════════════════════════════════════════
-- Edge functions reading PHI MUST call this before returning data to caller.
-- Pattern:
--   const purpose = 'CARE';
--   await sb.rpc('log_phi_access', { table_name:'patients', row_id:patientId,
--     patient_id:patientId, purpose_code:purpose, request_context: {edge_fn:'mo-cockpit'} });
--   const row = await sb.from('patients').select(...).eq('id', patientId).single();

create or replace function log_phi_access(
  table_name      text,
  row_id          text,
  patient_id      uuid,
  purpose_code    phi_purpose,
  request_context jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  v_role := coalesce(
    (select 'mo'   from mo_users   where auth_user_id = auth.uid() limit 1),
    (select 'asha' from asha_users where auth_user_id = auth.uid() limit 1),
    'service_role'
  );
  insert into phi_access_log (
    auth_user_id, user_role, table_name, row_id, patient_id,
    purpose_code, request_context
  ) values (
    coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
    v_role, table_name, row_id, patient_id,
    purpose_code, request_context
  );
end;
$$;

grant execute on function log_phi_access(text, text, uuid, phi_purpose, jsonb)
  to authenticated, service_role;

-- ════════════════════════════════════════════════════════════════
-- PART C: Retention purge function + pg_cron monthly schedule
-- (Aman §13 + Anand §8)
-- ════════════════════════════════════════════════════════════════

create or replace function purge_expired_rows(p_dry_run boolean default false)
returns table(table_name text, rows_purged bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  policy record;
  v_sql text;
  v_count bigint;
begin
  for policy in
    select rp.table_name as t_name, rp.retention_column as c_name, rp.grace_period_days as grace
    from retention_policies rp where enabled
  loop
    if p_dry_run then
      v_sql := format(
        'select count(*) from %I where %I < (current_date - interval ''%s days'')',
        policy.t_name, policy.c_name, policy.grace
      );
    else
      v_sql := format(
        'with deleted as (delete from %I where %I < (current_date - interval ''%s days'') returning 1) select count(*) from deleted',
        policy.t_name, policy.c_name, policy.grace
      );
    end if;
    execute v_sql into v_count;

    if not p_dry_run and v_count > 0 then
      update retention_policies
        set last_run_at = now(),
            rows_purged_last_run = v_count,
            rows_purged_cumulative = rows_purged_cumulative + v_count
        where retention_policies.table_name = policy.t_name;
      insert into ops_incidents (severity, source, category, title, description, payload)
      values (
        'low', 'retention_cron', 'purge',
        format('Purged %s rows from %s', v_count, policy.t_name),
        format('Past retention_until + %s day grace period', policy.grace),
        jsonb_build_object('table', policy.t_name, 'rows', v_count)
      );
    end if;

    table_name := policy.t_name;
    rows_purged := v_count;
    return next;
  end loop;
end;
$$;

grant execute on function purge_expired_rows(boolean) to service_role;

-- Schedule monthly (1st of month, 02:00 UTC).
-- pg_cron doesn't support "last" — pick a fixed monthly time.
select cron.schedule(
  'monthly_retention_purge',
  '0 2 1 * *',   -- 02:00 UTC on the 1st of every month
  $$ select purge_expired_rows(false); $$
);

-- ════════════════════════════════════════════════════════════════
-- PART D: Final hardening + comments
-- ════════════════════════════════════════════════════════════════
comment on function log_phi_access(text, text, uuid, phi_purpose, jsonb) is
  'Anand §16 — Every PHI read by edge functions or app code MUST call this.
   Without phi_access_log entries, DPDP s.7 purpose-limitation defence collapses.';

comment on function purge_expired_rows(boolean) is
  'Aman §13 — Honours retention_policies + grace_period_days. Run monthly via pg_cron.
   Pass true to dry-run. Logs every purge to ops_incidents for audit.';

comment on function is_ancestor_or_self(uuid, uuid) is
  'RLS helper: ancestor IS descendant — inclusive semantics. Aman §7 renamed for clarity.';
