-- ═══════════════════════════════════════════════════════════════════
-- Migration: mo_only_drug_hints column on soap_notes
-- Author: 9-dim board audit §2 finding (aanya · mo_only_drug_hints
--   column does not exist; drug-name leak path is open)
-- Date: 2026-06-26
--
-- Anand red-line #1 (no drug names in patient-facing channels) was
-- being broken because:
--   1. soap-generate was supposed to write drug suggestions into
--      mo_only_drug_hints, but the column never existed — the field
--      was being silently dropped.
--   2. cockpit-feed aliased mo_only_drug_hints:original_text (a full
--      JSON blob) which leaked the entire SOAP into the wrong place.
--   3. vaani-signoff reads soap.plan straight to TTS with NO drug
--      regex. One LLM hallucination of "Paracetamol" → spoken to the
--      caller.
--
-- This migration adds the column + a CHECK constraint to keep the
-- patient-facing plan column free of common dosage patterns.
-- ═══════════════════════════════════════════════════════════════════

-- Add the column for MO-only drug suggestions. text[] lets the LLM
-- list multiple options ("amoxicillin 500mg BD x5d", "azithro 500 OD
-- x3d") that the RMP picks from / overrides.
alter table soap_notes
  add column if not exists mo_only_drug_hints text[] default '{}';

comment on column soap_notes.mo_only_drug_hints is
  'MO-only field. Drug names + dosages the LLM suggests for the RMP. '
  'NEVER rendered to patient-facing surfaces. Cockpit shows under a '
  'distinct amber AI-suggestion panel. vaani-signoff explicitly does '
  'NOT read from this column.';

-- Drop the broken cockpit-feed alias if anyone reads it: the
-- alias was "mo_only_drug_hints:original_text" which selected the raw
-- transcript blob. Force callers to update.
-- (The fix on the JS side is in supabase/functions/cockpit-feed/index.ts.)

-- Belt-and-braces: a CHECK that the patient-facing `plan` column does
-- NOT contain common drug indicators. This catches LLM regressions
-- before they reach TTS. Pattern covers the common Indian primary-
-- care formulary surface (mg/mcg/ml dosing, common drug suffixes,
-- BD/TDS/QID frequency markers).
alter table soap_notes
  add constraint chk_plan_no_drug_names
  check (
    plan is null
    or (
      plan !~* '\m([0-9]+\s*(mg|mcg|ml|g)\b|paracetamol|amoxicillin|azithromycin|metformin|amlodipine|telmisartan|atorvastatin|omeprazole|ranitidine|ibuprofen|aspirin|crocin|dolo|combiflam|augmentin|cefixime|ciprofloxacin|ofloxacin|metronidazole|albendazole|ondansetron|domperidone)\M'
      and plan !~* '\m(BD|TDS|QID|HS|PRN|SOS)\M'
    )
  ) not valid;

-- NOTE: 'not valid' means existing rows are not checked (we don't have
-- any production data yet; this is hackathon-stage). For the demo path,
-- run:
--   alter table soap_notes validate constraint chk_plan_no_drug_names;
-- after seeding so any inserted row is checked at write time.

comment on constraint chk_plan_no_drug_names on soap_notes is
  'Anand red-line #1: patient-facing plan column must not contain drug '
  'names or dosages. Belt-and-braces alongside _shared/drug-scrub.ts '
  'helper invoked by vaani-signoff.';
