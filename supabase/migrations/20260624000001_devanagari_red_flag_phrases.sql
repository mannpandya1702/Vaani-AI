-- ═════════════════════════════════════════════════════════════════
-- Migration 007 — Devanagari red-flag phrases (eval surfaced bug)
--
-- The eval harness (eval/run.ts) revealed that v1's seed phrases for
-- lang='hi' are all Romanized ("seene mein dard"), but Vaani's prompt
-- v2.1 outputs Devanagari ("सीने में दर्द"). On a real call, Sarvam
-- Saaras transcribes the patient's Hindi speech to Devanagari script,
-- and red-flag-check's Layer 1 lookup misses every phrase, falling
-- through to Sarvam-M which is deprecated. Result: 0% red-flag recall.
--
-- This migration adds Devanagari equivalents of the highest-leverage
-- phrases across the 16 red-flag categories. Romanized rows are kept
-- (back-compat with any code paths that send Roman-Hindi).
-- ═════════════════════════════════════════════════════════════════

insert into red_flag_phrases (category, lang, phrase, severity_score, example_context, detection_method, min_confidence) values
  -- Cardiac
  ('cardiac',       'hi', 'सीने में दर्द',             10, 'ACS suspect — escalate', 'exact', 0.95),
  ('cardiac',       'hi', 'सीने में बहुत ज़ोरदार दर्द',  10, 'ACS suspect — escalate', 'exact', 0.95),
  ('cardiac',       'hi', 'छाती में दर्द',              10, 'ACS suspect — escalate', 'exact', 0.95),
  ('cardiac',       'hi', 'दिल में दर्द',               10, 'ACS suspect — escalate', 'exact', 0.95),
  ('cardiac',       'hi', 'बायें हाथ में दर्द',         9,  'Atypical MI — escalate', 'exact', 0.90),
  ('cardiac',       'hi', 'पसीना बहुत है',              7,  'Diaphoresis — workup',  'exact', 0.85),
  ('cardiac',       'hi', 'पसीना बहुत आ रहा है',        7,  'Diaphoresis — workup',  'exact', 0.85),
  ('cardiac',       'hi', 'जबड़े में दर्द',             8,  'Atypical MI — escalate', 'exact', 0.90),

  -- Respiratory
  ('respiratory',   'hi', 'साँस नहीं आ रही',           10, 'Acute dyspnea — escalate', 'exact', 0.95),
  ('respiratory',   'hi', 'साँस फूल रही है',           9,  'Acute dyspnea — escalate', 'exact', 0.90),
  ('respiratory',   'hi', 'दम घुट रहा है',             10, 'Acute dyspnea — escalate', 'exact', 0.95),
  ('respiratory',   'hi', 'दम घुटना',                  10, 'Acute dyspnea — escalate', 'exact', 0.95),
  ('respiratory',   'hi', 'घरघराहट हो रही है',         8,  'Wheeze — workup',         'exact', 0.85),
  ('respiratory',   'hi', 'इन्हेलर से फ़ायदा नहीं',    9,  'Asthma exacerbation',    'exact', 0.90),

  -- Hemoptysis
  ('hemoptysis',    'hi', 'खाँसी में खून',             10, 'TB/Ca lung — escalate',   'exact', 1.0),
  ('hemoptysis',    'hi', 'बलगम में खून',              10, 'TB suspect — escalate',  'exact', 1.0),
  ('hemoptysis',    'hi', 'खून थूका',                  10, 'Hemoptysis — escalate',  'exact', 0.95),

  -- Stroke BE-FAST
  ('stroke_befast', 'hi', 'चेहरा एक तरफ़ झुक गया',     10, 'Stroke suspect — 108',   'exact', 0.98),
  ('stroke_befast', 'hi', 'चेहरा एक तरफ झुक गया',     10, 'Stroke suspect — 108',   'exact', 0.98),
  ('stroke_befast', 'hi', 'बात लड़खड़ा रही है',       10, 'Stroke suspect — 108',   'exact', 0.95),
  ('stroke_befast', 'hi', 'बात लड़खड़ा रही',          10, 'Stroke suspect — 108',   'exact', 0.95),
  ('stroke_befast', 'hi', 'आवाज़ लड़खड़ा रही',         10, 'Stroke suspect — 108',   'exact', 0.95),
  ('stroke_befast', 'hi', 'हाथ सुन्न हो गया',          10, 'Stroke suspect — 108',   'exact', 0.95),
  ('stroke_befast', 'hi', 'हाथ सुन्न पड़ गया',         10, 'Stroke suspect — 108',   'exact', 0.95),
  ('stroke_befast', 'hi', 'सुन्न पड़ गया',             9,  'Numbness — workup',      'exact', 0.85),

  -- Neuro
  ('neuro',         'hi', 'झटके आए',                   10, 'Seizure — escalate',     'exact', 0.95),
  ('neuro',         'hi', 'बेहोश हो गया',             10, 'LOC — escalate',         'exact', 0.95),
  ('neuro',         'hi', 'बेहोशी',                    9,  'LOC suspect — workup',   'exact', 0.85),
  ('neuro',         'hi', 'पहचान नहीं रहीं',           9,  'Delirium — sepsis r/o',  'exact', 0.85),
  ('neuro',         'hi', 'ठीक से बात नहीं कर पा',     8,  'AMS — workup',           'exact', 0.80),

  -- Mental health
  ('mental_health', 'hi', 'मरने का मन',                10, 'MHCA 14416 — escalate',  'exact', 0.98),
  ('mental_health', 'hi', 'मरने का मन कर रहा',         10, 'MHCA 14416 — escalate',  'exact', 0.98),
  ('mental_health', 'hi', 'जान देने का मन',            10, 'MHCA 14416 — escalate',  'exact', 0.98),
  ('mental_health', 'hi', 'खुदकुशी',                   10, 'MHCA 14416 — escalate',  'exact', 0.98),
  ('mental_health', 'hi', 'कुछ कर ही लेना',            10, 'MHCA 14416 — escalate',  'exact', 0.95),

  -- Obstetric / preeclampsia
  ('obstetric',     'hi', 'गर्भ में खून',              10, 'Antepartum bleed — 108', 'exact', 0.98),
  ('obstetric',     'hi', 'खून आ रहा है',              8,  'PV bleed — workup',      'exact', 0.85),
  ('preeclampsia_eclampsia','hi','आँखों में धुंधला',  10, 'Preeclampsia — 108',     'exact', 0.95),
  ('preeclampsia_eclampsia','hi','सर बहुत भारी',      9,  'Preeclampsia — 108',     'exact', 0.90),
  ('preeclampsia_eclampsia','hi','दौरा पड़ा',         10, 'Eclampsia — 108',        'exact', 0.98),

  -- Peds danger
  ('peds_danger',   'hi', 'दूध नहीं पी रहा',          10, 'IMCI danger sign — 108', 'exact', 0.95),
  ('peds_danger',   'hi', 'दूध नहीं पी रहा है',       10, 'IMCI danger sign — 108', 'exact', 0.95),
  ('peds_danger',   'hi', 'बच्चा सुस्त हो गया',       10, 'IMCI danger sign — 108', 'exact', 0.95),
  ('peds_danger',   'hi', 'सुस्त हो गया है',           9,  'IMCI lethargy — 108',    'exact', 0.90),
  ('peds_danger',   'hi', 'तेज़ी से साँस ले रहा',      10, 'IMCI fast breathing',    'exact', 0.95),
  ('peds_danger',   'hi', 'फास्ट ब्रीदिंग',           10, 'IMCI fast breathing',    'exact', 0.95),

  -- Envenomation
  ('envenomation',  'hi', 'साँप ने काटा',              10, 'Snake bite — 108 + ASV', 'exact', 1.0),
  ('envenomation',  'hi', 'सर्प ने काटा',              10, 'Snake bite — 108 + ASV', 'exact', 1.0),
  ('envenomation',  'hi', 'बिच्छू ने काटा',            10, 'Scorpion sting — 108',   'exact', 1.0),
  ('envenomation',  'hi', 'पैर सूज रहा',               7,  'Envenomation — workup',  'exact', 0.80),

  -- Rabies
  ('rabies_exposure','hi','कुत्ते ने काटा',           10, 'Rabies PEP — escalate',  'exact', 0.95),

  -- Sepsis
  ('sepsis',        'hi', 'पहचान भी नहीं रहीं',        9,  'Geriatric AMS — sepsis', 'exact', 0.85),
  ('sepsis',        'hi', 'बहुत कमज़ोर हैं',            7,  'Asthenia — workup',     'exact', 0.75),
  ('sepsis',        'hi', 'खाना भी नहीं खा रहीं',       7,  'Anorexia — workup',     'exact', 0.75),

  -- Burns
  ('burns',         'hi', 'बहुत बड़ी जलन',             10, 'Burn — 108',             'exact', 0.95),
  ('burns',         'hi', 'जल गया',                    8,  'Burn — workup',          'exact', 0.85),

  -- GI acute
  ('gi_acute',      'hi', 'पेट में बहुत दर्द',         9,  'Acute abdomen — workup', 'exact', 0.85),
  ('gi_acute',      'hi', 'पेट के ऊपर बहुत दर्द',      9,  'Epigastric pain',        'exact', 0.85),

  -- Trauma
  ('trauma',        'hi', 'खून बहुत बह रहा',           10, 'Major trauma — 108',     'exact', 0.95),
  ('trauma',        'hi', 'गिर गया था',                7,  'Fall — workup',          'exact', 0.75)
on conflict do nothing;
