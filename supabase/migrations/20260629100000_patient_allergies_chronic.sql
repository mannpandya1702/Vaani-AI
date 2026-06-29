-- Patient profile: structured allergies + chronic conditions.
--
-- Vaani's intake already asks about chronic illness ("शुगर, बी.पी. या दिल?")
-- and now also asks allergies + village, but there was nowhere structured to
-- store the first two — so the cockpit Patients tab showed hard-coded
-- "Not recorded yet" placeholders. These columns let soap-generate backfill
-- them from the transcript (same path as age/sex/pregnancy) and let the
-- cockpit show real values. village_name already exists.
--
-- NULL = never asked/recorded (honest empty state in the UI).
-- '{}'  (empty array) = asked and the patient reported none.

alter table public.patients
  add column if not exists allergies text[],
  add column if not exists chronic_conditions text[];

comment on column public.patients.allergies is
  'Patient-stated allergies (drug/food/other), captured by the intake agent and extracted into structured form by soap-generate. NULL = not asked; empty array = none reported.';
comment on column public.patients.chronic_conditions is
  'Patient-stated chronic conditions (diabetes/hypertension/cardiac/etc), captured by the intake agent. NULL = not asked; empty array = none reported.';
