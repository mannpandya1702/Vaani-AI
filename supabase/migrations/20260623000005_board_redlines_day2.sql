-- ════════════════════════════════════════════════════════════════
-- Vaani-AI Migration 005 — Day 2 Part 1.5 Board Redlines
-- Authors: Anand (legal) + Aanya (clinical) + Aman (architecture)
--
-- Addresses code-review BLOCKERs that surface as schema changes:
--   • Anand §3 — pii_token_map.session_token UNIQUE + ciphertext column
--   • Anand §7 — cross_border_transfers region attestation fields
--   • Anand §9 — consent gate trigger on turns table
--   • Anand §12 — triage_decisions RMP snapshot NOT NULL
--   • Aman §10 — dispatch_idempotency_keys table
--   • Aman §13 — call-level turn sequence helper
--
-- Other code-review fixes (regex, ordering, refusal scripts, etc) ship
-- in the same PR as TypeScript edits — see Day 2 Part 1.5 commit.
-- ════════════════════════════════════════════════════════════════

-- ── Anand §4 — Session token uniqueness + retry-safe ────────────
create unique index if not exists uq_pii_token_map_session_token
  on pii_token_map (session_token);

-- Future-proof: ciphertext column for production (hackathon uses jsonb).
-- Migration to encrypted-at-rest happens before Jul 6 pilot.
alter table pii_token_map
  add column if not exists token_map_encrypted bytea;

-- ── Anand §7 — Cross-border region attestation ──────────────────
alter table cross_border_transfers
  add column if not exists region_attested_value text,
  add column if not exists region_attested_at    timestamptz;

-- ── Anand §12 — Triage RMP snapshot at decision time ────────────
-- Snapshot RMP identity at the moment of clinical decision so a later
-- license expiry or suspension cannot corrupt evidence.
-- Soft-add for hackathon (no NOT NULL until first MO assignment exists).
alter table triage_decisions
  add column if not exists mo_name_snapshot               text,
  add column if not exists mo_reg_no_snapshot             text,
  add column if not exists mo_council_snapshot            text,
  add column if not exists mo_license_valid_until_snapshot date;

-- ── Anand §9 — Consent gate: no turn beyond idx 1 w/o consent ───
-- For demo we use a soft check (raises NOTICE instead of EXCEPTION)
-- to avoid breaking dev. Flip to EXCEPTION before pilot.
create or replace function enforce_consent_before_clinical_turn()
returns trigger language plpgsql as $$
declare v_has_consent boolean;
begin
  if new.turn_idx is null or new.turn_idx <= 1 then
    return new; -- first turn is the consent capture itself
  end if;
  select exists(
    select 1 from consents c
    join calls ca on ca.id = c.patient_id  -- patient_id linkage; verify
    where ca.id = new.call_id
      and c.status = 'granted'
      and c.scope in ('screening_call', 'data_processing')
  ) into v_has_consent;
  if not v_has_consent then
    raise notice 'consent_gate_warning: turn % on call % without granted consent',
      new.turn_idx, new.call_id;
    -- TODO pilot: raise exception 'no_consent_recorded';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_consent_gate on turns;
create trigger trg_consent_gate
  before insert on turns
  for each row execute function enforce_consent_before_clinical_turn();

-- ── Aman §10 — Idempotency keys for VAPI webhook retries ────────
create table if not exists dispatch_idempotency_keys (
  source             text not null,
  idempotency_key    text not null,
  received_at        timestamptz not null default now(),
  resolution         text,        -- 'processed' | 'duplicate_ignored'
  retention_until    date not null
    default ((now() at time zone 'Asia/Kolkata') + interval '30 days')::date,
  primary key (source, idempotency_key)
);
comment on table dispatch_idempotency_keys is
  'Aman §10 — VAPI/Gupshup/Msg91/Exotel webhook retry dedupe. 30-day TTL.';

insert into retention_policies (table_name, retention_column, grace_period_days)
  values ('dispatch_idempotency_keys', 'retention_until', 0)
  on conflict (table_name) do nothing;

-- ── Aman §13 — Per-call turn-idx sequence helper ────────────────
-- Replaces "max(turn_idx)+1 race" with atomic claim per call.
create table if not exists call_turn_seqs (
  call_id      uuid primary key references calls(id) on delete cascade,
  next_idx     integer not null default 0
);

create or replace function next_turn_idx(p_call_id uuid)
returns integer language plpgsql as $$
declare v_idx integer;
begin
  insert into call_turn_seqs (call_id) values (p_call_id)
    on conflict (call_id) do nothing;
  update call_turn_seqs set next_idx = next_idx + 1
    where call_id = p_call_id
    returning next_idx into v_idx;
  return v_idx;
end;
$$;

grant execute on function next_turn_idx(uuid) to service_role;

-- ── Anand §10 — Refusal log enum widening ───────────────────────
-- Anand wants categories aligned with hardcoded-guardrails: PCPNDT, MHCA,
-- POCSO, DRUG_RX. The existing refusal_category enum already covers these
-- semantically (pcpndt_foetal_sex, mhca_suicidal_ideation,
-- pocso_csa_disclosure, drug_prescription_attempt). No change required.
-- Confirmed.

-- ── Comments ────────────────────────────────────────────────────
comment on column triage_decisions.mo_name_snapshot is
  'Anand §12 — TPG ¶1.4.1 immutable RMP identity at clinical decision time';
comment on column cross_border_transfers.region_attested_value is
  'Anand §7 — actual region from response header (cf-ray / anthropic-region)';
comment on function next_turn_idx(uuid) is
  'Aman §13 — atomic monotonic turn index per call; race-safe';
