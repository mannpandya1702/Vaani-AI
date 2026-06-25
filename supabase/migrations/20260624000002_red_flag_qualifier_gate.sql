-- ═════════════════════════════════════════════════════════════════
-- Migration 008 — Qualifier-gate for red-flag rules
--
-- Eval baseline surfaced over-firing: bare "बुख़ार" / "दस्त" triggered
-- forceRedBand() on routine 3-day fever and uncomplicated gastro.
-- Result: 4/12 cases band-mismatched (Aman + Devansh diagnosis).
--
-- Fix: add `requires_qualifier text[]` per phrase. The phrase is a true
-- RED only when AT LEAST ONE qualifier label appears in the same call
-- transcript. Co-occurrence is checked in red-flag-check via the same
-- v_red_flag_lookup view.
--
-- Examples:
--   "बुख़ार"   needs   {high_fever, convulsion, rash_petechiae,
--                       breath_diff, duration_long, lethargy}
--   "खाँसी"   needs   {hemoptysis, dyspnea, fever_high, weight_loss}
--   "दस्त"    needs   {dehydration, blood_in_stool, high_volume, peds}
--
-- Classical RED phrases (chest pain, snake bite, suicidal ideation,
-- stroke signs) stay UNCONDITIONAL — empty array = no qualifier needed.
-- ═════════════════════════════════════════════════════════════════

-- Schema extension
alter table red_flag_phrases
  add column if not exists requires_qualifier text[] not null default '{}';

comment on column red_flag_phrases.requires_qualifier is
  'Empty = unconditional RED. Non-empty = phrase fires RED only when at '
  'least one of these qualifier tokens co-occurs in the same call.';

-- View update: surface the qualifier list to the rule-layer code
create or replace view v_red_flag_lookup as
select
  rfp.category,
  rfp.lang,
  rfp.phrase,
  rfp.severity_score,
  rfp.detection_method,
  rfp.min_confidence,
  rfp.requires_qualifier
from red_flag_phrases rfp
union all
select
  cs.red_flag_category,
  cs.lang,
  cs.surface_form,
  8 as severity_score,
  'exact',
  0.95,
  '{}'::text[] as requires_qualifier
from clinical_synonyms cs
where cs.is_red_flag_synonym and cs.red_flag_category is not null;

comment on view v_red_flag_lookup is
  'Aanya §2 + §9 — Unified red-flag detection surface for the rule layer '
  '(exact-match) and the LLM classifier (regex + semantic). '
  'Migration 008 added requires_qualifier — empty array = unconditional RED.';

-- ═════════════════════════════════════════════════════════════════
-- BACKFILL — the loosely-coupled phrases that were over-firing
-- ═════════════════════════════════════════════════════════════════

-- "पसीना" alone fires only with chest-pain qualifier (it's already in
-- cardiac category but diaphoresis without chest pain is just heat).
update red_flag_phrases
  set requires_qualifier = '{chest_pain, breath_diff, jaw_pain}'
  where category = 'cardiac'
    and phrase in ('पसीना बहुत है', 'पसीना बहुत आ रहा है', 'paseena aa raha hai');

-- "बायें हाथ में दर्द" alone could be a sprain. Pair with chest_pain
-- or diaphoresis.
update red_flag_phrases
  set requires_qualifier = '{chest_pain, jaw_pain, diaphoresis}'
  where category = 'cardiac' and phrase in ('बायें हाथ में दर्द', 'baayen haath mein dard');

-- "घरघराहट" (wheeze) alone is asthma management, not RED. Pair with
-- speech-difficulty or inhaler-failed.
update red_flag_phrases
  set requires_qualifier = '{speech_difficulty, inhaler_failed, accessory_use}'
  where category = 'respiratory'
    and phrase in ('घरघराहट हो रही है', 'wheezing');

-- "सुस्त" / "सुस्त हो गया" alone could be tiredness. Pair with peds-age
-- or AMS markers.
update red_flag_phrases
  set requires_qualifier = '{peds_under_5, no_feed, fever_high, respiratory}'
  where category = 'peds_danger' and phrase in ('सुस्त हो गया है');

-- "पैर सूज रहा" alone could be edema. Pair with snake_marks or pain.
update red_flag_phrases
  set requires_qualifier = '{snake_marks, fang_marks, severe_pain, fast_progression}'
  where category = 'envenomation' and phrase = 'पैर सूज रहा';

-- "गिर गया था" alone is a fall. Pair with LOC or bleed.
update red_flag_phrases
  set requires_qualifier = '{loc, head_injury, major_bleed, fracture_signs}'
  where category = 'trauma' and phrase = 'गिर गया था';

-- "बहुत कमज़ोर हैं" / "खाना भी नहीं खा रहीं" — sepsis only with AMS
-- or elderly + fever.
update red_flag_phrases
  set requires_qualifier = '{ams, elderly, fever, peds, hypotension}'
  where category = 'sepsis' and phrase in ('बहुत कमज़ोर हैं', 'खाना भी नहीं खा रहीं');

-- "खून आ रहा है" alone could be a cut. Obstetric only with pregnancy.
update red_flag_phrases
  set requires_qualifier = '{pregnancy, abdominal_pain, headache_severe, visual_changes}'
  where category = 'obstetric' and phrase = 'खून आ रहा है';

-- "जल गया" alone could be a minor burn. Pair with size/face/airway markers.
update red_flag_phrases
  set requires_qualifier = '{large_area, face_neck, airway, hot_liquid}'
  where category = 'burns' and phrase = 'जल गया';

-- "पेट में बहुत दर्द" alone is colic. Acute abdomen requires guarding/peritoneal signs.
update red_flag_phrases
  set requires_qualifier = '{guarding, rigid_abdomen, vomiting, fever}'
  where category = 'gi_acute' and phrase in ('पेट में बहुत दर्द');
