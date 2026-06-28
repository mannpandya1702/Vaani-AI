-- ═══════════════════════════════════════════════════════════════════
-- Migration: patient-language callback body for the soul-moment callback.
--
-- soap-generate rule 3 keeps Objective/Assessment/Plan in ENGLISH for the
-- MO chart review. But vaani-signoff reads the plan ALOUD to the patient on
-- the callback — so the patient heard English. This column holds a separate,
-- patient-LANGUAGE (hi/ta) spoken body that Vaani reads between the branded
-- opener ("डॉक्टर साहब ने देख लिया है") and closer. Drug-free, no "diagnosis".
-- NULL → vaani-signoff falls back to the assembled English plan (old behavior).
-- ═══════════════════════════════════════════════════════════════════
alter table soap_notes add column if not exists patient_callback_message text;

comment on column soap_notes.patient_callback_message is
  'Patient-language spoken callback body (drug-free, no diagnosis word). Read '
  'aloud by vaani-signoff between the branded opener and closer. NULL falls '
  'back to the assembled English plan.';
