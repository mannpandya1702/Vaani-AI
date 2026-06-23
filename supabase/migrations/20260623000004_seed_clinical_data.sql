-- ════════════════════════════════════════════════════════════════
-- Vaani-AI Migration 004 — Seed Clinical Data + Compliance Records
-- Authors: Aanya §2 + §9 (red flags + synonyms)
--          Anand §1 + §15 (DPDP notice v1.0 + DLT templates)
--
-- Seeds:
--   - 16 red_flag_phrases categories × Hi/Ta/En × 2-4 phrases each
--   - Top 20 clinical_synonyms × Hi/Ta/En
--   - DPDP notice v1.0 in Hindi/Tamil/English (verbatim from Anand §14)
--
-- All phrases authored by Aanya from her vernacular dictionary review.
-- Demo tenant + DLT templates land separately when first tenant is provisioned.
-- ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
-- PART A: Red-Flag Phrase Library (16 categories × 3 langs)
-- ════════════════════════════════════════════════════════════════

-- ── Cardiac (chest pain, MI, arm/jaw pain) ──────────────────────
insert into red_flag_phrases (category, lang, phrase, severity_score, example_context, detection_method, min_confidence) values
  ('cardiac', 'hi', 'seene mein dard',          10, 'classic anginal pain',           'exact', 1.0),
  ('cardiac', 'hi', 'chaati mein dard',         10, 'chest pain colloquial',          'exact', 1.0),
  ('cardiac', 'hi', 'dil mein dard',            10, 'cardiac discomfort',             'exact', 1.0),
  ('cardiac', 'hi', 'baayen haath mein dard',    9, 'radiation atypical women/DM',    'exact', 1.0),
  ('cardiac', 'hi', 'jabde mein dard',           9, 'jaw radiation',                  'exact', 1.0),
  ('cardiac', 'hi', 'paseena aa raha hai',       7, 'diaphoresis w/ chest pain',      'regex', 0.85),
  ('cardiac', 'ta', 'நெஞ்சு வலி',               10, 'chest pain Tamil',               'exact', 1.0),
  ('cardiac', 'ta', 'மார்பு வலி',                10, 'chest pain alt',                 'exact', 1.0),
  ('cardiac', 'ta', 'இடது கை வலி',                9, 'left arm radiation',             'exact', 1.0),
  ('cardiac', 'en', 'chest pain',               10, 'standard',                       'exact', 1.0),
  ('cardiac', 'en', 'tightness in chest',        9, 'pressure-like',                  'regex', 0.9),
  ('cardiac', 'en', 'left arm pain',             9, 'radiation',                      'exact', 1.0);

-- ── Respiratory (dyspnea, hemoptysis) ───────────────────────────
insert into red_flag_phrases (category, lang, phrase, severity_score, example_context, detection_method, min_confidence) values
  ('respiratory', 'hi', 'saans nahi aa rahi',    10, 'severe dyspnea',                'exact', 1.0),
  ('respiratory', 'hi', 'dam ghut raha hai',     10, 'air hunger',                    'exact', 1.0),
  ('respiratory', 'hi', 'saans phool rahi hai',   8, 'exertional dyspnea',            'exact', 1.0),
  ('respiratory', 'hi', 'aaram karte hue bhi saans phool rahi', 10, 'rest dyspnea',  'regex', 0.9),
  ('respiratory', 'ta', 'மூச்சு திணறல்',          10, 'breathlessness',                'exact', 1.0),
  ('respiratory', 'ta', 'மூச்சு வாங்குதல்',        9, 'gasping',                       'exact', 1.0),
  ('respiratory', 'en', 'can''t breathe',         10, 'severe',                       'exact', 1.0),
  ('respiratory', 'en', 'short of breath at rest', 10, 'rest dyspnea',                 'regex', 0.9),
  ('respiratory', 'en', 'breathless',              8, 'general',                       'exact', 1.0);

-- ── Hemoptysis (NEW category) ───────────────────────────────────
insert into red_flag_phrases (category, lang, phrase, severity_score, example_context, detection_method, min_confidence) values
  ('hemoptysis', 'hi', 'khansi mein khoon',      10, 'TB/Ca lung',                    'exact', 1.0),
  ('hemoptysis', 'hi', 'balgam mein khoon',      10, 'TB suspect',                    'exact', 1.0),
  ('hemoptysis', 'ta', 'இருமலில் ரத்தம்',         10, 'cough w/ blood',                'exact', 1.0),
  ('hemoptysis', 'en', 'coughing blood',         10, 'standard',                      'exact', 1.0),
  ('hemoptysis', 'en', 'blood in sputum',        10, 'standard',                      'exact', 1.0);

-- ── Neuro (AMS, seizure) — see stroke_befast separately ─────────
insert into red_flag_phrases (category, lang, phrase, severity_score, example_context, detection_method, min_confidence) values
  ('neuro', 'hi', 'behosh ho gaya',              10, 'unconscious',                   'exact', 1.0),
  ('neuro', 'hi', 'jhatke aaye',                 10, 'seizure',                       'exact', 1.0),
  ('neuro', 'hi', 'mirgi ka daura',              10, 'epileptic fit',                 'exact', 1.0),
  ('neuro', 'hi', 'hosh mein nahi hai',           9, 'AMS',                            'exact', 1.0),
  ('neuro', 'hi', 'naam pehchaan nahi raha',      8, 'confusion',                     'regex', 0.85),
  ('neuro', 'ta', 'மயக்கம்',                     10, 'unconscious',                   'exact', 1.0),
  ('neuro', 'ta', 'வலிப்பு',                     10, 'seizure',                       'exact', 1.0),
  ('neuro', 'en', 'unconscious',                 10, 'standard',                      'exact', 1.0),
  ('neuro', 'en', 'seizure',                     10, 'standard',                      'exact', 1.0),
  ('neuro', 'en', 'confused',                     7, 'AMS',                            'exact', 1.0);

-- ── Stroke BE-FAST (NEW category — <4.5h thrombolysis window) ───
insert into red_flag_phrases (category, lang, phrase, severity_score, example_context, detection_method, min_confidence) values
  ('stroke_befast', 'hi', 'chehra ek taraf jhuk gaya',  10, 'F=Face droop',           'exact', 1.0),
  ('stroke_befast', 'hi', 'muh tedha ho gaya',          10, 'facial palsy',           'exact', 1.0),
  ('stroke_befast', 'hi', 'haath uth nahi raha',         10, 'A=Arm weakness',         'exact', 1.0),
  ('stroke_befast', 'hi', 'boli badal gayi',             10, 'S=Speech slurred',       'exact', 1.0),
  ('stroke_befast', 'hi', 'bolne mein dikkat',           10, 'aphasia/dysarthria',     'exact', 1.0),
  ('stroke_befast', 'ta', 'வாய் கோணி',                   10, 'face droop',             'exact', 1.0),
  ('stroke_befast', 'ta', 'பேச்சு குழறல்',                10, 'slurred speech',         'exact', 1.0),
  ('stroke_befast', 'en', 'face droop',                  10, 'BE-FAST F',              'exact', 1.0),
  ('stroke_befast', 'en', 'arm weakness',                10, 'BE-FAST A',              'exact', 1.0),
  ('stroke_befast', 'en', 'slurred speech',              10, 'BE-FAST S',              'exact', 1.0);

-- ── Obstetric (PPH, postpartum) ─────────────────────────────────
insert into red_flag_phrases (category, lang, phrase, severity_score, example_context, detection_method, min_confidence) values
  ('obstetric', 'hi', 'delivery ke baad khoon zyada',    10, 'PPH',                   'regex', 0.9),
  ('obstetric', 'hi', 'pad ek ghante mein bhar raha',    10, 'PPH soaked pad',        'regex', 0.9),
  ('obstetric', 'hi', 'mahawari mein khoon zyada',        7, 'menorrhagia',           'exact', 1.0),
  ('obstetric', 'ta', 'பிரசவத்திற்கு பிறகு ரத்தப்போக்கு', 10, 'PPH',                   'exact', 1.0),
  ('obstetric', 'en', 'postpartum bleeding',             10, 'PPH',                   'exact', 1.0),
  ('obstetric', 'en', 'soaked pad in hour',              10, 'PPH severity',          'regex', 0.9);

-- ── Pre-eclampsia (NEW category) ────────────────────────────────
insert into red_flag_phrases (category, lang, phrase, severity_score, example_context, detection_method, min_confidence) values
  ('preeclampsia_eclampsia', 'hi', 'sir dard aur aankhon mein dhabbe', 10, 'PE triad',         'regex', 0.9),
  ('preeclampsia_eclampsia', 'hi', 'pet ke upar dard pregnancy mein', 10, 'epigastric in preg', 'regex', 0.9),
  ('preeclampsia_eclampsia', 'hi', 'BP zyada hai aur sir dard',     10, 'PIH symptom',        'regex', 0.9),
  ('preeclampsia_eclampsia', 'ta', 'கர்ப்ப காலத்தில் தலைவலி',         10, 'headache in preg',   'exact', 1.0),
  ('preeclampsia_eclampsia', 'en', 'headache and visual changes in pregnancy', 10, 'PE',       'regex', 0.9),
  ('preeclampsia_eclampsia', 'en', 'severe epigastric pain in pregnancy', 10, 'HELLP risk',     'regex', 0.9);

-- ── Mammal bite (Rabies — NEW category) ─────────────────────────
insert into red_flag_phrases (category, lang, phrase, severity_score, example_context, detection_method, min_confidence) values
  ('rabies_exposure', 'hi', 'kutte ne kaata',             10, 'dog bite',              'exact', 1.0),
  ('rabies_exposure', 'hi', 'bandar ne kaata',            10, 'monkey bite',           'exact', 1.0),
  ('rabies_exposure', 'hi', 'jaanwar ne kaata',           10, 'any mammal',            'exact', 1.0),
  ('rabies_exposure', 'hi', 'kaate ke baad khoon nikla',  10, 'Cat III exposure',      'regex', 0.9),
  ('rabies_exposure', 'ta', 'நாய் கடித்தது',              10, 'dog bite',              'exact', 1.0),
  ('rabies_exposure', 'en', 'dog bite',                   10, 'standard',              'exact', 1.0),
  ('rabies_exposure', 'en', 'monkey bite',                10, 'standard',              'exact', 1.0),
  ('rabies_exposure', 'en', 'animal scratch broke skin',   9, 'category II/III',       'regex', 0.85);

-- ── Peds Danger Signs (<5y) ─────────────────────────────────────
insert into red_flag_phrases (category, lang, phrase, severity_score, example_context, detection_method, min_confidence) values
  ('peds_danger', 'hi', 'bachcha doodh nahi pee raha',    10, 'IMCI danger sign',      'regex', 0.9),
  ('peds_danger', 'hi', 'bachcha paani nahi peeta',       10, 'IMCI danger sign',      'regex', 0.9),
  ('peds_danger', 'hi', 'bachcha sust hai',                9, 'lethargy',              'exact', 1.0),
  ('peds_danger', 'hi', 'bachche ko jhatke',              10, 'peds seizure',          'exact', 1.0),
  ('peds_danger', 'ta', 'குழந்தை பால் குடிக்கவில்லை',     10, 'IMCI',                  'exact', 1.0),
  ('peds_danger', 'en', 'child cannot drink',             10, 'IMCI',                  'regex', 0.9),
  ('peds_danger', 'en', 'child lethargic',                 9, 'IMCI',                  'exact', 1.0);

-- ── Severe dehydration ──────────────────────────────────────────
insert into red_flag_phrases (category, lang, phrase, severity_score, example_context, detection_method, min_confidence) values
  ('dehydration_severe', 'hi', 'aankh dhansi hui hai',     9, 'sunken eyes',           'exact', 1.0),
  ('dehydration_severe', 'hi', 'pishab nahi kar raha',     9, 'oliguria',              'exact', 1.0),
  ('dehydration_severe', 'hi', 'rote mein aansoo nahi aate', 10, 'no tears peds',     'regex', 0.9),
  ('dehydration_severe', 'ta', 'சிறுநீர் இல்லை',           9, 'no urine',              'exact', 1.0),
  ('dehydration_severe', 'en', 'no urine for 6 hours',     9, 'severe',                'regex', 0.9),
  ('dehydration_severe', 'en', 'sunken eyes',              9, 'clinical sign',         'exact', 1.0);

-- ── Envenomation (snake, scorpion) ──────────────────────────────
insert into red_flag_phrases (category, lang, phrase, severity_score, example_context, detection_method, min_confidence) values
  ('envenomation', 'hi', 'saanp ne kaata',                10, 'snake bite',           'exact', 1.0),
  ('envenomation', 'hi', 'bichchu ne kaata',              10, 'scorpion',             'exact', 1.0),
  ('envenomation', 'ta', 'பாம்பு கடித்தது',                10, 'snake bite',           'exact', 1.0),
  ('envenomation', 'en', 'snake bite',                    10, 'standard',             'exact', 1.0),
  ('envenomation', 'en', 'scorpion sting',                10, 'standard',             'exact', 1.0);

-- ── Mental health (suicidal ideation) ───────────────────────────
insert into red_flag_phrases (category, lang, phrase, severity_score, example_context, detection_method, min_confidence) values
  ('mental_health', 'hi', 'khud ko nuksaan',              10, 'self-harm',            'exact', 1.0),
  ('mental_health', 'hi', 'marne ka man kar raha',        10, 'SI active',            'regex', 0.9),
  ('mental_health', 'hi', 'jeene ki ichha nahi',          10, 'SI passive',           'regex', 0.9),
  ('mental_health', 'hi', 'khatam karna chahta hoon',     10, 'plan',                 'regex', 0.9),
  ('mental_health', 'ta', 'தற்கொலை எண்ணம்',                10, 'SI',                   'exact', 1.0),
  ('mental_health', 'en', 'want to die',                  10, 'SI',                   'regex', 0.9),
  ('mental_health', 'en', 'kill myself',                  10, 'plan',                 'regex', 0.9),
  ('mental_health', 'en', 'suicidal',                     10, 'standard',             'exact', 1.0);

-- ── Sepsis / fever high-risk (NEW disambiguation) ───────────────
insert into red_flag_phrases (category, lang, phrase, severity_score, example_context, detection_method, min_confidence) values
  ('fever_high_risk', 'hi', 'bukhar 5 din se zyada',      9, 'persistent fever',     'regex', 0.9),
  ('fever_high_risk', 'hi', 'bukhar aur daane',           9, 'dengue/measles',       'regex', 0.85),
  ('fever_high_risk', 'hi', 'bukhar aur gardan akad rahi', 10, 'meningismus',        'regex', 0.9),
  ('fever_high_risk', 'hi', 'bukhar 102 se zyada',         9, 'hyperpyrexia',         'regex', 0.85),
  ('fever_high_risk', 'ta', 'காய்ச்சல் 5 நாட்களுக்கு மேல்', 9, 'persistent',         'regex', 0.85),
  ('fever_high_risk', 'en', 'fever more than 5 days',     9, 'persistent',           'regex', 0.9),
  ('fever_high_risk', 'en', 'fever with neck stiffness',  10, 'meningitis',          'regex', 0.9);

-- ── GI acute (peritonitis) ──────────────────────────────────────
insert into red_flag_phrases (category, lang, phrase, severity_score, example_context, detection_method, min_confidence) values
  ('gi_acute', 'hi', 'pet patthar jaisa',                10, 'rigid abdomen',        'exact', 1.0),
  ('gi_acute', 'hi', 'pet bahut dard aur hawa nahi nikal rahi', 10, 'obstruction', 'regex', 0.9),
  ('gi_acute', 'ta', 'வயிறு கடினமாக',                    10, 'rigid abdomen',        'exact', 1.0),
  ('gi_acute', 'en', 'rigid abdomen',                    10, 'peritonitis',          'exact', 1.0),
  ('gi_acute', 'en', 'no flatus',                         9, 'obstruction',          'exact', 1.0);

-- ── Burns ──────────────────────────────────────────────────────
insert into red_flag_phrases (category, lang, phrase, severity_score, example_context, detection_method, min_confidence) values
  ('burns', 'hi', 'jal gaya',                             8, 'general burn',         'exact', 1.0),
  ('burns', 'hi', 'agni se jal gaya',                     8, 'fire',                 'exact', 1.0),
  ('burns', 'hi', 'tezaab se jal gaya',                  10, 'chemical',             'exact', 1.0),
  ('burns', 'hi', 'bijli ka jhatka aur jal gaya',        10, 'electrical',           'exact', 1.0),
  ('burns', 'ta', 'தீக்காயம்',                            8, 'burn',                 'exact', 1.0),
  ('burns', 'en', 'electrical burn',                     10, '>10% concerns',        'exact', 1.0),
  ('burns', 'en', 'chemical burn',                       10, '>10% concerns',        'exact', 1.0);

-- ── Trauma (placeholder; expand in V1.1) ────────────────────────
insert into red_flag_phrases (category, lang, phrase, severity_score, example_context, detection_method, min_confidence) values
  ('trauma', 'hi', 'sir mein chot lagi',                   9, 'head injury',         'exact', 1.0),
  ('trauma', 'hi', 'haath toot gaya',                      8, 'fracture',            'exact', 1.0),
  ('trauma', 'en', 'head injury',                          9, 'standard',            'exact', 1.0);

-- ── Sepsis (general) ────────────────────────────────────────────
insert into red_flag_phrases (category, lang, phrase, severity_score, example_context, detection_method, min_confidence) values
  ('sepsis', 'hi', 'bahut tez bukhar aur kanpkanpi',      9, 'rigors',               'regex', 0.85),
  ('sepsis', 'en', 'high fever with rigors',              9, 'sepsis',               'regex', 0.85);

-- ── Metabolic acute (DKA, hypoglycemia) ─────────────────────────
insert into red_flag_phrases (category, lang, phrase, severity_score, example_context, detection_method, min_confidence) values
  ('metabolic_acute', 'hi', 'sugar bahut bada hai',       8, 'hyperglycemia',        'exact', 1.0),
  ('metabolic_acute', 'hi', 'behoshi mein sugar',         10, 'hypo/hyper',          'regex', 0.9),
  ('metabolic_acute', 'en', 'diabetic ketoacidosis',      10, 'DKA',                 'exact', 1.0);

-- ════════════════════════════════════════════════════════════════
-- PART B: Clinical Synonyms — Top-20 Vernacular Symptom Dictionary
-- ════════════════════════════════════════════════════════════════

insert into clinical_synonyms (canonical_concept, lang, surface_form, source) values
  -- Fever
  ('fever', 'hi', 'bukhar',  'NHFS-5'),
  ('fever', 'hi', 'jwar',    'colloquial'),
  ('fever', 'hi', 'tap',     'rural Bihar'),
  ('fever', 'hi', 'garmi',   'colloquial peds'),
  ('fever', 'ta', 'காய்ச்சல்', 'standard'),
  ('fever', 'ta', 'சூடு',     'colloquial'),
  ('fever', 'en', 'fever',   'standard'),
  ('fever', 'en', 'temperature', 'standard'),
  -- Cough
  ('cough', 'hi', 'khansi',  'standard'),
  ('cough', 'hi', 'khaansi', 'variant'),
  ('cough', 'ta', 'இருமல்',   'standard'),
  ('cough', 'en', 'cough',   'standard'),
  -- Breathlessness
  ('breathlessness', 'hi', 'saans phoolna', 'standard'),
  ('breathlessness', 'hi', 'dam ghutna',    'severe'),
  ('breathlessness', 'ta', 'மூச்சு திணறல்', 'standard'),
  ('breathlessness', 'en', 'breathless',    'standard'),
  ('breathlessness', 'en', 'shortness of breath', 'standard'),
  -- Chest pain
  ('chest_pain', 'hi', 'seene mein dard', 'standard'),
  ('chest_pain', 'hi', 'chaati dard',     'colloquial'),
  ('chest_pain', 'ta', 'நெஞ்சு வலி',      'standard'),
  ('chest_pain', 'en', 'chest pain',      'standard'),
  -- Headache
  ('headache', 'hi', 'sir dard',          'standard'),
  ('headache', 'hi', 'matha dard',        'variant'),
  ('headache', 'ta', 'தலைவலி',            'standard'),
  ('headache', 'en', 'headache',          'standard'),
  -- Dizziness
  ('dizziness', 'hi', 'chakkar',          'standard'),
  ('dizziness', 'hi', 'ghum aana',        'variant'),
  ('dizziness', 'ta', 'மயக்கம்',          'standard'),
  ('dizziness', 'en', 'dizzy',            'standard'),
  -- Vomiting
  ('vomiting', 'hi', 'ulti',              'standard'),
  ('vomiting', 'hi', 'kai',               'variant'),
  ('vomiting', 'ta', 'வாந்தி',            'standard'),
  ('vomiting', 'en', 'vomit',             'standard'),
  -- Diarrhea
  ('diarrhea', 'hi', 'dast',              'standard'),
  ('diarrhea', 'hi', 'patli latrine',     'rural'),
  ('diarrhea', 'hi', 'loose motion',      'urban'),
  ('diarrhea', 'ta', 'வயிற்றுப்போக்கு',   'standard'),
  ('diarrhea', 'en', 'diarrhea',          'standard'),
  -- Abdo pain
  ('abdo_pain', 'hi', 'pet dard',         'standard'),
  ('abdo_pain', 'hi', 'pet mein marod',   'cramps'),
  ('abdo_pain', 'ta', 'வயிறு வலி',         'standard'),
  ('abdo_pain', 'en', 'abdominal pain',   'standard'),
  -- Weakness
  ('weakness', 'hi', 'kamzori',           'standard'),
  ('weakness', 'hi', 'thakavat',          'fatigue'),
  ('weakness', 'ta', 'சோர்வு',             'standard'),
  ('weakness', 'en', 'weakness',          'standard'),
  -- Loss of appetite, weight loss, dysuria, blood, swelling, rash,
  --   convulsion, unconscious, PV bleed, numbness (next 10)
  ('appetite_loss', 'hi', 'bhookh nahi lagti',      'standard'),
  ('appetite_loss', 'en', 'loss of appetite',       'standard'),
  ('weight_loss', 'hi', 'vajan ghatna',             'standard'),
  ('weight_loss', 'en', 'weight loss',              'standard'),
  ('dysuria', 'hi', 'pishab mein jalan',            'standard'),
  ('dysuria', 'en', 'burning urination',            'standard'),
  ('blood_in_secretion', 'hi', 'khoon',             'standard'),
  ('blood_in_secretion', 'en', 'blood',             'standard'),
  ('swelling', 'hi', 'soojan',                      'standard'),
  ('swelling', 'en', 'swelling',                    'standard'),
  ('rash', 'hi', 'daane',                           'standard'),
  ('rash', 'hi', 'chakatte',                        'variant'),
  ('rash', 'en', 'rash',                            'standard'),
  ('convulsion', 'hi', 'jhatke',                    'standard'),
  ('convulsion', 'hi', 'mirgi',                     'epilepsy folk'),
  ('convulsion', 'en', 'seizure',                   'standard'),
  ('unconscious', 'hi', 'behoshi',                  'standard'),
  ('unconscious', 'en', 'unconscious',              'standard'),
  ('pv_bleed', 'hi', 'khoon ja raha hai',           'standard'),
  ('pv_bleed', 'en', 'vaginal bleeding',            'standard'),
  ('numbness', 'hi', 'jhunjhuni',                   'standard'),
  ('numbness', 'en', 'numbness',                    'standard');

-- Mark red-flag synonyms (cross-link to red_flag_category for short-circuit)
update clinical_synonyms set is_red_flag_synonym = true, red_flag_category = 'cardiac'
  where canonical_concept = 'chest_pain';
update clinical_synonyms set is_red_flag_synonym = true, red_flag_category = 'respiratory'
  where canonical_concept = 'breathlessness';
update clinical_synonyms set is_red_flag_synonym = true, red_flag_category = 'neuro'
  where canonical_concept in ('convulsion', 'unconscious');
update clinical_synonyms set is_red_flag_synonym = true, red_flag_category = 'obstetric'
  where canonical_concept = 'pv_bleed';

-- ════════════════════════════════════════════════════════════════
-- PART C: DPDP Notice v1.0 (Anand §14 verbatim)
-- ════════════════════════════════════════════════════════════════

insert into dpdp_notices (
  version, lang, notice_text, purposes, retention_period,
  rights_summary, grievance_officer_name, grievance_email, effective_from
) values

  -- Hindi
  ('v1.0', 'hi',
   'नमस्ते, मैं वाणी दीदी हूँ, [PHC का नाम] की तरफ़ से। आपकी सेहत के सवाल लेने के लिए कॉल कर रही हूँ। यह एक स्क्रीनिंग है, इलाज नहीं। मैं डॉक्टर नहीं हूँ — आपकी जानकारी डॉक्टर साहब को भेजी जाएगी, और वही फ़ैसला लेंगे। यह कॉल रिकॉर्ड हो रही है और सात साल तक सुरक्षित रखी जाएगी। आपकी जानकारी आभा (ABHA) से जुड़ सकती है। आप कभी भी ''बंद करो'' कह सकते हैं, या 1800-XXX पर सहमति वापस ले सकते हैं। क्या आप शुरू करने के लिए सहमत हैं? कृपया ''हाँ'' बोलें या 1 दबाएँ।',
   ARRAY['screening_call','data_processing','audio_recording','abdm_link','mo_share'],
   '7 years',
   'आप अपनी जानकारी देख सकते हैं, सुधार सकते हैं, हटवा सकते हैं, और शिकायत कर सकते हैं।',
   'Vaani-AI Grievance Officer', 'privacy@vaani.health',
   now()),

  -- Tamil
  ('v1.0', 'ta',
   'வணக்கம், நான் வாணி அக்கா, [PHC பெயர்] சார்பாக. உங்கள் உடல்நலம் பற்றி கேட்க அழைக்கிறேன். இது ஒரு பரிசோதனை, சிகிச்சை அல்ல. நான் டாக்டர் இல்லை — உங்கள் தகவல்கள் டாக்டருக்கு அனுப்பப்படும், அவர்தான் முடிவெடுப்பார். இந்த அழைப்பு பதிவு செய்யப்படுகிறது மற்றும் ஏழு ஆண்டுகள் பாதுகாப்பாக வைக்கப்படும். உங்கள் தகவல் ABHA உடன் இணைக்கப்படலாம். நீங்கள் எப்போது வேண்டுமானாலும் ''நிறுத்து'' என்று சொல்லலாம் அல்லது 1800-XXX-ஐ அழைத்து சம்மதத்தை திரும்பப் பெறலாம். தொடர சம்மதிக்கிறீர்களா? ''ஆம்'' என்று சொல்லுங்கள் அல்லது 1-ஐ அழுத்தவும்.',
   ARRAY['screening_call','data_processing','audio_recording','abdm_link','mo_share'],
   '7 years',
   'நீங்கள் உங்கள் தகவலைப் பார்க்க, திருத்த, நீக்க மற்றும் புகார் செய்ய உரிமை உண்டு.',
   'Vaani-AI Grievance Officer', 'privacy@vaani.health',
   now()),

  -- English (for the record)
  ('v1.0', 'en',
   'Hello, I am Vaani Didi, calling on behalf of [PHC name] to take your health information. This is a screening, not a treatment. I am not a doctor — your information will be sent to the doctor, who will decide. This call is being recorded and stored securely for seven years. Your information may be linked to your ABHA. You can say "stop" anytime, or call 1800-XXX to withdraw consent. Do you agree to proceed? Please say "yes" or press 1.',
   ARRAY['screening_call','data_processing','audio_recording','abdm_link','mo_share'],
   '7 years',
   'You can access, correct, erase your data and raise a grievance with our Grievance Officer.',
   'Vaani-AI Grievance Officer', 'privacy@vaani.health',
   now());

-- ════════════════════════════════════════════════════════════════
-- PART D: Helper view for Sarvam-M / rule layer to query synonyms
-- ════════════════════════════════════════════════════════════════
create or replace view v_red_flag_lookup as
select rfp.category, rfp.lang, rfp.phrase, rfp.severity_score, rfp.detection_method, rfp.min_confidence
from red_flag_phrases rfp
union all
select cs.red_flag_category, cs.lang, cs.surface_form, 8 as severity_score, 'exact', 0.95
from clinical_synonyms cs
where cs.is_red_flag_synonym and cs.red_flag_category is not null;

comment on view v_red_flag_lookup is
  'Aanya §2 + §9 — Unified red-flag detection surface for the rule layer
   (exact-match) and the LLM classifier (regex + semantic).
   Used by edge function _shared/red-flag-detector.ts.';
