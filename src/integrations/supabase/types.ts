export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      abdm_consent_access_log: {
        Row: {
          accessed_at: string
          artefact_id: string
          created_at: string
          hi_types_accessed: string[] | null
          hiu_id: string
          id: number
          request_id: string | null
          status: string | null
        }
        Insert: {
          accessed_at: string
          artefact_id: string
          created_at?: string
          hi_types_accessed?: string[] | null
          hiu_id: string
          id?: number
          request_id?: string | null
          status?: string | null
        }
        Update: {
          accessed_at?: string
          artefact_id?: string
          created_at?: string
          hi_types_accessed?: string[] | null
          hiu_id?: string
          id?: number
          request_id?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "abdm_consent_access_log_artefact_id_fkey"
            columns: ["artefact_id"]
            isOneToOne: false
            referencedRelation: "abdm_consent_artefacts"
            referencedColumns: ["id"]
          },
        ]
      }
      abdm_consent_artefacts: {
        Row: {
          abdm_artefact_id: string | null
          abdm_environment: Database["public"]["Enums"]["abdm_environment"]
          abdm_request_id: string
          care_contexts: Json | null
          created_at: string
          date_range_from: string | null
          date_range_to: string | null
          expires_at: string | null
          granularity: string | null
          hi_types: string[] | null
          hip_id: string | null
          hiu_id: string | null
          id: string
          notification_status: string | null
          patient_id: string
          purpose_code: string | null
          raw_payload: Json | null
          retention_until: string
          revocation_callback_url: string | null
          signature_jws: string | null
          status: Database["public"]["Enums"]["consent_status"]
          updated_at: string
        }
        Insert: {
          abdm_artefact_id?: string | null
          abdm_environment?: Database["public"]["Enums"]["abdm_environment"]
          abdm_request_id: string
          care_contexts?: Json | null
          created_at?: string
          date_range_from?: string | null
          date_range_to?: string | null
          expires_at?: string | null
          granularity?: string | null
          hi_types?: string[] | null
          hip_id?: string | null
          hiu_id?: string | null
          id?: string
          notification_status?: string | null
          patient_id: string
          purpose_code?: string | null
          raw_payload?: Json | null
          retention_until?: string
          revocation_callback_url?: string | null
          signature_jws?: string | null
          status?: Database["public"]["Enums"]["consent_status"]
          updated_at?: string
        }
        Update: {
          abdm_artefact_id?: string | null
          abdm_environment?: Database["public"]["Enums"]["abdm_environment"]
          abdm_request_id?: string
          care_contexts?: Json | null
          created_at?: string
          date_range_from?: string | null
          date_range_to?: string | null
          expires_at?: string | null
          granularity?: string | null
          hi_types?: string[] | null
          hip_id?: string | null
          hiu_id?: string | null
          id?: string
          notification_status?: string | null
          patient_id?: string
          purpose_code?: string | null
          raw_payload?: Json | null
          retention_until?: string
          revocation_callback_url?: string | null
          signature_jws?: string | null
          status?: Database["public"]["Enums"]["consent_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "abdm_consent_artefacts_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      abdm_production_approvals: {
        Row: {
          approved_at: string
          approved_by_counsel: string
          created_at: string
          evidence_url: string
          m2_certification_ref: string
          m3_certification_ref: string | null
          tenant_id: string
        }
        Insert: {
          approved_at: string
          approved_by_counsel: string
          created_at?: string
          evidence_url: string
          m2_certification_ref: string
          m3_certification_ref?: string | null
          tenant_id: string
        }
        Update: {
          approved_at?: string
          approved_by_counsel?: string
          created_at?: string
          evidence_url?: string
          m2_certification_ref?: string
          m3_certification_ref?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "abdm_production_approvals_approved_by_counsel_fkey"
            columns: ["approved_by_counsel"]
            isOneToOne: false
            referencedRelation: "mo_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abdm_production_approvals_approved_by_counsel_fkey"
            columns: ["approved_by_counsel"]
            isOneToOne: false
            referencedRelation: "v_mo_users_with_indemnity"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abdm_production_approvals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      anc_contacts: {
        Row: {
          call_id: string | null
          completed_at: string | null
          contact_kind: Database["public"]["Enums"]["anc_contact_kind"]
          danger_signs_screened: string[] | null
          due_date: string
          id: number
          notes: string | null
          pregnancy_id: string
          vitals_json: Json | null
        }
        Insert: {
          call_id?: string | null
          completed_at?: string | null
          contact_kind: Database["public"]["Enums"]["anc_contact_kind"]
          danger_signs_screened?: string[] | null
          due_date: string
          id?: number
          notes?: string | null
          pregnancy_id: string
          vitals_json?: Json | null
        }
        Update: {
          call_id?: string | null
          completed_at?: string | null
          contact_kind?: Database["public"]["Enums"]["anc_contact_kind"]
          danger_signs_screened?: string[] | null
          due_date?: string
          id?: number
          notes?: string | null
          pregnancy_id?: string
          vitals_json?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "anc_contacts_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anc_contacts_pregnancy_id_fkey"
            columns: ["pregnancy_id"]
            isOneToOne: false
            referencedRelation: "pregnancies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anc_contacts_pregnancy_id_fkey"
            columns: ["pregnancy_id"]
            isOneToOne: false
            referencedRelation: "v_pregnancy_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      anc_danger_sign_screens: {
        Row: {
          anc_contact_id: number
          id: number
          notes: string | null
          raised_red_flag_event_id: number | null
          screened_at: string
          sign_code: Database["public"]["Enums"]["anc_danger_sign_code"]
          status: Database["public"]["Enums"]["anc_sign_status"]
        }
        Insert: {
          anc_contact_id: number
          id?: number
          notes?: string | null
          raised_red_flag_event_id?: number | null
          screened_at?: string
          sign_code: Database["public"]["Enums"]["anc_danger_sign_code"]
          status?: Database["public"]["Enums"]["anc_sign_status"]
        }
        Update: {
          anc_contact_id?: number
          id?: number
          notes?: string | null
          raised_red_flag_event_id?: number | null
          screened_at?: string
          sign_code?: Database["public"]["Enums"]["anc_danger_sign_code"]
          status?: Database["public"]["Enums"]["anc_sign_status"]
        }
        Relationships: [
          {
            foreignKeyName: "anc_danger_sign_screens_anc_contact_id_fkey"
            columns: ["anc_contact_id"]
            isOneToOne: false
            referencedRelation: "anc_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anc_danger_sign_screens_raised_red_flag_event_id_fkey"
            columns: ["raised_red_flag_event_id"]
            isOneToOne: false
            referencedRelation: "red_flag_events"
            referencedColumns: ["id"]
          },
        ]
      }
      asha_users: {
        Row: {
          asha_code: string | null
          auth_user_id: string | null
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          phone_e164: string
          preferred_language:
            | Database["public"]["Enums"]["encounter_lang"]
            | null
          subcentre_tenant_id: string | null
          updated_at: string
          village_name: string | null
        }
        Insert: {
          asha_code?: string | null
          auth_user_id?: string | null
          created_at?: string
          full_name: string
          id?: string
          is_active?: boolean
          phone_e164: string
          preferred_language?:
            | Database["public"]["Enums"]["encounter_lang"]
            | null
          subcentre_tenant_id?: string | null
          updated_at?: string
          village_name?: string | null
        }
        Update: {
          asha_code?: string | null
          auth_user_id?: string | null
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          phone_e164?: string
          preferred_language?:
            | Database["public"]["Enums"]["encounter_lang"]
            | null
          subcentre_tenant_id?: string | null
          updated_at?: string
          village_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "asha_users_subcentre_tenant_id_fkey"
            columns: ["subcentre_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audio_recordings: {
        Row: {
          call_id: string | null
          created_at: string
          duration_ms: number | null
          encrypted: boolean
          encryption_key_ref: string | null
          id: string
          patient_id: string | null
          retention_until: string
          segment_end_ms: number | null
          segment_kind: string
          segment_start_ms: number | null
          sha256: string
          storage_url: string
        }
        Insert: {
          call_id?: string | null
          created_at?: string
          duration_ms?: number | null
          encrypted?: boolean
          encryption_key_ref?: string | null
          id?: string
          patient_id?: string | null
          retention_until?: string
          segment_end_ms?: number | null
          segment_kind: string
          segment_start_ms?: number | null
          sha256: string
          storage_url: string
        }
        Update: {
          call_id?: string | null
          created_at?: string
          duration_ms?: number | null
          encrypted?: boolean
          encryption_key_ref?: string | null
          id?: string
          patient_id?: string | null
          retention_until?: string
          segment_end_ms?: number | null
          segment_kind?: string
          segment_start_ms?: number | null
          sha256?: string
          storage_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "audio_recordings_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audio_recordings_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      call_costs: {
        Row: {
          bedrock_surcharge_inr: number | null
          call_id: string
          claude_input_inr: number | null
          claude_output_inr: number | null
          computed_at: string
          exotel_inr: number | null
          gupshup_inr: number | null
          msg91_inr: number | null
          sarvam_m_inr: number | null
          sarvam_stt_inr: number | null
          sarvam_tts_inr: number | null
          supabase_inr: number | null
          total_inr: number | null
        }
        Insert: {
          bedrock_surcharge_inr?: number | null
          call_id: string
          claude_input_inr?: number | null
          claude_output_inr?: number | null
          computed_at?: string
          exotel_inr?: number | null
          gupshup_inr?: number | null
          msg91_inr?: number | null
          sarvam_m_inr?: number | null
          sarvam_stt_inr?: number | null
          sarvam_tts_inr?: number | null
          supabase_inr?: number | null
          total_inr?: number | null
        }
        Update: {
          bedrock_surcharge_inr?: number | null
          call_id?: string
          claude_input_inr?: number | null
          claude_output_inr?: number | null
          computed_at?: string
          exotel_inr?: number | null
          gupshup_inr?: number | null
          msg91_inr?: number | null
          sarvam_m_inr?: number | null
          sarvam_stt_inr?: number | null
          sarvam_tts_inr?: number | null
          supabase_inr?: number | null
          total_inr?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "call_costs_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: true
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
        ]
      }
      call_dispatch_queue: {
        Row: {
          attempt_number: number
          channel: Database["public"]["Enums"]["dispatch_channel"]
          channel_message_id: string | null
          claimed_at: string | null
          claimed_by_worker_id: string | null
          completed_at: string | null
          created_at: string
          dispatched_at: string | null
          error_count: number
          event_metadata: Json | null
          event_type: Database["public"]["Enums"]["dispatch_event_type"]
          id: string
          idempotency_key: string | null
          last_delivery_status: string | null
          last_error: string | null
          max_attempts: number
          parent_queue_id: string | null
          patient_id: string | null
          patient_phone_e164: string
          scheduled_at: string
          sequence_id: string | null
          status: Database["public"]["Enums"]["dispatch_status"]
          tenant_id: string
          trigger: Database["public"]["Enums"]["dispatch_trigger"] | null
          trigger_source_id: string | null
          trigger_source_table: string | null
          updated_at: string
          vapi_call_id: string | null
        }
        Insert: {
          attempt_number?: number
          channel?: Database["public"]["Enums"]["dispatch_channel"]
          channel_message_id?: string | null
          claimed_at?: string | null
          claimed_by_worker_id?: string | null
          completed_at?: string | null
          created_at?: string
          dispatched_at?: string | null
          error_count?: number
          event_metadata?: Json | null
          event_type: Database["public"]["Enums"]["dispatch_event_type"]
          id?: string
          idempotency_key?: string | null
          last_delivery_status?: string | null
          last_error?: string | null
          max_attempts?: number
          parent_queue_id?: string | null
          patient_id?: string | null
          patient_phone_e164: string
          scheduled_at: string
          sequence_id?: string | null
          status?: Database["public"]["Enums"]["dispatch_status"]
          tenant_id: string
          trigger?: Database["public"]["Enums"]["dispatch_trigger"] | null
          trigger_source_id?: string | null
          trigger_source_table?: string | null
          updated_at?: string
          vapi_call_id?: string | null
        }
        Update: {
          attempt_number?: number
          channel?: Database["public"]["Enums"]["dispatch_channel"]
          channel_message_id?: string | null
          claimed_at?: string | null
          claimed_by_worker_id?: string | null
          completed_at?: string | null
          created_at?: string
          dispatched_at?: string | null
          error_count?: number
          event_metadata?: Json | null
          event_type?: Database["public"]["Enums"]["dispatch_event_type"]
          id?: string
          idempotency_key?: string | null
          last_delivery_status?: string | null
          last_error?: string | null
          max_attempts?: number
          parent_queue_id?: string | null
          patient_id?: string | null
          patient_phone_e164?: string
          scheduled_at?: string
          sequence_id?: string | null
          status?: Database["public"]["Enums"]["dispatch_status"]
          tenant_id?: string
          trigger?: Database["public"]["Enums"]["dispatch_trigger"] | null
          trigger_source_id?: string | null
          trigger_source_table?: string | null
          updated_at?: string
          vapi_call_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_dispatch_queue_parent_queue_id_fkey"
            columns: ["parent_queue_id"]
            isOneToOne: false
            referencedRelation: "call_dispatch_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_dispatch_queue_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_dispatch_queue_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      call_qa_signals: {
        Row: {
          call_id: string
          consent_capture_score: number | null
          evaluated_at: string | null
          evaluator_model: string | null
          evaluator_prompt_version: string | null
          flags: string[] | null
          mo_satisfaction_score: number | null
          red_flag_detection_score: number | null
          refusal_hygiene_score: number | null
          severity: Database["public"]["Enums"]["incident_severity"] | null
          triage_accuracy_score: number | null
          vernacular_fluency_score: number | null
        }
        Insert: {
          call_id: string
          consent_capture_score?: number | null
          evaluated_at?: string | null
          evaluator_model?: string | null
          evaluator_prompt_version?: string | null
          flags?: string[] | null
          mo_satisfaction_score?: number | null
          red_flag_detection_score?: number | null
          refusal_hygiene_score?: number | null
          severity?: Database["public"]["Enums"]["incident_severity"] | null
          triage_accuracy_score?: number | null
          vernacular_fluency_score?: number | null
        }
        Update: {
          call_id?: string
          consent_capture_score?: number | null
          evaluated_at?: string | null
          evaluator_model?: string | null
          evaluator_prompt_version?: string | null
          flags?: string[] | null
          mo_satisfaction_score?: number | null
          red_flag_detection_score?: number | null
          refusal_hygiene_score?: number | null
          severity?: Database["public"]["Enums"]["incident_severity"] | null
          triage_accuracy_score?: number | null
          vernacular_fluency_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "call_qa_signals_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: true
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
        ]
      }
      call_turn_seqs: {
        Row: {
          call_id: string
          next_idx: number
        }
        Insert: {
          call_id: string
          next_idx?: number
        }
        Update: {
          call_id?: string
          next_idx?: number
        }
        Relationships: [
          {
            foreignKeyName: "call_turn_seqs_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: true
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
        ]
      }
      calls: {
        Row: {
          agent_interruptions: number | null
          asha_id: string | null
          audio_recording_url: string | null
          audio_retention_until: string | null
          avg_latency_ms: number | null
          channel: Database["public"]["Enums"]["dispatch_channel"]
          consent_captured: boolean
          consent_id: string | null
          cost_breakdown: Json | null
          cost_inr: number | null
          created_at: string
          duration_seconds: number | null
          ended_at: string | null
          exotel_call_sid: string | null
          id: string
          lang_declared: Database["public"]["Enums"]["encounter_lang"] | null
          lang_detected: Database["public"]["Enums"]["encounter_lang"] | null
          outcome: Database["public"]["Enums"]["call_outcome"]
          patient_id: string | null
          providers_json: Json | null
          started_at: string | null
          tenant_id: string
          updated_at: string
          user_interruptions: number | null
          vapi_assistant_id: string | null
          vapi_call_id: string | null
        }
        Insert: {
          agent_interruptions?: number | null
          asha_id?: string | null
          audio_recording_url?: string | null
          audio_retention_until?: string | null
          avg_latency_ms?: number | null
          channel?: Database["public"]["Enums"]["dispatch_channel"]
          consent_captured?: boolean
          consent_id?: string | null
          cost_breakdown?: Json | null
          cost_inr?: number | null
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          exotel_call_sid?: string | null
          id?: string
          lang_declared?: Database["public"]["Enums"]["encounter_lang"] | null
          lang_detected?: Database["public"]["Enums"]["encounter_lang"] | null
          outcome?: Database["public"]["Enums"]["call_outcome"]
          patient_id?: string | null
          providers_json?: Json | null
          started_at?: string | null
          tenant_id: string
          updated_at?: string
          user_interruptions?: number | null
          vapi_assistant_id?: string | null
          vapi_call_id?: string | null
        }
        Update: {
          agent_interruptions?: number | null
          asha_id?: string | null
          audio_recording_url?: string | null
          audio_retention_until?: string | null
          avg_latency_ms?: number | null
          channel?: Database["public"]["Enums"]["dispatch_channel"]
          consent_captured?: boolean
          consent_id?: string | null
          cost_breakdown?: Json | null
          cost_inr?: number | null
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          exotel_call_sid?: string | null
          id?: string
          lang_declared?: Database["public"]["Enums"]["encounter_lang"] | null
          lang_detected?: Database["public"]["Enums"]["encounter_lang"] | null
          outcome?: Database["public"]["Enums"]["call_outcome"]
          patient_id?: string | null
          providers_json?: Json | null
          started_at?: string | null
          tenant_id?: string
          updated_at?: string
          user_interruptions?: number | null
          vapi_assistant_id?: string | null
          vapi_call_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calls_asha_id_fkey"
            columns: ["asha_id"]
            isOneToOne: false
            referencedRelation: "asha_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_consent_id_fkey"
            columns: ["consent_id"]
            isOneToOne: false
            referencedRelation: "consents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      clinical_synonyms: {
        Row: {
          canonical_concept: string
          created_at: string
          dialect_region: string | null
          id: string
          is_red_flag_synonym: boolean
          lang: Database["public"]["Enums"]["encounter_lang"]
          red_flag_category:
            | Database["public"]["Enums"]["red_flag_category"]
            | null
          source: string | null
          surface_form: string
        }
        Insert: {
          canonical_concept: string
          created_at?: string
          dialect_region?: string | null
          id?: string
          is_red_flag_synonym?: boolean
          lang: Database["public"]["Enums"]["encounter_lang"]
          red_flag_category?:
            | Database["public"]["Enums"]["red_flag_category"]
            | null
          source?: string | null
          surface_form: string
        }
        Update: {
          canonical_concept?: string
          created_at?: string
          dialect_region?: string | null
          id?: string
          is_red_flag_synonym?: boolean
          lang?: Database["public"]["Enums"]["encounter_lang"]
          red_flag_category?:
            | Database["public"]["Enums"]["red_flag_category"]
            | null
          source?: string | null
          surface_form?: string
        }
        Relationships: []
      }
      cohort_rules: {
        Row: {
          active: boolean
          cadence_days: number
          channel: Database["public"]["Enums"]["dispatch_channel"]
          created_at: string
          event_type: Database["public"]["Enums"]["dispatch_event_type"]
          id: string
          match_type: Database["public"]["Enums"]["cohort_match_type"]
          match_value: string | null
          priority: number
          tenant_id: string | null
        }
        Insert: {
          active?: boolean
          cadence_days: number
          channel?: Database["public"]["Enums"]["dispatch_channel"]
          created_at?: string
          event_type: Database["public"]["Enums"]["dispatch_event_type"]
          id?: string
          match_type: Database["public"]["Enums"]["cohort_match_type"]
          match_value?: string | null
          priority?: number
          tenant_id?: string | null
        }
        Update: {
          active?: boolean
          cadence_days?: number
          channel?: Database["public"]["Enums"]["dispatch_channel"]
          created_at?: string
          event_type?: Database["public"]["Enums"]["dispatch_event_type"]
          id?: string
          match_type?: Database["public"]["Enums"]["cohort_match_type"]
          match_value?: string | null
          priority?: number
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cohort_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_withdrawal_requests: {
        Row: {
          audio_recording_url: string | null
          channel: Database["public"]["Enums"]["withdrawal_channel"]
          completed_at: string | null
          consent_id: string | null
          created_at: string
          downstream_actions_taken: Json
          id: string
          patient_id: string
          processed_by_user_id: string | null
          processing_started_at: string | null
          raw_request_text: string | null
          received_at: string
          retention_until: string
          scope_withdrawn: Database["public"]["Enums"]["consent_scope"][]
          sla_deadline: string
          status: Database["public"]["Enums"]["withdrawal_status"]
          verification_method: string | null
          verified_at: string | null
        }
        Insert: {
          audio_recording_url?: string | null
          channel: Database["public"]["Enums"]["withdrawal_channel"]
          completed_at?: string | null
          consent_id?: string | null
          created_at?: string
          downstream_actions_taken?: Json
          id?: string
          patient_id: string
          processed_by_user_id?: string | null
          processing_started_at?: string | null
          raw_request_text?: string | null
          received_at?: string
          retention_until?: string
          scope_withdrawn: Database["public"]["Enums"]["consent_scope"][]
          sla_deadline?: string
          status?: Database["public"]["Enums"]["withdrawal_status"]
          verification_method?: string | null
          verified_at?: string | null
        }
        Update: {
          audio_recording_url?: string | null
          channel?: Database["public"]["Enums"]["withdrawal_channel"]
          completed_at?: string | null
          consent_id?: string | null
          created_at?: string
          downstream_actions_taken?: Json
          id?: string
          patient_id?: string
          processed_by_user_id?: string | null
          processing_started_at?: string | null
          raw_request_text?: string | null
          received_at?: string
          retention_until?: string
          scope_withdrawn?: Database["public"]["Enums"]["consent_scope"][]
          sla_deadline?: string
          status?: Database["public"]["Enums"]["withdrawal_status"]
          verification_method?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consent_withdrawal_requests_consent_id_fkey"
            columns: ["consent_id"]
            isOneToOne: false
            referencedRelation: "consents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_withdrawal_requests_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_consent_withdrawal_processor"
            columns: ["processed_by_user_id"]
            isOneToOne: false
            referencedRelation: "mo_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_consent_withdrawal_processor"
            columns: ["processed_by_user_id"]
            isOneToOne: false
            referencedRelation: "v_mo_users_with_indemnity"
            referencedColumns: ["id"]
          },
        ]
      }
      consents: {
        Row: {
          abdm_consent_artefact_id: string | null
          audio_recording_url: string | null
          audio_segment_end_ms: number | null
          audio_segment_start_ms: number | null
          audio_transcript: string | null
          consent_phrase_detected: string | null
          created_at: string
          dpdp_notice_id: string | null
          expires_at: string | null
          granted_at: string | null
          granted_by: string | null
          granted_via: string | null
          id: string
          ip_address: unknown
          notice_language: Database["public"]["Enums"]["encounter_lang"]
          notice_version: string
          patient_id: string
          retention_until: string
          revoked_at: string | null
          scope: Database["public"]["Enums"]["consent_scope"]
          status: Database["public"]["Enums"]["consent_status"]
        }
        Insert: {
          abdm_consent_artefact_id?: string | null
          audio_recording_url?: string | null
          audio_segment_end_ms?: number | null
          audio_segment_start_ms?: number | null
          audio_transcript?: string | null
          consent_phrase_detected?: string | null
          created_at?: string
          dpdp_notice_id?: string | null
          expires_at?: string | null
          granted_at?: string | null
          granted_by?: string | null
          granted_via?: string | null
          id?: string
          ip_address?: unknown
          notice_language: Database["public"]["Enums"]["encounter_lang"]
          notice_version?: string
          patient_id: string
          retention_until?: string
          revoked_at?: string | null
          scope: Database["public"]["Enums"]["consent_scope"]
          status?: Database["public"]["Enums"]["consent_status"]
        }
        Update: {
          abdm_consent_artefact_id?: string | null
          audio_recording_url?: string | null
          audio_segment_end_ms?: number | null
          audio_segment_start_ms?: number | null
          audio_transcript?: string | null
          consent_phrase_detected?: string | null
          created_at?: string
          dpdp_notice_id?: string | null
          expires_at?: string | null
          granted_at?: string | null
          granted_by?: string | null
          granted_via?: string | null
          id?: string
          ip_address?: unknown
          notice_language?: Database["public"]["Enums"]["encounter_lang"]
          notice_version?: string
          patient_id?: string
          retention_until?: string
          revoked_at?: string | null
          scope?: Database["public"]["Enums"]["consent_scope"]
          status?: Database["public"]["Enums"]["consent_status"]
        }
        Relationships: [
          {
            foreignKeyName: "consents_dpdp_notice_id_fkey"
            columns: ["dpdp_notice_id"]
            isOneToOne: false
            referencedRelation: "dpdp_notices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consents_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_consents_abdm_artefact"
            columns: ["abdm_consent_artefact_id"]
            isOneToOne: false
            referencedRelation: "abdm_consent_artefacts"
            referencedColumns: ["id"]
          },
        ]
      }
      cross_border_transfers: {
        Row: {
          call_id: string | null
          id: number
          model: string
          payload_byte_size: number | null
          payload_pii_redacted: boolean
          payload_sha256: string
          provider: string
          redaction_method: string
          redaction_session_token: string | null
          region: Database["public"]["Enums"]["llm_region"]
          region_attested_at: string | null
          region_attested_by: string
          region_attested_value: string | null
          retention_until: string
          transferred_at: string
          turn_id: number | null
        }
        Insert: {
          call_id?: string | null
          id?: number
          model: string
          payload_byte_size?: number | null
          payload_pii_redacted: boolean
          payload_sha256: string
          provider: string
          redaction_method: string
          redaction_session_token?: string | null
          region: Database["public"]["Enums"]["llm_region"]
          region_attested_at?: string | null
          region_attested_by: string
          region_attested_value?: string | null
          retention_until?: string
          transferred_at?: string
          turn_id?: number | null
        }
        Update: {
          call_id?: string | null
          id?: number
          model?: string
          payload_byte_size?: number | null
          payload_pii_redacted?: boolean
          payload_sha256?: string
          provider?: string
          redaction_method?: string
          redaction_session_token?: string | null
          region?: Database["public"]["Enums"]["llm_region"]
          region_attested_at?: string | null
          region_attested_by?: string
          region_attested_value?: string | null
          retention_until?: string
          transferred_at?: string
          turn_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cross_border_transfers_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cross_border_transfers_turn_id_fkey"
            columns: ["turn_id"]
            isOneToOne: false
            referencedRelation: "turns"
            referencedColumns: ["id"]
          },
        ]
      }
      data_breach_incidents: {
        Row: {
          abdm_security_notified_at: string | null
          affected_data_categories: string[]
          affected_patient_count: number | null
          cert_in_notified_at: string | null
          cert_in_ref: string | null
          closed_at: string | null
          containment_at: string | null
          created_at: string
          data_principals_notified_at: string | null
          discovered_at: string
          dpdp_board_notified_at: string | null
          dpdp_board_ref: string | null
          forensic_report_url: string | null
          id: string
          notification_template_url: string | null
          occurred_at: string | null
          remediation_actions: Json
          retention_until: string
          root_cause: string | null
          scope_class: Database["public"]["Enums"]["breach_scope_class"]
        }
        Insert: {
          abdm_security_notified_at?: string | null
          affected_data_categories: string[]
          affected_patient_count?: number | null
          cert_in_notified_at?: string | null
          cert_in_ref?: string | null
          closed_at?: string | null
          containment_at?: string | null
          created_at?: string
          data_principals_notified_at?: string | null
          discovered_at: string
          dpdp_board_notified_at?: string | null
          dpdp_board_ref?: string | null
          forensic_report_url?: string | null
          id?: string
          notification_template_url?: string | null
          occurred_at?: string | null
          remediation_actions?: Json
          retention_until?: string
          root_cause?: string | null
          scope_class: Database["public"]["Enums"]["breach_scope_class"]
        }
        Update: {
          abdm_security_notified_at?: string | null
          affected_data_categories?: string[]
          affected_patient_count?: number | null
          cert_in_notified_at?: string | null
          cert_in_ref?: string | null
          closed_at?: string | null
          containment_at?: string | null
          created_at?: string
          data_principals_notified_at?: string | null
          discovered_at?: string
          dpdp_board_notified_at?: string | null
          dpdp_board_ref?: string | null
          forensic_report_url?: string | null
          id?: string
          notification_template_url?: string | null
          occurred_at?: string | null
          remediation_actions?: Json
          retention_until?: string
          root_cause?: string | null
          scope_class?: Database["public"]["Enums"]["breach_scope_class"]
        }
        Relationships: []
      }
      data_subject_requests: {
        Row: {
          assigned_to: string | null
          channel: Database["public"]["Enums"]["withdrawal_channel"]
          created_at: string
          fulfilled_at: string | null
          fulfilment_artefact_url: string | null
          id: string
          patient_id: string | null
          raw_identifier: string
          received_at: string
          rejection_reason: string | null
          request_text: string
          request_type: Database["public"]["Enums"]["dsr_type"]
          retention_until: string
          sla_deadline: string
          status: Database["public"]["Enums"]["dsr_status"]
          verification_method: string | null
          verified_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          channel: Database["public"]["Enums"]["withdrawal_channel"]
          created_at?: string
          fulfilled_at?: string | null
          fulfilment_artefact_url?: string | null
          id?: string
          patient_id?: string | null
          raw_identifier: string
          received_at?: string
          rejection_reason?: string | null
          request_text: string
          request_type: Database["public"]["Enums"]["dsr_type"]
          retention_until?: string
          sla_deadline?: string
          status?: Database["public"]["Enums"]["dsr_status"]
          verification_method?: string | null
          verified_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          channel?: Database["public"]["Enums"]["withdrawal_channel"]
          created_at?: string
          fulfilled_at?: string | null
          fulfilment_artefact_url?: string | null
          id?: string
          patient_id?: string | null
          raw_identifier?: string
          received_at?: string
          rejection_reason?: string | null
          request_text?: string
          request_type?: Database["public"]["Enums"]["dsr_type"]
          retention_until?: string
          sla_deadline?: string
          status?: Database["public"]["Enums"]["dsr_status"]
          verification_method?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "data_subject_requests_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_dsr_assignee"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "mo_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_dsr_assignee"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "v_mo_users_with_indemnity"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_idempotency_keys: {
        Row: {
          idempotency_key: string
          received_at: string
          resolution: string | null
          retention_until: string
          source: string
        }
        Insert: {
          idempotency_key: string
          received_at?: string
          resolution?: string | null
          retention_until?: string
          source: string
        }
        Update: {
          idempotency_key?: string
          received_at?: string
          resolution?: string | null
          retention_until?: string
          source?: string
        }
        Relationships: []
      }
      dispatch_webhook_logs: {
        Row: {
          error: string | null
          headers: Json | null
          http_status: number | null
          id: number
          parsed_body: Json | null
          processing_ms: number | null
          raw_body: string | null
          received_at: string
          signature_valid: boolean | null
          source: string
        }
        Insert: {
          error?: string | null
          headers?: Json | null
          http_status?: number | null
          id?: number
          parsed_body?: Json | null
          processing_ms?: number | null
          raw_body?: string | null
          received_at?: string
          signature_valid?: boolean | null
          source: string
        }
        Update: {
          error?: string | null
          headers?: Json | null
          http_status?: number | null
          id?: number
          parsed_body?: Json | null
          processing_ms?: number | null
          raw_body?: string | null
          received_at?: string
          signature_valid?: boolean | null
          source?: string
        }
        Relationships: []
      }
      dlt_templates: {
        Row: {
          active: boolean
          approved_at: string | null
          dlt_header: string
          dlt_template_id: string
          id: string
          template_body: string
          template_category: string
          template_lang: Database["public"]["Enums"]["encounter_lang"]
          tenant_id: string
          variables: string[]
        }
        Insert: {
          active?: boolean
          approved_at?: string | null
          dlt_header: string
          dlt_template_id: string
          id?: string
          template_body: string
          template_category: string
          template_lang: Database["public"]["Enums"]["encounter_lang"]
          tenant_id: string
          variables: string[]
        }
        Update: {
          active?: boolean
          approved_at?: string | null
          dlt_header?: string
          dlt_template_id?: string
          id?: string
          template_body?: string
          template_category?: string
          template_lang?: Database["public"]["Enums"]["encounter_lang"]
          tenant_id?: string
          variables?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "dlt_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      dots_adverse_events: {
        Row: {
          action_taken: string
          ae_code: string
          ae_grade: number
          created_at: string
          id: string
          notes: string | null
          onset_date: string
          outcome: string | null
          pvpi_ref: string | null
          regimen_id: string
          reported_to_pvpi_at: string | null
          resolved_at: string | null
          retention_until: string
        }
        Insert: {
          action_taken: string
          ae_code: string
          ae_grade: number
          created_at?: string
          id?: string
          notes?: string | null
          onset_date: string
          outcome?: string | null
          pvpi_ref?: string | null
          regimen_id: string
          reported_to_pvpi_at?: string | null
          resolved_at?: string | null
          retention_until?: string
        }
        Update: {
          action_taken?: string
          ae_code?: string
          ae_grade?: number
          created_at?: string
          id?: string
          notes?: string | null
          onset_date?: string
          outcome?: string | null
          pvpi_ref?: string | null
          regimen_id?: string
          reported_to_pvpi_at?: string | null
          resolved_at?: string | null
          retention_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "dots_adverse_events_regimen_id_fkey"
            columns: ["regimen_id"]
            isOneToOne: false
            referencedRelation: "dots_regimens"
            referencedColumns: ["id"]
          },
        ]
      }
      dots_dose_logs: {
        Row: {
          dose_date: string
          id: number
          reason_missed: string | null
          regimen_id: string
          reported_at: string
          side_effects_reported: string[] | null
          taken: boolean
          taken_via: string | null
        }
        Insert: {
          dose_date: string
          id?: number
          reason_missed?: string | null
          regimen_id: string
          reported_at?: string
          side_effects_reported?: string[] | null
          taken: boolean
          taken_via?: string | null
        }
        Update: {
          dose_date?: string
          id?: number
          reason_missed?: string | null
          regimen_id?: string
          reported_at?: string
          side_effects_reported?: string[] | null
          taken?: boolean
          taken_via?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dots_dose_logs_regimen_id_fkey"
            columns: ["regimen_id"]
            isOneToOne: false
            referencedRelation: "dots_regimens"
            referencedColumns: ["id"]
          },
        ]
      }
      dots_phase_transitions: {
        Row: {
          from_phase: Database["public"]["Enums"]["dots_phase"] | null
          id: number
          notes: string | null
          regimen_id: string
          sputum_culture_result: string | null
          sputum_smear_result: string | null
          to_phase: Database["public"]["Enums"]["dots_phase"]
          transitioned_at: string
          transitioned_by_mo_id: string | null
          weight_kg: number | null
        }
        Insert: {
          from_phase?: Database["public"]["Enums"]["dots_phase"] | null
          id?: number
          notes?: string | null
          regimen_id: string
          sputum_culture_result?: string | null
          sputum_smear_result?: string | null
          to_phase: Database["public"]["Enums"]["dots_phase"]
          transitioned_at?: string
          transitioned_by_mo_id?: string | null
          weight_kg?: number | null
        }
        Update: {
          from_phase?: Database["public"]["Enums"]["dots_phase"] | null
          id?: number
          notes?: string | null
          regimen_id?: string
          sputum_culture_result?: string | null
          sputum_smear_result?: string | null
          to_phase?: Database["public"]["Enums"]["dots_phase"]
          transitioned_at?: string
          transitioned_by_mo_id?: string | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dots_phase_transitions_regimen_id_fkey"
            columns: ["regimen_id"]
            isOneToOne: false
            referencedRelation: "dots_regimens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dots_phase_transitions_transitioned_by_mo_id_fkey"
            columns: ["transitioned_by_mo_id"]
            isOneToOne: false
            referencedRelation: "mo_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dots_phase_transitions_transitioned_by_mo_id_fkey"
            columns: ["transitioned_by_mo_id"]
            isOneToOne: false
            referencedRelation: "v_mo_users_with_indemnity"
            referencedColumns: ["id"]
          },
        ]
      }
      dots_regimens: {
        Row: {
          adherence_pct: number | null
          consecutive_missed_doses: number | null
          contact_screening_completed: boolean | null
          diagnosis_date: string
          enrolled_at: string
          expected_completion_date: string | null
          id: string
          last_dose_logged_at: string | null
          missed_doses_count: number | null
          next_dbt_date: string | null
          nikshay_id: string | null
          patient_id: string
          phase: Database["public"]["Enums"]["dots_phase"]
          phase_start_date: string
          regimen_kind: Database["public"]["Enums"]["dots_regimen_kind"] | null
          regimen_type: string
          status: Database["public"]["Enums"]["dots_regimen_status"]
          tenant_id: string
          updated_at: string
          weight_band: string | null
        }
        Insert: {
          adherence_pct?: number | null
          consecutive_missed_doses?: number | null
          contact_screening_completed?: boolean | null
          diagnosis_date: string
          enrolled_at?: string
          expected_completion_date?: string | null
          id?: string
          last_dose_logged_at?: string | null
          missed_doses_count?: number | null
          next_dbt_date?: string | null
          nikshay_id?: string | null
          patient_id: string
          phase?: Database["public"]["Enums"]["dots_phase"]
          phase_start_date: string
          regimen_kind?: Database["public"]["Enums"]["dots_regimen_kind"] | null
          regimen_type: string
          status?: Database["public"]["Enums"]["dots_regimen_status"]
          tenant_id: string
          updated_at?: string
          weight_band?: string | null
        }
        Update: {
          adherence_pct?: number | null
          consecutive_missed_doses?: number | null
          contact_screening_completed?: boolean | null
          diagnosis_date?: string
          enrolled_at?: string
          expected_completion_date?: string | null
          id?: string
          last_dose_logged_at?: string | null
          missed_doses_count?: number | null
          next_dbt_date?: string | null
          nikshay_id?: string | null
          patient_id?: string
          phase?: Database["public"]["Enums"]["dots_phase"]
          phase_start_date?: string
          regimen_kind?: Database["public"]["Enums"]["dots_regimen_kind"] | null
          regimen_type?: string
          status?: Database["public"]["Enums"]["dots_regimen_status"]
          tenant_id?: string
          updated_at?: string
          weight_band?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dots_regimens_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dots_regimens_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      dpdp_notices: {
        Row: {
          approved_by_dpo: string | null
          created_at: string
          effective_from: string
          grievance_email: string
          grievance_officer_name: string
          id: string
          lang: Database["public"]["Enums"]["encounter_lang"]
          notice_audio_url: string | null
          notice_text: string
          purposes: string[]
          retention_period: string
          rights_summary: string
          superseded_at: string | null
          version: string
        }
        Insert: {
          approved_by_dpo?: string | null
          created_at?: string
          effective_from: string
          grievance_email: string
          grievance_officer_name: string
          id?: string
          lang: Database["public"]["Enums"]["encounter_lang"]
          notice_audio_url?: string | null
          notice_text: string
          purposes: string[]
          retention_period: string
          rights_summary: string
          superseded_at?: string | null
          version: string
        }
        Update: {
          approved_by_dpo?: string | null
          created_at?: string
          effective_from?: string
          grievance_email?: string
          grievance_officer_name?: string
          id?: string
          lang?: Database["public"]["Enums"]["encounter_lang"]
          notice_audio_url?: string | null
          notice_text?: string
          purposes?: string[]
          retention_period?: string
          rights_summary?: string
          superseded_at?: string | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_dpdp_notices_dpo"
            columns: ["approved_by_dpo"]
            isOneToOne: false
            referencedRelation: "mo_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_dpdp_notices_dpo"
            columns: ["approved_by_dpo"]
            isOneToOne: false
            referencedRelation: "v_mo_users_with_indemnity"
            referencedColumns: ["id"]
          },
        ]
      }
      drug_safety_screen: {
        Row: {
          id: number
          notes: string | null
          result: string
          rx_line_id: number
          screen_type: string
          screened_at: string
          source: string | null
        }
        Insert: {
          id?: number
          notes?: string | null
          result: string
          rx_line_id: number
          screen_type: string
          screened_at?: string
          source?: string | null
        }
        Update: {
          id?: number
          notes?: string | null
          result?: string
          rx_line_id?: number
          screen_type?: string
          screened_at?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drug_safety_screen_rx_line_id_fkey"
            columns: ["rx_line_id"]
            isOneToOne: false
            referencedRelation: "prescription_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      eval_case_results: {
        Row: {
          actual_band: Database["public"]["Enums"]["triage_band"] | null
          actual_red_flags:
            | Database["public"]["Enums"]["red_flag_category"][]
            | null
          band_match: boolean | null
          case_id: string
          cost_inr: number | null
          eval_run_id: string
          expected_band: Database["public"]["Enums"]["triage_band"] | null
          expected_red_flags:
            | Database["public"]["Enums"]["red_flag_category"][]
            | null
          fail_reason: string | null
          id: number
          lang: Database["public"]["Enums"]["encounter_lang"] | null
          latency_ms: number | null
          raw_io: Json | null
        }
        Insert: {
          actual_band?: Database["public"]["Enums"]["triage_band"] | null
          actual_red_flags?:
            | Database["public"]["Enums"]["red_flag_category"][]
            | null
          band_match?: boolean | null
          case_id: string
          cost_inr?: number | null
          eval_run_id: string
          expected_band?: Database["public"]["Enums"]["triage_band"] | null
          expected_red_flags?:
            | Database["public"]["Enums"]["red_flag_category"][]
            | null
          fail_reason?: string | null
          id?: number
          lang?: Database["public"]["Enums"]["encounter_lang"] | null
          latency_ms?: number | null
          raw_io?: Json | null
        }
        Update: {
          actual_band?: Database["public"]["Enums"]["triage_band"] | null
          actual_red_flags?:
            | Database["public"]["Enums"]["red_flag_category"][]
            | null
          band_match?: boolean | null
          case_id?: string
          cost_inr?: number | null
          eval_run_id?: string
          expected_band?: Database["public"]["Enums"]["triage_band"] | null
          expected_red_flags?:
            | Database["public"]["Enums"]["red_flag_category"][]
            | null
          fail_reason?: string | null
          id?: number
          lang?: Database["public"]["Enums"]["encounter_lang"] | null
          latency_ms?: number | null
          raw_io?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "eval_case_results_eval_run_id_fkey"
            columns: ["eval_run_id"]
            isOneToOne: false
            referencedRelation: "eval_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      eval_runs: {
        Row: {
          avg_cost_inr: number | null
          git_sha: string | null
          id: string
          off_topic_redirect: number | null
          p50_latency_ms: number | null
          p95_latency_ms: number | null
          per_case_results: Json | null
          prompt_version: string | null
          ran_at: string
          red_flag_precision: number | null
          red_flag_recall: number | null
          triage_accuracy: number | null
        }
        Insert: {
          avg_cost_inr?: number | null
          git_sha?: string | null
          id?: string
          off_topic_redirect?: number | null
          p50_latency_ms?: number | null
          p95_latency_ms?: number | null
          per_case_results?: Json | null
          prompt_version?: string | null
          ran_at?: string
          red_flag_precision?: number | null
          red_flag_recall?: number | null
          triage_accuracy?: number | null
        }
        Update: {
          avg_cost_inr?: number | null
          git_sha?: string | null
          id?: string
          off_topic_redirect?: number | null
          p50_latency_ms?: number | null
          p95_latency_ms?: number | null
          per_case_results?: Json | null
          prompt_version?: string | null
          ran_at?: string
          red_flag_precision?: number | null
          red_flag_recall?: number | null
          triage_accuracy?: number | null
        }
        Relationships: []
      }
      hmis_push_failures: {
        Row: {
          adapter: string
          attempt_count: number
          created_at: string
          id: string
          last_error: string | null
          next_retry_at: string | null
          payload: Json | null
          resolved_at: string | null
          source_row_id: string
          source_table: string
        }
        Insert: {
          adapter: string
          attempt_count?: number
          created_at?: string
          id?: string
          last_error?: string | null
          next_retry_at?: string | null
          payload?: Json | null
          resolved_at?: string | null
          source_row_id: string
          source_table: string
        }
        Update: {
          adapter?: string
          attempt_count?: number
          created_at?: string
          id?: string
          last_error?: string | null
          next_retry_at?: string | null
          payload?: Json | null
          resolved_at?: string | null
          source_row_id?: string
          source_table?: string
        }
        Relationships: []
      }
      mental_health_escalations: {
        Row: {
          audio_evidence_url: string
          call_id: string
          consent_to_share_with_pot: boolean | null
          created_at: string
          icall_surfaced_at: string | null
          id: string
          kiran_surfaced_at: string | null
          mhp_referral_user_id: string | null
          mhp_referred_at: string | null
          nimhans_surfaced_at: string | null
          outcome: string | null
          patient_id: string
          person_of_trust_consent_audio_url: string | null
          person_of_trust_name_token: string | null
          person_of_trust_phone_token: string | null
          resolved_at: string | null
          retention_until: string
          screening_id: string | null
          severity: Database["public"]["Enums"]["mh_severity"]
          tele_manas_number_played: string | null
          tele_manas_surfaced_at: string | null
          tenant_id: string
          vandrevala_surfaced_at: string | null
        }
        Insert: {
          audio_evidence_url: string
          call_id: string
          consent_to_share_with_pot?: boolean | null
          created_at?: string
          icall_surfaced_at?: string | null
          id?: string
          kiran_surfaced_at?: string | null
          mhp_referral_user_id?: string | null
          mhp_referred_at?: string | null
          nimhans_surfaced_at?: string | null
          outcome?: string | null
          patient_id: string
          person_of_trust_consent_audio_url?: string | null
          person_of_trust_name_token?: string | null
          person_of_trust_phone_token?: string | null
          resolved_at?: string | null
          retention_until?: string
          screening_id?: string | null
          severity: Database["public"]["Enums"]["mh_severity"]
          tele_manas_number_played?: string | null
          tele_manas_surfaced_at?: string | null
          tenant_id: string
          vandrevala_surfaced_at?: string | null
        }
        Update: {
          audio_evidence_url?: string
          call_id?: string
          consent_to_share_with_pot?: boolean | null
          created_at?: string
          icall_surfaced_at?: string | null
          id?: string
          kiran_surfaced_at?: string | null
          mhp_referral_user_id?: string | null
          mhp_referred_at?: string | null
          nimhans_surfaced_at?: string | null
          outcome?: string | null
          patient_id?: string
          person_of_trust_consent_audio_url?: string | null
          person_of_trust_name_token?: string | null
          person_of_trust_phone_token?: string | null
          resolved_at?: string | null
          retention_until?: string
          screening_id?: string | null
          severity?: Database["public"]["Enums"]["mh_severity"]
          tele_manas_number_played?: string | null
          tele_manas_surfaced_at?: string | null
          tenant_id?: string
          vandrevala_surfaced_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mental_health_escalations_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mental_health_escalations_mhp_referral_user_id_fkey"
            columns: ["mhp_referral_user_id"]
            isOneToOne: false
            referencedRelation: "mo_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mental_health_escalations_mhp_referral_user_id_fkey"
            columns: ["mhp_referral_user_id"]
            isOneToOne: false
            referencedRelation: "v_mo_users_with_indemnity"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mental_health_escalations_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mental_health_escalations_screening_id_fkey"
            columns: ["screening_id"]
            isOneToOne: false
            referencedRelation: "mental_health_screenings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mental_health_escalations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mental_health_screenings: {
        Row: {
          administered_lang: Database["public"]["Enums"]["encounter_lang"]
          call_id: string
          fires_red_flag_event_id: number | null
          id: string
          instrument: Database["public"]["Enums"]["mh_instrument"]
          items_json: Json
          patient_id: string
          retention_until: string
          score: number
          screened_at: string
          severity: Database["public"]["Enums"]["mh_severity"]
        }
        Insert: {
          administered_lang: Database["public"]["Enums"]["encounter_lang"]
          call_id: string
          fires_red_flag_event_id?: number | null
          id?: string
          instrument: Database["public"]["Enums"]["mh_instrument"]
          items_json: Json
          patient_id: string
          retention_until?: string
          score: number
          screened_at?: string
          severity: Database["public"]["Enums"]["mh_severity"]
        }
        Update: {
          administered_lang?: Database["public"]["Enums"]["encounter_lang"]
          call_id?: string
          fires_red_flag_event_id?: number | null
          id?: string
          instrument?: Database["public"]["Enums"]["mh_instrument"]
          items_json?: Json
          patient_id?: string
          retention_until?: string
          score?: number
          screened_at?: string
          severity?: Database["public"]["Enums"]["mh_severity"]
        }
        Relationships: [
          {
            foreignKeyName: "mental_health_screenings_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mental_health_screenings_fires_red_flag_event_id_fkey"
            columns: ["fires_red_flag_event_id"]
            isOneToOne: false
            referencedRelation: "red_flag_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mental_health_screenings_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      mo_cockpit_chat_messages: {
        Row: {
          citations: Json | null
          content: string
          created_at: string
          id: number
          mo_user_id: string
          model: string | null
          patient_id: string | null
          role: string
          tool_calls: Json | null
          triage_decision_id: string | null
        }
        Insert: {
          citations?: Json | null
          content: string
          created_at?: string
          id?: number
          mo_user_id: string
          model?: string | null
          patient_id?: string | null
          role: string
          tool_calls?: Json | null
          triage_decision_id?: string | null
        }
        Update: {
          citations?: Json | null
          content?: string
          created_at?: string
          id?: number
          mo_user_id?: string
          model?: string | null
          patient_id?: string | null
          role?: string
          tool_calls?: Json | null
          triage_decision_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mo_cockpit_chat_messages_mo_user_id_fkey"
            columns: ["mo_user_id"]
            isOneToOne: false
            referencedRelation: "mo_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mo_cockpit_chat_messages_mo_user_id_fkey"
            columns: ["mo_user_id"]
            isOneToOne: false
            referencedRelation: "v_mo_users_with_indemnity"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mo_cockpit_chat_messages_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mo_cockpit_chat_messages_triage_decision_id_fkey"
            columns: ["triage_decision_id"]
            isOneToOne: false
            referencedRelation: "triage_decisions"
            referencedColumns: ["id"]
          },
        ]
      }
      mo_state_licenses: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          issued_at: string | null
          mo_user_id: string
          registration_number: string
          retention_until: string
          scope: string | null
          smc_name: string | null
          state_code: string
          status: Database["public"]["Enums"]["rmp_status"]
          suspended_at: string | null
          suspension_reason: string | null
          updated_at: string
          verified_at: string | null
          verified_via: string | null
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          issued_at?: string | null
          mo_user_id: string
          registration_number: string
          retention_until?: string
          scope?: string | null
          smc_name?: string | null
          state_code: string
          status?: Database["public"]["Enums"]["rmp_status"]
          suspended_at?: string | null
          suspension_reason?: string | null
          updated_at?: string
          verified_at?: string | null
          verified_via?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          issued_at?: string | null
          mo_user_id?: string
          registration_number?: string
          retention_until?: string
          scope?: string | null
          smc_name?: string | null
          state_code?: string
          status?: Database["public"]["Enums"]["rmp_status"]
          suspended_at?: string | null
          suspension_reason?: string | null
          updated_at?: string
          verified_at?: string | null
          verified_via?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mo_state_licenses_mo_user_id_fkey"
            columns: ["mo_user_id"]
            isOneToOne: false
            referencedRelation: "mo_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mo_state_licenses_mo_user_id_fkey"
            columns: ["mo_user_id"]
            isOneToOne: false
            referencedRelation: "v_mo_users_with_indemnity"
            referencedColumns: ["id"]
          },
        ]
      }
      mo_users: {
        Row: {
          auth_user_id: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          mci_registration_number: string
          nmc_hpr_id: string | null
          on_call: boolean
          phone_e164: string | null
          pi_insurance_expires_at: string | null
          pi_insurance_policy_number: string | null
          pi_insurance_provider: string | null
          qualifications: string[] | null
          red_flag_pager_phone: string | null
          registration_status: Database["public"]["Enums"]["rmp_status"]
          registration_verified_at: string | null
          specialty: string | null
          state_medical_council: string
          states_authorised: string[] | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          email: string
          full_name: string
          id?: string
          mci_registration_number: string
          nmc_hpr_id?: string | null
          on_call?: boolean
          phone_e164?: string | null
          pi_insurance_expires_at?: string | null
          pi_insurance_policy_number?: string | null
          pi_insurance_provider?: string | null
          qualifications?: string[] | null
          red_flag_pager_phone?: string | null
          registration_status?: Database["public"]["Enums"]["rmp_status"]
          registration_verified_at?: string | null
          specialty?: string | null
          state_medical_council: string
          states_authorised?: string[] | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          mci_registration_number?: string
          nmc_hpr_id?: string | null
          on_call?: boolean
          phone_e164?: string | null
          pi_insurance_expires_at?: string | null
          pi_insurance_policy_number?: string | null
          pi_insurance_provider?: string | null
          qualifications?: string[] | null
          red_flag_pager_phone?: string | null
          registration_status?: Database["public"]["Enums"]["rmp_status"]
          registration_verified_at?: string | null
          specialty?: string | null
          state_medical_council?: string
          states_authorised?: string[] | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mo_users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ops_incidents: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          category: string | null
          created_at: string
          description: string | null
          id: string
          payload: Json | null
          related_call_id: string | null
          related_tenant_id: string | null
          resolution_note: string | null
          resolved_at: string | null
          severity: Database["public"]["Enums"]["incident_severity"]
          source: string
          title: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          payload?: Json | null
          related_call_id?: string | null
          related_tenant_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          severity: Database["public"]["Enums"]["incident_severity"]
          source: string
          title: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          payload?: Json | null
          related_call_id?: string | null
          related_tenant_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          severity?: Database["public"]["Enums"]["incident_severity"]
          source?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_ops_incidents_call"
            columns: ["related_call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ops_incidents_related_tenant_id_fkey"
            columns: ["related_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      outbound_messages: {
        Row: {
          body_lang: Database["public"]["Enums"]["encounter_lang"]
          body_text: string
          channel: Database["public"]["Enums"]["dispatch_channel"]
          created_at: string
          delivered_at: string | null
          dlt_entity_id: string
          dlt_header: string
          dlt_template_id: string
          failed_reason: string | null
          id: string
          patient_id: string | null
          patient_phone_e164: string
          provider_message_id: string | null
          related_call_id: string | null
          related_dispatch_id: string | null
          retention_until: string
          rmp_name_snapshot: string
          rmp_reg_number_snapshot: string
          rmp_state_council_snapshot: string
          rmp_user_id: string
          sent_at: string | null
          status: Database["public"]["Enums"]["outbound_status"]
          tenant_id: string
        }
        Insert: {
          body_lang: Database["public"]["Enums"]["encounter_lang"]
          body_text: string
          channel: Database["public"]["Enums"]["dispatch_channel"]
          created_at?: string
          delivered_at?: string | null
          dlt_entity_id: string
          dlt_header: string
          dlt_template_id: string
          failed_reason?: string | null
          id?: string
          patient_id?: string | null
          patient_phone_e164: string
          provider_message_id?: string | null
          related_call_id?: string | null
          related_dispatch_id?: string | null
          retention_until?: string
          rmp_name_snapshot: string
          rmp_reg_number_snapshot: string
          rmp_state_council_snapshot: string
          rmp_user_id: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["outbound_status"]
          tenant_id: string
        }
        Update: {
          body_lang?: Database["public"]["Enums"]["encounter_lang"]
          body_text?: string
          channel?: Database["public"]["Enums"]["dispatch_channel"]
          created_at?: string
          delivered_at?: string | null
          dlt_entity_id?: string
          dlt_header?: string
          dlt_template_id?: string
          failed_reason?: string | null
          id?: string
          patient_id?: string | null
          patient_phone_e164?: string
          provider_message_id?: string | null
          related_call_id?: string | null
          related_dispatch_id?: string | null
          retention_until?: string
          rmp_name_snapshot?: string
          rmp_reg_number_snapshot?: string
          rmp_state_council_snapshot?: string
          rmp_user_id?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["outbound_status"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "outbound_messages_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbound_messages_related_call_id_fkey"
            columns: ["related_call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbound_messages_related_dispatch_id_fkey"
            columns: ["related_dispatch_id"]
            isOneToOne: false
            referencedRelation: "call_dispatch_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbound_messages_rmp_user_id_fkey"
            columns: ["rmp_user_id"]
            isOneToOne: false
            referencedRelation: "mo_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbound_messages_rmp_user_id_fkey"
            columns: ["rmp_user_id"]
            isOneToOne: false
            referencedRelation: "v_mo_users_with_indemnity"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbound_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      parental_guardians: {
        Row: {
          consent_audio_url: string | null
          consent_id: string
          consent_phrase_lang: Database["public"]["Enums"]["encounter_lang"]
          created_at: string
          guardian_abha_id: string | null
          guardian_name: string
          guardian_phone_e164: string
          id: string
          minor_assent_audio_url: string | null
          minor_assent_captured: boolean
          minor_patient_id: string
          relationship: string
          retention_until: string
          verification_evidence_url: string | null
          verification_method: string
        }
        Insert: {
          consent_audio_url?: string | null
          consent_id: string
          consent_phrase_lang: Database["public"]["Enums"]["encounter_lang"]
          created_at?: string
          guardian_abha_id?: string | null
          guardian_name: string
          guardian_phone_e164: string
          id?: string
          minor_assent_audio_url?: string | null
          minor_assent_captured?: boolean
          minor_patient_id: string
          relationship: string
          retention_until?: string
          verification_evidence_url?: string | null
          verification_method: string
        }
        Update: {
          consent_audio_url?: string | null
          consent_id?: string
          consent_phrase_lang?: Database["public"]["Enums"]["encounter_lang"]
          created_at?: string
          guardian_abha_id?: string | null
          guardian_name?: string
          guardian_phone_e164?: string
          id?: string
          minor_assent_audio_url?: string | null
          minor_assent_captured?: boolean
          minor_patient_id?: string
          relationship?: string
          retention_until?: string
          verification_evidence_url?: string | null
          verification_method?: string
        }
        Relationships: [
          {
            foreignKeyName: "parental_guardians_consent_id_fkey"
            columns: ["consent_id"]
            isOneToOne: false
            referencedRelation: "consents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parental_guardians_minor_patient_id_fkey"
            columns: ["minor_patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          abha_address: string | null
          abha_id: string | null
          age_years: number | null
          allergies: string[] | null
          chronic_conditions: string[] | null
          created_at: string
          date_of_birth: string | null
          display_initial: string | null
          district_code: string | null
          full_name: string | null
          id: string
          is_minor: boolean | null
          parental_consent_captured: boolean
          phone_e164: string
          pin_code: string | null
          preferred_language: Database["public"]["Enums"]["encounter_lang"]
          pregnancy_status: string | null
          primary_asha_id: string | null
          purge_reason: string | null
          purged_at: string | null
          sex: string | null
          state_code: string | null
          tenant_id: string
          updated_at: string
          village_name: string | null
        }
        Insert: {
          abha_address?: string | null
          abha_id?: string | null
          age_years?: number | null
          allergies?: string[] | null
          chronic_conditions?: string[] | null
          created_at?: string
          date_of_birth?: string | null
          display_initial?: string | null
          district_code?: string | null
          full_name?: string | null
          id?: string
          is_minor?: boolean | null
          parental_consent_captured?: boolean
          phone_e164: string
          pin_code?: string | null
          preferred_language?: Database["public"]["Enums"]["encounter_lang"]
          pregnancy_status?: string | null
          primary_asha_id?: string | null
          purge_reason?: string | null
          purged_at?: string | null
          sex?: string | null
          state_code?: string | null
          tenant_id: string
          updated_at?: string
          village_name?: string | null
        }
        Update: {
          abha_address?: string | null
          abha_id?: string | null
          age_years?: number | null
          allergies?: string[] | null
          chronic_conditions?: string[] | null
          created_at?: string
          date_of_birth?: string | null
          display_initial?: string | null
          district_code?: string | null
          full_name?: string | null
          id?: string
          is_minor?: boolean | null
          parental_consent_captured?: boolean
          phone_e164?: string
          pin_code?: string | null
          preferred_language?: Database["public"]["Enums"]["encounter_lang"]
          pregnancy_status?: string | null
          primary_asha_id?: string | null
          purge_reason?: string | null
          purged_at?: string | null
          sex?: string | null
          state_code?: string | null
          tenant_id?: string
          updated_at?: string
          village_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patients_primary_asha_id_fkey"
            columns: ["primary_asha_id"]
            isOneToOne: false
            referencedRelation: "asha_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patients_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      peds_imci_assessments: {
        Row: {
          age_months: number
          assessed_at: string
          call_id: string
          chest_indrawing: boolean | null
          complementary_feeding_started_6m: boolean | null
          created_at: string
          danger_convulsion: boolean | null
          danger_lethargy_unconsciousness: boolean | null
          danger_unable_to_drink: boolean | null
          danger_vomits_everything: boolean | null
          edema_bilateral: boolean | null
          exclusive_bf_under_6m: boolean | null
          fast_breathing: boolean | null
          height_cm: number | null
          height_for_age_z: number | null
          id: string
          immunization_due_list: string[] | null
          muac_mm: number | null
          notes: string | null
          nutrition_classification:
            | Database["public"]["Enums"]["peds_nutrition_class"]
            | null
          ors_zinc_advised: boolean | null
          patient_id: string
          pneumonia_classification:
            | Database["public"]["Enums"]["peds_pneumonia_class"]
            | null
          respiratory_rate_per_min: number | null
          vitamin_a_due: boolean | null
          weight_for_age_z: number | null
          weight_for_height_z: number | null
          weight_kg: number | null
        }
        Insert: {
          age_months: number
          assessed_at?: string
          call_id: string
          chest_indrawing?: boolean | null
          complementary_feeding_started_6m?: boolean | null
          created_at?: string
          danger_convulsion?: boolean | null
          danger_lethargy_unconsciousness?: boolean | null
          danger_unable_to_drink?: boolean | null
          danger_vomits_everything?: boolean | null
          edema_bilateral?: boolean | null
          exclusive_bf_under_6m?: boolean | null
          fast_breathing?: boolean | null
          height_cm?: number | null
          height_for_age_z?: number | null
          id?: string
          immunization_due_list?: string[] | null
          muac_mm?: number | null
          notes?: string | null
          nutrition_classification?:
            | Database["public"]["Enums"]["peds_nutrition_class"]
            | null
          ors_zinc_advised?: boolean | null
          patient_id: string
          pneumonia_classification?:
            | Database["public"]["Enums"]["peds_pneumonia_class"]
            | null
          respiratory_rate_per_min?: number | null
          vitamin_a_due?: boolean | null
          weight_for_age_z?: number | null
          weight_for_height_z?: number | null
          weight_kg?: number | null
        }
        Update: {
          age_months?: number
          assessed_at?: string
          call_id?: string
          chest_indrawing?: boolean | null
          complementary_feeding_started_6m?: boolean | null
          created_at?: string
          danger_convulsion?: boolean | null
          danger_lethargy_unconsciousness?: boolean | null
          danger_unable_to_drink?: boolean | null
          danger_vomits_everything?: boolean | null
          edema_bilateral?: boolean | null
          exclusive_bf_under_6m?: boolean | null
          fast_breathing?: boolean | null
          height_cm?: number | null
          height_for_age_z?: number | null
          id?: string
          immunization_due_list?: string[] | null
          muac_mm?: number | null
          notes?: string | null
          nutrition_classification?:
            | Database["public"]["Enums"]["peds_nutrition_class"]
            | null
          ors_zinc_advised?: boolean | null
          patient_id?: string
          pneumonia_classification?:
            | Database["public"]["Enums"]["peds_pneumonia_class"]
            | null
          respiratory_rate_per_min?: number | null
          vitamin_a_due?: boolean | null
          weight_for_age_z?: number | null
          weight_for_height_z?: number | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "peds_imci_assessments_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "peds_imci_assessments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      phi_access_log: {
        Row: {
          accessed_at: string
          auth_user_id: string
          id: number
          patient_id: string | null
          purpose_code: Database["public"]["Enums"]["phi_purpose"]
          request_context: Json | null
          retention_until: string
          row_id: string
          table_name: string
          user_role: string
        }
        Insert: {
          accessed_at?: string
          auth_user_id: string
          id?: number
          patient_id?: string | null
          purpose_code: Database["public"]["Enums"]["phi_purpose"]
          request_context?: Json | null
          retention_until?: string
          row_id: string
          table_name: string
          user_role: string
        }
        Update: {
          accessed_at?: string
          auth_user_id?: string
          id?: number
          patient_id?: string | null
          purpose_code?: Database["public"]["Enums"]["phi_purpose"]
          request_context?: Json | null
          retention_until?: string
          row_id?: string
          table_name?: string
          user_role?: string
        }
        Relationships: []
      }
      pii_token_map: {
        Row: {
          call_id: string | null
          created_at: string
          encrypted_abha: string | null
          encrypted_name: string | null
          encrypted_phone: string | null
          encrypted_village: string | null
          id: string
          retention_until: string
          session_token: string
          token_map: Json
          token_map_encrypted: string | null
        }
        Insert: {
          call_id?: string | null
          created_at?: string
          encrypted_abha?: string | null
          encrypted_name?: string | null
          encrypted_phone?: string | null
          encrypted_village?: string | null
          id?: string
          retention_until?: string
          session_token: string
          token_map?: Json
          token_map_encrypted?: string | null
        }
        Update: {
          call_id?: string | null
          created_at?: string
          encrypted_abha?: string | null
          encrypted_name?: string | null
          encrypted_phone?: string | null
          encrypted_village?: string | null
          id?: string
          retention_until?: string
          session_token?: string
          token_map?: Json
          token_map_encrypted?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pii_token_map_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
        ]
      }
      pilot_adverse_events: {
        Row: {
          ae_type: Database["public"]["Enums"]["pilot_ae_type"]
          call_id: string | null
          created_at: string
          described_by: string | null
          described_by_role: Database["public"]["Enums"]["ae_described_by_role"]
          grade: number
          id: string
          narrative: string | null
          patient_id: string | null
          pilot_cohort_id: string | null
          reported_to_iec_at: string | null
          reported_to_pvpi_at: string | null
          retention_until: string
          root_cause_category: string | null
          triage_decision_id: string | null
          triggered_pilot_halt: boolean
        }
        Insert: {
          ae_type: Database["public"]["Enums"]["pilot_ae_type"]
          call_id?: string | null
          created_at?: string
          described_by?: string | null
          described_by_role: Database["public"]["Enums"]["ae_described_by_role"]
          grade: number
          id?: string
          narrative?: string | null
          patient_id?: string | null
          pilot_cohort_id?: string | null
          reported_to_iec_at?: string | null
          reported_to_pvpi_at?: string | null
          retention_until?: string
          root_cause_category?: string | null
          triage_decision_id?: string | null
          triggered_pilot_halt?: boolean
        }
        Update: {
          ae_type?: Database["public"]["Enums"]["pilot_ae_type"]
          call_id?: string | null
          created_at?: string
          described_by?: string | null
          described_by_role?: Database["public"]["Enums"]["ae_described_by_role"]
          grade?: number
          id?: string
          narrative?: string | null
          patient_id?: string | null
          pilot_cohort_id?: string | null
          reported_to_iec_at?: string | null
          reported_to_pvpi_at?: string | null
          retention_until?: string
          root_cause_category?: string | null
          triage_decision_id?: string | null
          triggered_pilot_halt?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "pilot_adverse_events_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pilot_adverse_events_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pilot_adverse_events_pilot_cohort_id_fkey"
            columns: ["pilot_cohort_id"]
            isOneToOne: false
            referencedRelation: "pilot_cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pilot_adverse_events_triage_decision_id_fkey"
            columns: ["triage_decision_id"]
            isOneToOne: false
            referencedRelation: "triage_decisions"
            referencedColumns: ["id"]
          },
        ]
      }
      pilot_cohorts: {
        Row: {
          created_at: string
          current_n: number
          end_date: string | null
          ethics_approval_id: string | null
          halt_criteria_json: Json
          halt_reason: string | null
          halted_at: string | null
          id: string
          iec_chair_email: string | null
          pilot_name: string
          start_date: string
          target_n: number
        }
        Insert: {
          created_at?: string
          current_n?: number
          end_date?: string | null
          ethics_approval_id?: string | null
          halt_criteria_json?: Json
          halt_reason?: string | null
          halted_at?: string | null
          id?: string
          iec_chair_email?: string | null
          pilot_name: string
          start_date: string
          target_n: number
        }
        Update: {
          created_at?: string
          current_n?: number
          end_date?: string | null
          ethics_approval_id?: string | null
          halt_criteria_json?: Json
          halt_reason?: string | null
          halted_at?: string | null
          id?: string
          iec_chair_email?: string | null
          pilot_name?: string
          start_date?: string
          target_n?: number
        }
        Relationships: []
      }
      pocso_reports: {
        Row: {
          audio_hash: string
          call_id: string
          caregiver_notified_at: string | null
          caregiver_relationship: string | null
          child_age_estimated: number | null
          child_patient_id: string | null
          child_phone_e164: string
          childline_1098_reported_at: string
          childline_ref: string | null
          compliance_officer_user_id: string
          created_at: string
          cwc_notified_at: string | null
          disclosure_summary_redacted: string
          evidence_audio_url: string
          id: string
          retention_until: string
          sjpu_jurisdiction: string
          sjpu_ref: string | null
          sjpu_reported_at: string
        }
        Insert: {
          audio_hash: string
          call_id: string
          caregiver_notified_at?: string | null
          caregiver_relationship?: string | null
          child_age_estimated?: number | null
          child_patient_id?: string | null
          child_phone_e164: string
          childline_1098_reported_at: string
          childline_ref?: string | null
          compliance_officer_user_id: string
          created_at?: string
          cwc_notified_at?: string | null
          disclosure_summary_redacted: string
          evidence_audio_url: string
          id?: string
          retention_until?: string
          sjpu_jurisdiction: string
          sjpu_ref?: string | null
          sjpu_reported_at: string
        }
        Update: {
          audio_hash?: string
          call_id?: string
          caregiver_notified_at?: string | null
          caregiver_relationship?: string | null
          child_age_estimated?: number | null
          child_patient_id?: string | null
          child_phone_e164?: string
          childline_1098_reported_at?: string
          childline_ref?: string | null
          compliance_officer_user_id?: string
          created_at?: string
          cwc_notified_at?: string | null
          disclosure_summary_redacted?: string
          evidence_audio_url?: string
          id?: string
          retention_until?: string
          sjpu_jurisdiction?: string
          sjpu_ref?: string | null
          sjpu_reported_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pocso_reports_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pocso_reports_child_patient_id_fkey"
            columns: ["child_patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pocso_reports_compliance_officer_user_id_fkey"
            columns: ["compliance_officer_user_id"]
            isOneToOne: false
            referencedRelation: "mo_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pocso_reports_compliance_officer_user_id_fkey"
            columns: ["compliance_officer_user_id"]
            isOneToOne: false
            referencedRelation: "v_mo_users_with_indemnity"
            referencedColumns: ["id"]
          },
        ]
      }
      pregnancies: {
        Row: {
          abortions: number | null
          blood_group_typed: Database["public"]["Enums"]["blood_group"] | null
          closed_at: string | null
          edd_date: string | null
          gravida: number | null
          high_risk_flags: string[] | null
          hrp_flags: Database["public"]["Enums"]["pregnancy_hrp_flag"][] | null
          id: string
          ifa_tablets_dispensed: number | null
          living: number | null
          lmp_date: string
          outcome: string | null
          outcome_date: string | null
          para: number | null
          patient_id: string
          registered_at: string
          registered_under_jsy: boolean | null
          registered_under_pmmvy: boolean | null
          serology_hbsag: Database["public"]["Enums"]["serology_status"] | null
          serology_hcv: Database["public"]["Enums"]["serology_status"] | null
          serology_hiv: Database["public"]["Enums"]["serology_status"] | null
          serology_syphilis:
            | Database["public"]["Enums"]["serology_status"]
            | null
          serology_tested_at: string | null
          tenant_id: string
          tt_doses_given: number | null
        }
        Insert: {
          abortions?: number | null
          blood_group_typed?: Database["public"]["Enums"]["blood_group"] | null
          closed_at?: string | null
          edd_date?: string | null
          gravida?: number | null
          high_risk_flags?: string[] | null
          hrp_flags?: Database["public"]["Enums"]["pregnancy_hrp_flag"][] | null
          id?: string
          ifa_tablets_dispensed?: number | null
          living?: number | null
          lmp_date: string
          outcome?: string | null
          outcome_date?: string | null
          para?: number | null
          patient_id: string
          registered_at?: string
          registered_under_jsy?: boolean | null
          registered_under_pmmvy?: boolean | null
          serology_hbsag?: Database["public"]["Enums"]["serology_status"] | null
          serology_hcv?: Database["public"]["Enums"]["serology_status"] | null
          serology_hiv?: Database["public"]["Enums"]["serology_status"] | null
          serology_syphilis?:
            | Database["public"]["Enums"]["serology_status"]
            | null
          serology_tested_at?: string | null
          tenant_id: string
          tt_doses_given?: number | null
        }
        Update: {
          abortions?: number | null
          blood_group_typed?: Database["public"]["Enums"]["blood_group"] | null
          closed_at?: string | null
          edd_date?: string | null
          gravida?: number | null
          high_risk_flags?: string[] | null
          hrp_flags?: Database["public"]["Enums"]["pregnancy_hrp_flag"][] | null
          id?: string
          ifa_tablets_dispensed?: number | null
          living?: number | null
          lmp_date?: string
          outcome?: string | null
          outcome_date?: string | null
          para?: number | null
          patient_id?: string
          registered_at?: string
          registered_under_jsy?: boolean | null
          registered_under_pmmvy?: boolean | null
          serology_hbsag?: Database["public"]["Enums"]["serology_status"] | null
          serology_hcv?: Database["public"]["Enums"]["serology_status"] | null
          serology_hiv?: Database["public"]["Enums"]["serology_status"] | null
          serology_syphilis?:
            | Database["public"]["Enums"]["serology_status"]
            | null
          serology_tested_at?: string | null
          tenant_id?: string
          tt_doses_given?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pregnancies_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pregnancies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      prescription_lines: {
        Row: {
          ayush_concurrent: boolean | null
          contraindication_check_passed: boolean | null
          dose: string
          drug_class: Database["public"]["Enums"]["rx_drug_class"]
          drug_name_generic: string
          duration_days: number
          frequency: string
          id: number
          indication_icd11: string | null
          instructions_native: string | null
          line_idx: number
          prescription_id: string
          prn: boolean | null
          route: string | null
          schedule_h1_red_flag: boolean
          total_quantity: number | null
        }
        Insert: {
          ayush_concurrent?: boolean | null
          contraindication_check_passed?: boolean | null
          dose: string
          drug_class: Database["public"]["Enums"]["rx_drug_class"]
          drug_name_generic: string
          duration_days: number
          frequency: string
          id?: number
          indication_icd11?: string | null
          instructions_native?: string | null
          line_idx: number
          prescription_id: string
          prn?: boolean | null
          route?: string | null
          schedule_h1_red_flag?: boolean
          total_quantity?: number | null
        }
        Update: {
          ayush_concurrent?: boolean | null
          contraindication_check_passed?: boolean | null
          dose?: string
          drug_class?: Database["public"]["Enums"]["rx_drug_class"]
          drug_name_generic?: string
          duration_days?: number
          frequency?: string
          id?: number
          indication_icd11?: string | null
          instructions_native?: string | null
          line_idx?: number
          prescription_id?: string
          prn?: boolean | null
          route?: string | null
          schedule_h1_red_flag?: boolean
          total_quantity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "prescription_lines_prescription_id_fkey"
            columns: ["prescription_id"]
            isOneToOne: false
            referencedRelation: "prescriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      prescriptions: {
        Row: {
          created_at: string
          dispensed_at: string | null
          dispensing_pharmacy: string | null
          dispensing_state_code: string | null
          id: string
          is_refill: boolean
          patient_id: string
          place_of_practice: string
          refill_class: string | null
          refill_source_rx_id: string | null
          retention_until: string
          rmp_name_snapshot: string
          rmp_qualifications_snapshot: string[]
          rmp_reg_number_snapshot: string
          rmp_state_council_snapshot: string
          rmp_user_id: string
          rx_lang: Database["public"]["Enums"]["encounter_lang"]
          rx_text: string
          signature_hash: string | null
          signature_method: string | null
          signed_at: string | null
          soap_note_id: string
          status: Database["public"]["Enums"]["rx_status"]
          tenant_id: string
        }
        Insert: {
          created_at?: string
          dispensed_at?: string | null
          dispensing_pharmacy?: string | null
          dispensing_state_code?: string | null
          id?: string
          is_refill?: boolean
          patient_id: string
          place_of_practice: string
          refill_class?: string | null
          refill_source_rx_id?: string | null
          retention_until?: string
          rmp_name_snapshot: string
          rmp_qualifications_snapshot: string[]
          rmp_reg_number_snapshot: string
          rmp_state_council_snapshot: string
          rmp_user_id: string
          rx_lang: Database["public"]["Enums"]["encounter_lang"]
          rx_text: string
          signature_hash?: string | null
          signature_method?: string | null
          signed_at?: string | null
          soap_note_id: string
          status?: Database["public"]["Enums"]["rx_status"]
          tenant_id: string
        }
        Update: {
          created_at?: string
          dispensed_at?: string | null
          dispensing_pharmacy?: string | null
          dispensing_state_code?: string | null
          id?: string
          is_refill?: boolean
          patient_id?: string
          place_of_practice?: string
          refill_class?: string | null
          refill_source_rx_id?: string | null
          retention_until?: string
          rmp_name_snapshot?: string
          rmp_qualifications_snapshot?: string[]
          rmp_reg_number_snapshot?: string
          rmp_state_council_snapshot?: string
          rmp_user_id?: string
          rx_lang?: Database["public"]["Enums"]["encounter_lang"]
          rx_text?: string
          signature_hash?: string | null
          signature_method?: string | null
          signed_at?: string | null
          soap_note_id?: string
          status?: Database["public"]["Enums"]["rx_status"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prescriptions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_refill_source_rx_id_fkey"
            columns: ["refill_source_rx_id"]
            isOneToOne: false
            referencedRelation: "prescriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_rmp_user_id_fkey"
            columns: ["rmp_user_id"]
            isOneToOne: false
            referencedRelation: "mo_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_rmp_user_id_fkey"
            columns: ["rmp_user_id"]
            isOneToOne: false
            referencedRelation: "v_mo_users_with_indemnity"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_soap_note_id_fkey"
            columns: ["soap_note_id"]
            isOneToOne: false
            referencedRelation: "soap_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      presenting_complaints: {
        Row: {
          associated_symptoms: string[] | null
          call_id: string
          complaint_code: string
          complaint_native_text: string | null
          cough_duration_weeks: number | null
          created_at: string
          duration_unit: string | null
          duration_value: number | null
          fever_duration_days: number | null
          id: string
          location_body_site: string | null
          night_sweats: boolean | null
          onset_at: string | null
          patient_id: string
          severity: number | null
          sputum_blood: boolean | null
          weight_loss: boolean | null
        }
        Insert: {
          associated_symptoms?: string[] | null
          call_id: string
          complaint_code: string
          complaint_native_text?: string | null
          cough_duration_weeks?: number | null
          created_at?: string
          duration_unit?: string | null
          duration_value?: number | null
          fever_duration_days?: number | null
          id?: string
          location_body_site?: string | null
          night_sweats?: boolean | null
          onset_at?: string | null
          patient_id: string
          severity?: number | null
          sputum_blood?: boolean | null
          weight_loss?: boolean | null
        }
        Update: {
          associated_symptoms?: string[] | null
          call_id?: string
          complaint_code?: string
          complaint_native_text?: string | null
          cough_duration_weeks?: number | null
          created_at?: string
          duration_unit?: string | null
          duration_value?: number | null
          fever_duration_days?: number | null
          id?: string
          location_body_site?: string | null
          night_sweats?: boolean | null
          onset_at?: string | null
          patient_id?: string
          severity?: number | null
          sputum_blood?: boolean | null
          weight_loss?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "presenting_complaints_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presenting_complaints_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      rag_chunks: {
        Row: {
          content: string
          created_at: string
          doc_id: string
          embedding: string | null
          guideline_version: string | null
          id: string
          lang: Database["public"]["Enums"]["encounter_lang"] | null
          page: number | null
          section: string | null
          source_authority: string | null
          tags: string[] | null
          token_count: number | null
        }
        Insert: {
          content: string
          created_at?: string
          doc_id: string
          embedding?: string | null
          guideline_version?: string | null
          id: string
          lang?: Database["public"]["Enums"]["encounter_lang"] | null
          page?: number | null
          section?: string | null
          source_authority?: string | null
          tags?: string[] | null
          token_count?: number | null
        }
        Update: {
          content?: string
          created_at?: string
          doc_id?: string
          embedding?: string | null
          guideline_version?: string | null
          id?: string
          lang?: Database["public"]["Enums"]["encounter_lang"] | null
          page?: number | null
          section?: string | null
          source_authority?: string | null
          tags?: string[] | null
          token_count?: number | null
        }
        Relationships: []
      }
      red_flag_events: {
        Row: {
          action_taken: string | null
          ambulance_108_advised_at: string | null
          asha_sos_at: string | null
          call_id: string | null
          category: Database["public"]["Enums"]["red_flag_category"]
          confidence: number | null
          id: number
          matched_phrase: string | null
          matched_phrase_id: string | null
          mo_paged_at: string | null
          mo_paged_user_id: string | null
          patient_id: string | null
          raised_at: string
          resolution_note: string | null
          resolved_at: string | null
          retention_until: string
          source: Database["public"]["Enums"]["red_flag_source"]
          tenant_id: string | null
          turn_id: number | null
        }
        Insert: {
          action_taken?: string | null
          ambulance_108_advised_at?: string | null
          asha_sos_at?: string | null
          call_id?: string | null
          category: Database["public"]["Enums"]["red_flag_category"]
          confidence?: number | null
          id?: number
          matched_phrase?: string | null
          matched_phrase_id?: string | null
          mo_paged_at?: string | null
          mo_paged_user_id?: string | null
          patient_id?: string | null
          raised_at?: string
          resolution_note?: string | null
          resolved_at?: string | null
          retention_until?: string
          source: Database["public"]["Enums"]["red_flag_source"]
          tenant_id?: string | null
          turn_id?: number | null
        }
        Update: {
          action_taken?: string | null
          ambulance_108_advised_at?: string | null
          asha_sos_at?: string | null
          call_id?: string | null
          category?: Database["public"]["Enums"]["red_flag_category"]
          confidence?: number | null
          id?: number
          matched_phrase?: string | null
          matched_phrase_id?: string | null
          mo_paged_at?: string | null
          mo_paged_user_id?: string | null
          patient_id?: string | null
          raised_at?: string
          resolution_note?: string | null
          resolved_at?: string | null
          retention_until?: string
          source?: Database["public"]["Enums"]["red_flag_source"]
          tenant_id?: string | null
          turn_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_red_flag_events_call"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "red_flag_events_matched_phrase_id_fkey"
            columns: ["matched_phrase_id"]
            isOneToOne: false
            referencedRelation: "red_flag_phrases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "red_flag_events_mo_paged_user_id_fkey"
            columns: ["mo_paged_user_id"]
            isOneToOne: false
            referencedRelation: "mo_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "red_flag_events_mo_paged_user_id_fkey"
            columns: ["mo_paged_user_id"]
            isOneToOne: false
            referencedRelation: "v_mo_users_with_indemnity"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "red_flag_events_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "red_flag_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "red_flag_events_turn_id_fkey"
            columns: ["turn_id"]
            isOneToOne: false
            referencedRelation: "turns"
            referencedColumns: ["id"]
          },
        ]
      }
      red_flag_phrases: {
        Row: {
          authored_by_mo_id: string | null
          category: Database["public"]["Enums"]["red_flag_category"]
          created_at: string
          detection_method: string
          example_context: string | null
          id: string
          lang: Database["public"]["Enums"]["encounter_lang"]
          min_confidence: number | null
          phrase: string
          regex_pattern: string | null
          severity_score: number
        }
        Insert: {
          authored_by_mo_id?: string | null
          category: Database["public"]["Enums"]["red_flag_category"]
          created_at?: string
          detection_method?: string
          example_context?: string | null
          id?: string
          lang: Database["public"]["Enums"]["encounter_lang"]
          min_confidence?: number | null
          phrase: string
          regex_pattern?: string | null
          severity_score: number
        }
        Update: {
          authored_by_mo_id?: string | null
          category?: Database["public"]["Enums"]["red_flag_category"]
          created_at?: string
          detection_method?: string
          example_context?: string | null
          id?: string
          lang?: Database["public"]["Enums"]["encounter_lang"]
          min_confidence?: number | null
          phrase?: string
          regex_pattern?: string | null
          severity_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "red_flag_phrases_authored_by_mo_id_fkey"
            columns: ["authored_by_mo_id"]
            isOneToOne: false
            referencedRelation: "mo_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "red_flag_phrases_authored_by_mo_id_fkey"
            columns: ["authored_by_mo_id"]
            isOneToOne: false
            referencedRelation: "v_mo_users_with_indemnity"
            referencedColumns: ["id"]
          },
        ]
      }
      refusal_log: {
        Row: {
          audio_segment_hash: string | null
          audio_segment_url: string | null
          call_id: string | null
          category: Database["public"]["Enums"]["refusal_category"]
          created_at: string
          id: number
          patient_id: string | null
          refusal_script_used: string
          retention_until: string
          tenant_id: string | null
          trigger_text: string
          turn_id: number | null
        }
        Insert: {
          audio_segment_hash?: string | null
          audio_segment_url?: string | null
          call_id?: string | null
          category: Database["public"]["Enums"]["refusal_category"]
          created_at?: string
          id?: number
          patient_id?: string | null
          refusal_script_used: string
          retention_until?: string
          tenant_id?: string | null
          trigger_text: string
          turn_id?: number | null
        }
        Update: {
          audio_segment_hash?: string | null
          audio_segment_url?: string | null
          call_id?: string | null
          category?: Database["public"]["Enums"]["refusal_category"]
          created_at?: string
          id?: number
          patient_id?: string | null
          refusal_script_used?: string
          retention_until?: string
          tenant_id?: string | null
          trigger_text?: string
          turn_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "refusal_log_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refusal_log_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refusal_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refusal_log_turn_id_fkey"
            columns: ["turn_id"]
            isOneToOne: false
            referencedRelation: "turns"
            referencedColumns: ["id"]
          },
        ]
      }
      retention_policies: {
        Row: {
          enabled: boolean
          grace_period_days: number
          last_run_at: string | null
          retention_column: string
          rows_purged_cumulative: number
          rows_purged_last_run: number | null
          table_name: string
        }
        Insert: {
          enabled?: boolean
          grace_period_days?: number
          last_run_at?: string | null
          retention_column: string
          rows_purged_cumulative?: number
          rows_purged_last_run?: number | null
          table_name: string
        }
        Update: {
          enabled?: boolean
          grace_period_days?: number
          last_run_at?: string | null
          retention_column?: string
          rows_purged_cumulative?: number
          rows_purged_last_run?: number | null
          table_name?: string
        }
        Relationships: []
      }
      soap_notes: {
        Row: {
          abdm_encounter_id: string | null
          abdm_pushed_at: string | null
          allopathic_meds_at_home: string[] | null
          assessment: string
          ayush_concurrent_meds: string[] | null
          call_id: string
          differential_list: Json | null
          disclaimer: string
          edit_distance: number | null
          esanjeevani_payload: Json | null
          esanjeevani_pushed_at: string | null
          esanjeevani_ref_id: string | null
          fhir_composition: Json | null
          follow_up_at: string | null
          follow_up_channel:
            | Database["public"]["Enums"]["dispatch_channel"]
            | null
          generated_at: string
          icd10_codes: string[] | null
          icd11_codes: string[] | null
          id: string
          immunization_status_json: Json | null
          investigations_advised: string[] | null
          lang: Database["public"]["Enums"]["encounter_lang"]
          mo_edited_text: string | null
          mo_signature_hash: string | null
          mo_signed_at: string | null
          mo_user_id: string | null
          objective: string
          original_text: string | null
          patient_id: string
          plan: string
          presumptive_screening_label: string
          retention_until: string
          subjective: string
          tenant_id: string
          triage_decision_id: string | null
          updated_at: string
          vitals_json: Json | null
          vitals_source: string | null
        }
        Insert: {
          abdm_encounter_id?: string | null
          abdm_pushed_at?: string | null
          allopathic_meds_at_home?: string[] | null
          assessment: string
          ayush_concurrent_meds?: string[] | null
          call_id: string
          differential_list?: Json | null
          disclaimer?: string
          edit_distance?: number | null
          esanjeevani_payload?: Json | null
          esanjeevani_pushed_at?: string | null
          esanjeevani_ref_id?: string | null
          fhir_composition?: Json | null
          follow_up_at?: string | null
          follow_up_channel?:
            | Database["public"]["Enums"]["dispatch_channel"]
            | null
          generated_at?: string
          icd10_codes?: string[] | null
          icd11_codes?: string[] | null
          id?: string
          immunization_status_json?: Json | null
          investigations_advised?: string[] | null
          lang: Database["public"]["Enums"]["encounter_lang"]
          mo_edited_text?: string | null
          mo_signature_hash?: string | null
          mo_signed_at?: string | null
          mo_user_id?: string | null
          objective: string
          original_text?: string | null
          patient_id: string
          plan: string
          presumptive_screening_label: string
          retention_until?: string
          subjective: string
          tenant_id: string
          triage_decision_id?: string | null
          updated_at?: string
          vitals_json?: Json | null
          vitals_source?: string | null
        }
        Update: {
          abdm_encounter_id?: string | null
          abdm_pushed_at?: string | null
          allopathic_meds_at_home?: string[] | null
          assessment?: string
          ayush_concurrent_meds?: string[] | null
          call_id?: string
          differential_list?: Json | null
          disclaimer?: string
          edit_distance?: number | null
          esanjeevani_payload?: Json | null
          esanjeevani_pushed_at?: string | null
          esanjeevani_ref_id?: string | null
          fhir_composition?: Json | null
          follow_up_at?: string | null
          follow_up_channel?:
            | Database["public"]["Enums"]["dispatch_channel"]
            | null
          generated_at?: string
          icd10_codes?: string[] | null
          icd11_codes?: string[] | null
          id?: string
          immunization_status_json?: Json | null
          investigations_advised?: string[] | null
          lang?: Database["public"]["Enums"]["encounter_lang"]
          mo_edited_text?: string | null
          mo_signature_hash?: string | null
          mo_signed_at?: string | null
          mo_user_id?: string | null
          objective?: string
          original_text?: string | null
          patient_id?: string
          plan?: string
          presumptive_screening_label?: string
          retention_until?: string
          subjective?: string
          tenant_id?: string
          triage_decision_id?: string | null
          updated_at?: string
          vitals_json?: Json | null
          vitals_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "soap_notes_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: true
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "soap_notes_mo_user_id_fkey"
            columns: ["mo_user_id"]
            isOneToOne: false
            referencedRelation: "mo_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "soap_notes_mo_user_id_fkey"
            columns: ["mo_user_id"]
            isOneToOne: false
            referencedRelation: "v_mo_users_with_indemnity"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "soap_notes_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "soap_notes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "soap_notes_triage_decision_id_fkey"
            columns: ["triage_decision_id"]
            isOneToOne: false
            referencedRelation: "triage_decisions"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          abdm_environment: Database["public"]["Enums"]["abdm_environment"]
          abdm_facility_id: string | null
          config_json: Json
          created_at: string
          data_processor_agreement_signed_at: string | null
          district_code: string | null
          dlt_entity_id: string | null
          dlt_pe_id: string | null
          dlt_registered_at: string | null
          dpdp_consent_template_id: string | null
          exotel_account_sid: string | null
          exotel_virtual_number: string | null
          gupshup_app_name: string | null
          gupshup_source_number: string | null
          id: string
          level: Database["public"]["Enums"]["tenant_level"]
          msg91_sender_id: string | null
          name: string
          ntep_unit_id: string | null
          outbound_paused_at: string | null
          outbound_paused_reason: string | null
          parent_id: string | null
          paused_at: string | null
          paused_reason: string | null
          pin_code: string | null
          preferred_language:
            | Database["public"]["Enums"]["encounter_lang"]
            | null
          rate_card_json: Json
          state_code: string | null
          tenant_path: unknown
          timezone: string
          updated_at: string
          vapi_org_id: string | null
        }
        Insert: {
          abdm_environment?: Database["public"]["Enums"]["abdm_environment"]
          abdm_facility_id?: string | null
          config_json?: Json
          created_at?: string
          data_processor_agreement_signed_at?: string | null
          district_code?: string | null
          dlt_entity_id?: string | null
          dlt_pe_id?: string | null
          dlt_registered_at?: string | null
          dpdp_consent_template_id?: string | null
          exotel_account_sid?: string | null
          exotel_virtual_number?: string | null
          gupshup_app_name?: string | null
          gupshup_source_number?: string | null
          id?: string
          level: Database["public"]["Enums"]["tenant_level"]
          msg91_sender_id?: string | null
          name: string
          ntep_unit_id?: string | null
          outbound_paused_at?: string | null
          outbound_paused_reason?: string | null
          parent_id?: string | null
          paused_at?: string | null
          paused_reason?: string | null
          pin_code?: string | null
          preferred_language?:
            | Database["public"]["Enums"]["encounter_lang"]
            | null
          rate_card_json?: Json
          state_code?: string | null
          tenant_path: unknown
          timezone?: string
          updated_at?: string
          vapi_org_id?: string | null
        }
        Update: {
          abdm_environment?: Database["public"]["Enums"]["abdm_environment"]
          abdm_facility_id?: string | null
          config_json?: Json
          created_at?: string
          data_processor_agreement_signed_at?: string | null
          district_code?: string | null
          dlt_entity_id?: string | null
          dlt_pe_id?: string | null
          dlt_registered_at?: string | null
          dpdp_consent_template_id?: string | null
          exotel_account_sid?: string | null
          exotel_virtual_number?: string | null
          gupshup_app_name?: string | null
          gupshup_source_number?: string | null
          id?: string
          level?: Database["public"]["Enums"]["tenant_level"]
          msg91_sender_id?: string | null
          name?: string
          ntep_unit_id?: string | null
          outbound_paused_at?: string | null
          outbound_paused_reason?: string | null
          parent_id?: string | null
          paused_at?: string | null
          paused_reason?: string | null
          pin_code?: string | null
          preferred_language?:
            | Database["public"]["Enums"]["encounter_lang"]
            | null
          rate_card_json?: Json
          state_code?: string | null
          tenant_path?: unknown
          timezone?: string
          updated_at?: string
          vapi_org_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenants_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      triage_audit_log: {
        Row: {
          actor_role: string | null
          actor_user_id: string | null
          event_type: string
          id: number
          new_band: Database["public"]["Enums"]["triage_band"] | null
          new_status: Database["public"]["Enums"]["mo_review_status"] | null
          notes: string | null
          occurred_at: string
          previous_band: Database["public"]["Enums"]["triage_band"] | null
          previous_status:
            | Database["public"]["Enums"]["mo_review_status"]
            | null
          sla_clock_state: string | null
          triage_decision_id: string
        }
        Insert: {
          actor_role?: string | null
          actor_user_id?: string | null
          event_type: string
          id?: number
          new_band?: Database["public"]["Enums"]["triage_band"] | null
          new_status?: Database["public"]["Enums"]["mo_review_status"] | null
          notes?: string | null
          occurred_at?: string
          previous_band?: Database["public"]["Enums"]["triage_band"] | null
          previous_status?:
            | Database["public"]["Enums"]["mo_review_status"]
            | null
          sla_clock_state?: string | null
          triage_decision_id: string
        }
        Update: {
          actor_role?: string | null
          actor_user_id?: string | null
          event_type?: string
          id?: number
          new_band?: Database["public"]["Enums"]["triage_band"] | null
          new_status?: Database["public"]["Enums"]["mo_review_status"] | null
          notes?: string | null
          occurred_at?: string
          previous_band?: Database["public"]["Enums"]["triage_band"] | null
          previous_status?:
            | Database["public"]["Enums"]["mo_review_status"]
            | null
          sla_clock_state?: string | null
          triage_decision_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "triage_audit_log_triage_decision_id_fkey"
            columns: ["triage_decision_id"]
            isOneToOne: false
            referencedRelation: "triage_decisions"
            referencedColumns: ["id"]
          },
        ]
      }
      triage_decisions: {
        Row: {
          band: Database["public"]["Enums"]["triage_band"]
          call_id: string
          callback_time_iso: string | null
          citations: Json | null
          classifier_model: string | null
          classifier_prompt_version: string | null
          confidence: number
          created_at: string
          escalation_count: number | null
          first_viewed_at: string | null
          id: string
          mo_acked_at: string | null
          mo_council_snapshot: string | null
          mo_license_valid_until_snapshot: string | null
          mo_name_snapshot: string | null
          mo_override_band: Database["public"]["Enums"]["triage_band"] | null
          mo_override_reason: string | null
          mo_reg_no_snapshot: string | null
          mo_review_status: Database["public"]["Enums"]["mo_review_status"]
          mo_reviewed_at: string | null
          mo_user_id: string | null
          needs_mo_review: boolean
          patient_id: string
          presumptive_label: string
          reasoning: string | null
          recommended_action: string | null
          red_flag_categories:
            | Database["public"]["Enums"]["red_flag_category"][]
            | null
          retention_until: string
          sla_target_minutes: number
          summary_en: string | null
          summary_native: string | null
          tenant_id: string
          time_to_override_seconds: number | null
          time_to_review_seconds: number | null
          updated_at: string
        }
        Insert: {
          band: Database["public"]["Enums"]["triage_band"]
          call_id: string
          callback_time_iso?: string | null
          citations?: Json | null
          classifier_model?: string | null
          classifier_prompt_version?: string | null
          confidence: number
          created_at?: string
          escalation_count?: number | null
          first_viewed_at?: string | null
          id?: string
          mo_acked_at?: string | null
          mo_council_snapshot?: string | null
          mo_license_valid_until_snapshot?: string | null
          mo_name_snapshot?: string | null
          mo_override_band?: Database["public"]["Enums"]["triage_band"] | null
          mo_override_reason?: string | null
          mo_reg_no_snapshot?: string | null
          mo_review_status?: Database["public"]["Enums"]["mo_review_status"]
          mo_reviewed_at?: string | null
          mo_user_id?: string | null
          needs_mo_review?: boolean
          patient_id: string
          presumptive_label: string
          reasoning?: string | null
          recommended_action?: string | null
          red_flag_categories?:
            | Database["public"]["Enums"]["red_flag_category"][]
            | null
          retention_until?: string
          sla_target_minutes?: number
          summary_en?: string | null
          summary_native?: string | null
          tenant_id: string
          time_to_override_seconds?: number | null
          time_to_review_seconds?: number | null
          updated_at?: string
        }
        Update: {
          band?: Database["public"]["Enums"]["triage_band"]
          call_id?: string
          callback_time_iso?: string | null
          citations?: Json | null
          classifier_model?: string | null
          classifier_prompt_version?: string | null
          confidence?: number
          created_at?: string
          escalation_count?: number | null
          first_viewed_at?: string | null
          id?: string
          mo_acked_at?: string | null
          mo_council_snapshot?: string | null
          mo_license_valid_until_snapshot?: string | null
          mo_name_snapshot?: string | null
          mo_override_band?: Database["public"]["Enums"]["triage_band"] | null
          mo_override_reason?: string | null
          mo_reg_no_snapshot?: string | null
          mo_review_status?: Database["public"]["Enums"]["mo_review_status"]
          mo_reviewed_at?: string | null
          mo_user_id?: string | null
          needs_mo_review?: boolean
          patient_id?: string
          presumptive_label?: string
          reasoning?: string | null
          recommended_action?: string | null
          red_flag_categories?:
            | Database["public"]["Enums"]["red_flag_category"][]
            | null
          retention_until?: string
          sla_target_minutes?: number
          summary_en?: string | null
          summary_native?: string | null
          tenant_id?: string
          time_to_override_seconds?: number | null
          time_to_review_seconds?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "triage_decisions_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: true
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "triage_decisions_mo_user_id_fkey"
            columns: ["mo_user_id"]
            isOneToOne: false
            referencedRelation: "mo_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "triage_decisions_mo_user_id_fkey"
            columns: ["mo_user_id"]
            isOneToOne: false
            referencedRelation: "v_mo_users_with_indemnity"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "triage_decisions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "triage_decisions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      turns: {
        Row: {
          audio_end_ms: number | null
          audio_segment_url: string | null
          audio_start_ms: number | null
          call_id: string
          confidence: number | null
          cost_inr: number | null
          created_at: string
          guardrail_trips: Json | null
          id: number
          lang: Database["public"]["Enums"]["encounter_lang"] | null
          llm_latency_ms: number | null
          model: string | null
          prompt_version: string | null
          provider: string | null
          retention_until: string
          role: string
          stt_confidence: number | null
          stt_latency_ms: number | null
          tokens_in: number | null
          tokens_out: number | null
          total_latency_ms: number | null
          transcript: string | null
          transcript_redacted: string | null
          tts_latency_ms: number | null
          turn_idx: number
        }
        Insert: {
          audio_end_ms?: number | null
          audio_segment_url?: string | null
          audio_start_ms?: number | null
          call_id: string
          confidence?: number | null
          cost_inr?: number | null
          created_at?: string
          guardrail_trips?: Json | null
          id?: number
          lang?: Database["public"]["Enums"]["encounter_lang"] | null
          llm_latency_ms?: number | null
          model?: string | null
          prompt_version?: string | null
          provider?: string | null
          retention_until?: string
          role: string
          stt_confidence?: number | null
          stt_latency_ms?: number | null
          tokens_in?: number | null
          tokens_out?: number | null
          total_latency_ms?: number | null
          transcript?: string | null
          transcript_redacted?: string | null
          tts_latency_ms?: number | null
          turn_idx: number
        }
        Update: {
          audio_end_ms?: number | null
          audio_segment_url?: string | null
          audio_start_ms?: number | null
          call_id?: string
          confidence?: number | null
          cost_inr?: number | null
          created_at?: string
          guardrail_trips?: Json | null
          id?: number
          lang?: Database["public"]["Enums"]["encounter_lang"] | null
          llm_latency_ms?: number | null
          model?: string | null
          prompt_version?: string | null
          provider?: string | null
          retention_until?: string
          role?: string
          stt_confidence?: number | null
          stt_latency_ms?: number | null
          tokens_in?: number | null
          tokens_out?: number | null
          total_latency_ms?: number | null
          transcript?: string | null
          transcript_redacted?: string | null
          tts_latency_ms?: number | null
          turn_idx?: number
        }
        Relationships: [
          {
            foreignKeyName: "turns_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
        ]
      }
      vapi_assistants: {
        Row: {
          created_at: string
          id: string
          last_synced_at: string | null
          metadata: Json | null
          model: string | null
          name: string | null
          prompt_version: string | null
          tenant_id: string | null
          transcription_provider: string | null
          vapi_assistant_id: string
          voice_id: string | null
          voice_provider: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          last_synced_at?: string | null
          metadata?: Json | null
          model?: string | null
          name?: string | null
          prompt_version?: string | null
          tenant_id?: string | null
          transcription_provider?: string | null
          vapi_assistant_id: string
          voice_id?: string | null
          voice_provider?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          last_synced_at?: string | null
          metadata?: Json | null
          model?: string | null
          name?: string | null
          prompt_version?: string | null
          tenant_id?: string | null
          transcription_provider?: string | null
          vapi_assistant_id?: string
          voice_id?: string | null
          voice_provider?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vapi_assistants_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vitals_observations: {
        Row: {
          blood_sugar_fasting_mgdl: number | null
          blood_sugar_random_mgdl: number | null
          call_id: string | null
          created_at: string
          device_model: string | null
          diastolic_bp_mmhg: number | null
          fundal_height_cm: number | null
          height_cm: number | null
          hemoglobin_gdl: number | null
          id: string
          muac_mm: number | null
          observed_at: string
          patient_id: string
          pregnancy_id: string | null
          pulse_bpm: number | null
          recorded_by_user_id: string | null
          respiratory_rate_per_min: number | null
          source: string
          spo2_pct: number | null
          systolic_bp_mmhg: number | null
          temperature_c: number | null
          weight_kg: number | null
        }
        Insert: {
          blood_sugar_fasting_mgdl?: number | null
          blood_sugar_random_mgdl?: number | null
          call_id?: string | null
          created_at?: string
          device_model?: string | null
          diastolic_bp_mmhg?: number | null
          fundal_height_cm?: number | null
          height_cm?: number | null
          hemoglobin_gdl?: number | null
          id?: string
          muac_mm?: number | null
          observed_at?: string
          patient_id: string
          pregnancy_id?: string | null
          pulse_bpm?: number | null
          recorded_by_user_id?: string | null
          respiratory_rate_per_min?: number | null
          source: string
          spo2_pct?: number | null
          systolic_bp_mmhg?: number | null
          temperature_c?: number | null
          weight_kg?: number | null
        }
        Update: {
          blood_sugar_fasting_mgdl?: number | null
          blood_sugar_random_mgdl?: number | null
          call_id?: string | null
          created_at?: string
          device_model?: string | null
          diastolic_bp_mmhg?: number | null
          fundal_height_cm?: number | null
          height_cm?: number | null
          hemoglobin_gdl?: number | null
          id?: string
          muac_mm?: number | null
          observed_at?: string
          patient_id?: string
          pregnancy_id?: string | null
          pulse_bpm?: number | null
          recorded_by_user_id?: string | null
          respiratory_rate_per_min?: number | null
          source?: string
          spo2_pct?: number | null
          systolic_bp_mmhg?: number | null
          temperature_c?: number | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_vitals_pregnancy"
            columns: ["pregnancy_id"]
            isOneToOne: false
            referencedRelation: "pregnancies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_vitals_pregnancy"
            columns: ["pregnancy_id"]
            isOneToOne: false
            referencedRelation: "v_pregnancy_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vitals_observations_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vitals_observations_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_mo_users_with_indemnity: {
        Row: {
          auth_user_id: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string | null
          indemnity_active: boolean | null
          mci_registration_number: string | null
          nmc_hpr_id: string | null
          on_call: boolean | null
          phone_e164: string | null
          pi_insurance_expires_at: string | null
          pi_insurance_policy_number: string | null
          pi_insurance_provider: string | null
          qualifications: string[] | null
          red_flag_pager_phone: string | null
          registration_status: Database["public"]["Enums"]["rmp_status"] | null
          registration_verified_at: string | null
          specialty: string | null
          state_medical_council: string | null
          states_authorised: string[] | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string | null
          indemnity_active?: never
          mci_registration_number?: string | null
          nmc_hpr_id?: string | null
          on_call?: boolean | null
          phone_e164?: string | null
          pi_insurance_expires_at?: string | null
          pi_insurance_policy_number?: string | null
          pi_insurance_provider?: string | null
          qualifications?: string[] | null
          red_flag_pager_phone?: string | null
          registration_status?: Database["public"]["Enums"]["rmp_status"] | null
          registration_verified_at?: string | null
          specialty?: string | null
          state_medical_council?: string | null
          states_authorised?: string[] | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string | null
          indemnity_active?: never
          mci_registration_number?: string | null
          nmc_hpr_id?: string | null
          on_call?: boolean | null
          phone_e164?: string | null
          pi_insurance_expires_at?: string | null
          pi_insurance_policy_number?: string | null
          pi_insurance_provider?: string | null
          qualifications?: string[] | null
          red_flag_pager_phone?: string | null
          registration_status?: Database["public"]["Enums"]["rmp_status"] | null
          registration_verified_at?: string | null
          specialty?: string | null
          state_medical_council?: string | null
          states_authorised?: string[] | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mo_users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_pregnancy_summary: {
        Row: {
          abortions: number | null
          blood_group_typed: Database["public"]["Enums"]["blood_group"] | null
          closed_at: string | null
          edd_date: string | null
          gestational_age_weeks: number | null
          gravida: number | null
          high_risk_flags: string[] | null
          hrp_flags: Database["public"]["Enums"]["pregnancy_hrp_flag"][] | null
          id: string | null
          ifa_tablets_dispensed: number | null
          living: number | null
          lmp_date: string | null
          outcome: string | null
          outcome_date: string | null
          para: number | null
          patient_id: string | null
          registered_at: string | null
          registered_under_jsy: boolean | null
          registered_under_pmmvy: boolean | null
          serology_hbsag: Database["public"]["Enums"]["serology_status"] | null
          serology_hcv: Database["public"]["Enums"]["serology_status"] | null
          serology_hiv: Database["public"]["Enums"]["serology_status"] | null
          serology_syphilis:
            | Database["public"]["Enums"]["serology_status"]
            | null
          serology_tested_at: string | null
          tenant_id: string | null
          tt_doses_given: number | null
        }
        Insert: {
          abortions?: number | null
          blood_group_typed?: Database["public"]["Enums"]["blood_group"] | null
          closed_at?: string | null
          edd_date?: string | null
          gestational_age_weeks?: never
          gravida?: number | null
          high_risk_flags?: string[] | null
          hrp_flags?: Database["public"]["Enums"]["pregnancy_hrp_flag"][] | null
          id?: string | null
          ifa_tablets_dispensed?: number | null
          living?: number | null
          lmp_date?: string | null
          outcome?: string | null
          outcome_date?: string | null
          para?: number | null
          patient_id?: string | null
          registered_at?: string | null
          registered_under_jsy?: boolean | null
          registered_under_pmmvy?: boolean | null
          serology_hbsag?: Database["public"]["Enums"]["serology_status"] | null
          serology_hcv?: Database["public"]["Enums"]["serology_status"] | null
          serology_hiv?: Database["public"]["Enums"]["serology_status"] | null
          serology_syphilis?:
            | Database["public"]["Enums"]["serology_status"]
            | null
          serology_tested_at?: string | null
          tenant_id?: string | null
          tt_doses_given?: number | null
        }
        Update: {
          abortions?: number | null
          blood_group_typed?: Database["public"]["Enums"]["blood_group"] | null
          closed_at?: string | null
          edd_date?: string | null
          gestational_age_weeks?: never
          gravida?: number | null
          high_risk_flags?: string[] | null
          hrp_flags?: Database["public"]["Enums"]["pregnancy_hrp_flag"][] | null
          id?: string | null
          ifa_tablets_dispensed?: number | null
          living?: number | null
          lmp_date?: string | null
          outcome?: string | null
          outcome_date?: string | null
          para?: number | null
          patient_id?: string | null
          registered_at?: string | null
          registered_under_jsy?: boolean | null
          registered_under_pmmvy?: boolean | null
          serology_hbsag?: Database["public"]["Enums"]["serology_status"] | null
          serology_hcv?: Database["public"]["Enums"]["serology_status"] | null
          serology_hiv?: Database["public"]["Enums"]["serology_status"] | null
          serology_syphilis?:
            | Database["public"]["Enums"]["serology_status"]
            | null
          serology_tested_at?: string | null
          tenant_id?: string | null
          tt_doses_given?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pregnancies_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pregnancies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_red_flag_lookup: {
        Row: {
          category: Database["public"]["Enums"]["red_flag_category"] | null
          detection_method: string | null
          lang: Database["public"]["Enums"]["encounter_lang"] | null
          min_confidence: number | null
          phrase: string | null
          severity_score: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_user_tenant_id: { Args: { uid: string }; Returns: string }
      is_ancestor_or_self: {
        Args: { ancestor: string; descendant: string }
        Returns: boolean
      }
      is_ancestor_tenant: {
        Args: { ancestor: string; descendant: string }
        Returns: boolean
      }
      log_phi_access: {
        Args: {
          patient_id: string
          purpose_code: Database["public"]["Enums"]["phi_purpose"]
          request_context?: Json
          row_id: string
          table_name: string
        }
        Returns: undefined
      }
      next_turn_idx: { Args: { p_call_id: string }; Returns: number }
      purge_expired_rows: {
        Args: { p_dry_run?: boolean }
        Returns: {
          rows_purged: number
          table_name: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      text2ltree: { Args: { "": string }; Returns: unknown }
    }
    Enums: {
      abdm_environment: "sandbox" | "staging" | "production"
      ae_described_by_role:
        | "MO"
        | "ASHA"
        | "patient_family"
        | "auto_detected"
        | "external_audit"
      anc_contact_kind:
        | "anc_1_registration"
        | "anc_2"
        | "anc_3_anomaly_scan"
        | "anc_4"
        | "anc_5_tt_ifa"
        | "anc_6"
        | "anc_7_birth_prep"
        | "anc_8"
        | "postpartum_6w"
      anc_danger_sign_code:
        | "severe_headache"
        | "blurred_vision"
        | "swelling_face_hands"
        | "reduced_fetal_movement"
        | "vaginal_bleeding"
        | "leaking_pv"
        | "fever"
        | "severe_abdo_pain"
        | "convulsions"
        | "severe_pallor"
        | "breathlessness"
      anc_sign_status: "absent" | "present" | "unknown"
      blood_group:
        | "A_pos"
        | "A_neg"
        | "B_pos"
        | "B_neg"
        | "AB_pos"
        | "AB_neg"
        | "O_pos"
        | "O_neg"
        | "unknown"
      breach_scope_class:
        | "confidentiality"
        | "integrity"
        | "availability"
        | "combined"
      call_outcome:
        | "completed"
        | "voicemail"
        | "no_pickup"
        | "tech_error"
        | "patient_disconnected"
        | "consent_denied"
        | "abandoned"
        | "in_progress"
      cohort_match_type:
        | "icd11_prefix"
        | "dots_overdue"
        | "anc_missed"
        | "htn_overdue"
        | "ncd_screening_lapse"
        | "new_patient"
        | "default"
      consent_scope:
        | "screening_call"
        | "data_processing"
        | "audio_recording"
        | "abdm_link"
        | "mo_share"
        | "whatsapp_followup"
        | "sms_followup"
      consent_status: "pending" | "granted" | "denied" | "revoked" | "expired"
      dispatch_channel: "voice" | "whatsapp" | "sms"
      dispatch_event_type:
        | "voice_screening"
        | "voice_followup"
        | "voice_callback"
        | "dots_adherence"
        | "anc_reminder"
        | "anc_contact_due"
        | "medication_reminder"
        | "cohort_outreach"
        | "mo_handoff_red"
        | "mo_handoff_amber"
        | "vaani_didi_signoff"
      dispatch_status:
        | "pending"
        | "claimed"
        | "dispatched"
        | "in_progress"
        | "call_completed"
        | "completed"
        | "failed"
        | "cancelled"
        | "paused"
      dispatch_trigger:
        | "inbound_call"
        | "scanner"
        | "manual"
        | "webhook"
        | "cron"
        | "mo_action"
      dots_phase: "intensive" | "continuation" | "extended"
      dots_regimen_kind:
        | "new_DSTB"
        | "previously_treated_DSTB"
        | "MDR_TB"
        | "PreXDR"
        | "XDR"
        | "HR_TB"
      dots_regimen_status:
        | "active"
        | "completed"
        | "defaulted"
        | "lost_to_followup"
        | "died"
      dsr_status:
        | "received"
        | "verified"
        | "in_progress"
        | "fulfilled"
        | "rejected"
        | "partially_fulfilled"
      dsr_type:
        | "access"
        | "correction"
        | "erasure"
        | "nominee"
        | "grievance"
        | "portability"
      encounter_lang:
        | "hi"
        | "ta"
        | "te"
        | "kn"
        | "bn"
        | "mr"
        | "gu"
        | "pa"
        | "or"
        | "ml"
        | "en"
      incident_severity: "low" | "medium" | "high" | "critical"
      llm_region:
        | "ap-south-1"
        | "asia-south1"
        | "in-mumbai"
        | "us-east-1"
        | "eu-west-1"
        | "us-east-2"
        | "eu-central-1"
        | "unknown"
      mh_instrument: "PHQ-2" | "PHQ-9" | "GAD-2" | "GAD-7" | "SRQ-20"
      mh_severity:
        | "minimal"
        | "mild"
        | "moderate"
        | "severe"
        | "ideation_passive"
        | "ideation_active"
        | "plan"
        | "attempt_recent"
        | "attempt_in_progress"
      mo_review_status:
        | "pending"
        | "approved"
        | "edited"
        | "escalated"
        | "overridden"
        | "returned_for_more_info"
      outbound_status:
        | "queued"
        | "sent"
        | "delivered"
        | "read"
        | "failed"
        | "bounced"
      peds_nutrition_class: "SAM" | "MAM" | "normal"
      peds_pneumonia_class: "severe" | "non_severe" | "no_pneumonia_cough_cold"
      phi_purpose:
        | "CARE"
        | "AUDIT"
        | "CONSENT_FULFILMENT"
        | "GRIEVANCE"
        | "PUBLIC_HEALTH_REPORT"
        | "BILLING"
        | "RESEARCH_DEIDENTIFIED"
      pilot_ae_type:
        | "missed_red_flag"
        | "wrong_band"
        | "delayed_mo_review"
        | "unsafe_advice"
        | "wrong_drug_suggested"
        | "consent_breach"
        | "pii_leak"
        | "death_within_72h"
        | "hospitalisation_within_72h"
        | "near_miss"
      pregnancy_hrp_flag:
        | "prev_lscs"
        | "prev_pph"
        | "hypertension_chronic"
        | "GDM"
        | "anemia_severe"
        | "grand_multipara"
        | "teenage_pregnancy"
        | "age_gte_35"
        | "prev_stillbirth"
        | "rh_negative"
        | "heart_disease"
        | "TB_concurrent"
        | "epilepsy"
        | "preeclampsia_history"
      red_flag_category:
        | "cardiac"
        | "respiratory"
        | "neuro"
        | "obstetric"
        | "peds_danger"
        | "trauma"
        | "sepsis"
        | "mental_health"
        | "envenomation"
        | "burns"
        | "gi_acute"
        | "metabolic_acute"
        | "dehydration_severe"
        | "other"
        | "stroke_befast"
        | "preeclampsia_eclampsia"
        | "rabies_exposure"
        | "hemoptysis"
        | "fever_high_risk"
      red_flag_source: "rule" | "llm" | "mo_flag" | "uncertainty_default"
      refusal_category:
        | "pcpndt_foetal_sex"
        | "mhca_suicidal_ideation"
        | "pocso_csa_disclosure"
        | "drug_prescription_attempt"
        | "diagnosis_attempt"
        | "cross_state_rx"
        | "off_topic"
      rmp_status: "active" | "suspended" | "expired" | "pending_verification"
      rx_drug_class: "OTC" | "Schedule_H" | "Schedule_H1" | "Schedule_X"
      rx_status: "drafted" | "mo_signed" | "dispensed" | "revoked"
      serology_status: "reactive" | "non_reactive" | "not_done" | "unknown"
      tenant_level:
        | "state_cell"
        | "district_office"
        | "chc"
        | "phc"
        | "subcentre"
        | "demo"
      triage_band: "RED" | "AMBER" | "GREEN"
      withdrawal_channel:
        | "ivr"
        | "whatsapp"
        | "sms_stop"
        | "asha_in_person"
        | "grievance_email"
        | "web_portal"
      withdrawal_status:
        | "received"
        | "verified"
        | "processing"
        | "completed"
        | "rejected"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      abdm_environment: ["sandbox", "staging", "production"],
      ae_described_by_role: [
        "MO",
        "ASHA",
        "patient_family",
        "auto_detected",
        "external_audit",
      ],
      anc_contact_kind: [
        "anc_1_registration",
        "anc_2",
        "anc_3_anomaly_scan",
        "anc_4",
        "anc_5_tt_ifa",
        "anc_6",
        "anc_7_birth_prep",
        "anc_8",
        "postpartum_6w",
      ],
      anc_danger_sign_code: [
        "severe_headache",
        "blurred_vision",
        "swelling_face_hands",
        "reduced_fetal_movement",
        "vaginal_bleeding",
        "leaking_pv",
        "fever",
        "severe_abdo_pain",
        "convulsions",
        "severe_pallor",
        "breathlessness",
      ],
      anc_sign_status: ["absent", "present", "unknown"],
      blood_group: [
        "A_pos",
        "A_neg",
        "B_pos",
        "B_neg",
        "AB_pos",
        "AB_neg",
        "O_pos",
        "O_neg",
        "unknown",
      ],
      breach_scope_class: [
        "confidentiality",
        "integrity",
        "availability",
        "combined",
      ],
      call_outcome: [
        "completed",
        "voicemail",
        "no_pickup",
        "tech_error",
        "patient_disconnected",
        "consent_denied",
        "abandoned",
        "in_progress",
      ],
      cohort_match_type: [
        "icd11_prefix",
        "dots_overdue",
        "anc_missed",
        "htn_overdue",
        "ncd_screening_lapse",
        "new_patient",
        "default",
      ],
      consent_scope: [
        "screening_call",
        "data_processing",
        "audio_recording",
        "abdm_link",
        "mo_share",
        "whatsapp_followup",
        "sms_followup",
      ],
      consent_status: ["pending", "granted", "denied", "revoked", "expired"],
      dispatch_channel: ["voice", "whatsapp", "sms"],
      dispatch_event_type: [
        "voice_screening",
        "voice_followup",
        "voice_callback",
        "dots_adherence",
        "anc_reminder",
        "anc_contact_due",
        "medication_reminder",
        "cohort_outreach",
        "mo_handoff_red",
        "mo_handoff_amber",
        "vaani_didi_signoff",
      ],
      dispatch_status: [
        "pending",
        "claimed",
        "dispatched",
        "in_progress",
        "call_completed",
        "completed",
        "failed",
        "cancelled",
        "paused",
      ],
      dispatch_trigger: [
        "inbound_call",
        "scanner",
        "manual",
        "webhook",
        "cron",
        "mo_action",
      ],
      dots_phase: ["intensive", "continuation", "extended"],
      dots_regimen_kind: [
        "new_DSTB",
        "previously_treated_DSTB",
        "MDR_TB",
        "PreXDR",
        "XDR",
        "HR_TB",
      ],
      dots_regimen_status: [
        "active",
        "completed",
        "defaulted",
        "lost_to_followup",
        "died",
      ],
      dsr_status: [
        "received",
        "verified",
        "in_progress",
        "fulfilled",
        "rejected",
        "partially_fulfilled",
      ],
      dsr_type: [
        "access",
        "correction",
        "erasure",
        "nominee",
        "grievance",
        "portability",
      ],
      encounter_lang: [
        "hi",
        "ta",
        "te",
        "kn",
        "bn",
        "mr",
        "gu",
        "pa",
        "or",
        "ml",
        "en",
      ],
      incident_severity: ["low", "medium", "high", "critical"],
      llm_region: [
        "ap-south-1",
        "asia-south1",
        "in-mumbai",
        "us-east-1",
        "eu-west-1",
        "us-east-2",
        "eu-central-1",
        "unknown",
      ],
      mh_instrument: ["PHQ-2", "PHQ-9", "GAD-2", "GAD-7", "SRQ-20"],
      mh_severity: [
        "minimal",
        "mild",
        "moderate",
        "severe",
        "ideation_passive",
        "ideation_active",
        "plan",
        "attempt_recent",
        "attempt_in_progress",
      ],
      mo_review_status: [
        "pending",
        "approved",
        "edited",
        "escalated",
        "overridden",
        "returned_for_more_info",
      ],
      outbound_status: [
        "queued",
        "sent",
        "delivered",
        "read",
        "failed",
        "bounced",
      ],
      peds_nutrition_class: ["SAM", "MAM", "normal"],
      peds_pneumonia_class: ["severe", "non_severe", "no_pneumonia_cough_cold"],
      phi_purpose: [
        "CARE",
        "AUDIT",
        "CONSENT_FULFILMENT",
        "GRIEVANCE",
        "PUBLIC_HEALTH_REPORT",
        "BILLING",
        "RESEARCH_DEIDENTIFIED",
      ],
      pilot_ae_type: [
        "missed_red_flag",
        "wrong_band",
        "delayed_mo_review",
        "unsafe_advice",
        "wrong_drug_suggested",
        "consent_breach",
        "pii_leak",
        "death_within_72h",
        "hospitalisation_within_72h",
        "near_miss",
      ],
      pregnancy_hrp_flag: [
        "prev_lscs",
        "prev_pph",
        "hypertension_chronic",
        "GDM",
        "anemia_severe",
        "grand_multipara",
        "teenage_pregnancy",
        "age_gte_35",
        "prev_stillbirth",
        "rh_negative",
        "heart_disease",
        "TB_concurrent",
        "epilepsy",
        "preeclampsia_history",
      ],
      red_flag_category: [
        "cardiac",
        "respiratory",
        "neuro",
        "obstetric",
        "peds_danger",
        "trauma",
        "sepsis",
        "mental_health",
        "envenomation",
        "burns",
        "gi_acute",
        "metabolic_acute",
        "dehydration_severe",
        "other",
        "stroke_befast",
        "preeclampsia_eclampsia",
        "rabies_exposure",
        "hemoptysis",
        "fever_high_risk",
      ],
      red_flag_source: ["rule", "llm", "mo_flag", "uncertainty_default"],
      refusal_category: [
        "pcpndt_foetal_sex",
        "mhca_suicidal_ideation",
        "pocso_csa_disclosure",
        "drug_prescription_attempt",
        "diagnosis_attempt",
        "cross_state_rx",
        "off_topic",
      ],
      rmp_status: ["active", "suspended", "expired", "pending_verification"],
      rx_drug_class: ["OTC", "Schedule_H", "Schedule_H1", "Schedule_X"],
      rx_status: ["drafted", "mo_signed", "dispensed", "revoked"],
      serology_status: ["reactive", "non_reactive", "not_done", "unknown"],
      tenant_level: [
        "state_cell",
        "district_office",
        "chc",
        "phc",
        "subcentre",
        "demo",
      ],
      triage_band: ["RED", "AMBER", "GREEN"],
      withdrawal_channel: [
        "ivr",
        "whatsapp",
        "sms_stop",
        "asha_in_person",
        "grievance_email",
        "web_portal",
      ],
      withdrawal_status: [
        "received",
        "verified",
        "processing",
        "completed",
        "rejected",
      ],
    },
  },
} as const

