-- ═══════════════════════════════════════════════════════════════════
-- Migration: columns + indices needed by the UX-polish + backend-polish
-- batches that close out the 9-dim audit §4 medium items.
--
-- All applied live via the management API before this commit; the file
-- exists so a fresh dev environment matches production.
-- ═══════════════════════════════════════════════════════════════════

-- soap-generate: persist callback ETA + safety-net text the LLM emits
alter table soap_notes
  add column if not exists patient_callback_eta_min integer;
comment on column soap_notes.patient_callback_eta_min is
  'How soon (minutes) the cockpit RMP should call the patient back. '
  'RED 15-30, AMBER 60-180, GREEN 240-720. Surfaced in the Cockpit card.';

alter table soap_notes
  add column if not exists safety_net_text text;
comment on column soap_notes.safety_net_text is
  'Return-precautions text the LLM emits — what symptoms warrant immediate '
  'callback ("if breath gets worse, fever > 38.5", etc.). Appended to '
  'the patient WhatsApp / soul callback message verbatim.';

-- call_costs: track cache reads + writes separately for honest accounting
-- (audit D6 — VAPI managed provider doesn't currently cache, but the
--  post-call paths DO; we want the per-path number when we audit Stage 4).
alter table call_costs
  add column if not exists claude_cache_read_inr numeric(10, 4) default 0;
comment on column call_costs.claude_cache_read_inr is
  'Cost of input tokens served from Anthropic prompt cache. '
  '~10x cheaper than non-cached input. Audit D6.';

alter table call_costs
  add column if not exists claude_cache_create_inr numeric(10, 4) default 0;
comment on column call_costs.claude_cache_create_inr is
  'Cost of cache-create input tokens (the first turn that primes the '
  'cache). ~1.25x non-cached input.';

-- triage-score: a unique index on call_id lets us short-circuit
-- re-classification on a re-run and gives Postgres a fast lookup
-- for the cockpit-feed join.
create unique index if not exists ux_triage_decisions_call_id
  on triage_decisions(call_id);
comment on index ux_triage_decisions_call_id is
  'Audit §4 (devansh): one triage per call is the contract; enforce + speed.';
