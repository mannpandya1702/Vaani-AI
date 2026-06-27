// eval/types.ts — schema for YAML cases + runner result shapes.

export type Lang = 'hi' | 'ta' | 'en';
export type Band = 'RED' | 'AMBER' | 'GREEN';
export type Sex = 'M' | 'F' | 'other' | 'unknown';

export interface EvalCase {
  id: string;
  title: string;
  clinical_stage: 'pre_visit_capture' | 'shadow_diagnosis' | 'post_visit' | 'in_visit_emr' | 'low_cost_stt';
  patient: {
    age_years: number;
    sex: Sex;
    preferred_language: Lang;
    pregnancy_status?: 'pregnant' | 'not_applicable' | 'unknown' | 'postpartum';
    village_name?: string;
  };
  transcript: Array<{ role: 'assistant' | 'user'; text: string }>;
  expected: {
    band: Band;
    red_flag_categories: string[];
    presumptive_label?: string | string[];      // either exact or set of acceptable
    confidence_min?: number;
    recommended_action_must_contain?: string[];
    recommended_action_must_not_contain?: string[];
    needs_mo_review?: boolean;
  };
}

export interface CaseResult {
  case_id: string;
  case_title: string;
  expected_band: Band;
  actual_band: Band | null;
  band_match: boolean;
  expected_categories: string[];
  actual_categories: string[];
  categories_recall: number;    // fraction of expected categories matched
  categories_precision: number; // 0..1 — how many actual were "real"
  expected_label: string[];     // normalized to array
  actual_label: string | null;
  label_match: boolean;
  confidence: number;
  confidence_pass: boolean;
  action_must_contain_pass: boolean;
  action_must_not_contain_pass: boolean;
  needs_mo_review_match: boolean | null;
  latency_ms: number;
  pass: boolean;
  failure_reasons: string[];
}

export interface RunReport {
  ran_at: string;
  total_cases: number;
  passed: number;
  failed: number;
  metrics: {
    band_exact_match_pct: number;
    // THE metric that matters: case-level red-flag sensitivity. Of cases whose
    // gold band is RED (true emergencies), the fraction the system also called
    // RED. We optimise this toward 1.0 even at the cost of RED precision —
    // a missed emergency is catastrophic, a false alarm is a cheap MO glance.
    emergency_sensitivity: number;
    emergency_total: number;      // # of gold-RED cases (denominator)
    emergency_missed: number;     // # of gold-RED cases we did NOT call RED
    red_precision: number;        // of cases WE called RED, fraction truly RED
    red_called: number;           // # of cases we called RED (denominator)
    red_flag_recall: number;      // category-level recall (finer-grained)
    red_flag_precision: number;
    label_match_pct: number;
    action_must_contain_pct: number;
    action_must_not_contain_pct: number;
    latency_p50_ms: number;
    latency_p95_ms: number;
    confidence_mean: number;
  };
  targets: {
    band_exact_match_pct: number;
    emergency_sensitivity: number;  // the bar: ≥ 1.0 (zero missed emergencies)
    red_flag_recall: number;
    red_flag_precision: number;
    label_match_pct: number;
    action_must_contain_pct: number;
    latency_p95_ms: number;
  };
  results: CaseResult[];
}
