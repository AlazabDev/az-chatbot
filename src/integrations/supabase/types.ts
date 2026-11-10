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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      admin_auth: {
        Row: {
          created_at: string
          id: number
          password_hash: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: number
          password_hash?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: number
          password_hash?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      api_consumers: {
        Row: {
          allowed_origins: string[]
          api_key: string | null
          api_key_hash: string | null
          api_key_last4: string | null
          branch_id: string | null
          channel: string
          company_id: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          rate_limit_per_minute: number
          updated_at: string
        }
        Insert: {
          allowed_origins?: string[]
          api_key?: string | null
          api_key_hash?: string | null
          api_key_last4?: string | null
          branch_id?: string | null
          channel?: string
          company_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          rate_limit_per_minute?: number
          updated_at?: string
        }
        Update: {
          allowed_origins?: string[]
          api_key?: string | null
          api_key_hash?: string | null
          api_key_last4?: string | null
          branch_id?: string | null
          channel?: string
          company_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          rate_limit_per_minute?: number
          updated_at?: string
        }
        Relationships: []
      }
      api_gateway_logs: {
        Row: {
          action: string | null
          consumer_id: string | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          id: string
          ip_address: unknown
          request_payload: Json | null
          response_payload: Json | null
          route: string
          status_code: number | null
          success: boolean | null
          user_agent: string | null
        }
        Insert: {
          action?: string | null
          consumer_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          ip_address?: unknown
          request_payload?: Json | null
          response_payload?: Json | null
          route: string
          status_code?: number | null
          success?: boolean | null
          user_agent?: string | null
        }
        Update: {
          action?: string | null
          consumer_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          ip_address?: unknown
          request_payload?: Json | null
          response_payload?: Json | null
          route?: string
          status_code?: number | null
          success?: boolean | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_gateway_logs_consumer_id_fkey"
            columns: ["consumer_id"]
            isOneToOne: false
            referencedRelation: "api_consumers"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          actor_type: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json
          new_values: Json | null
          old_values: Json | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json
          new_values?: Json | null
          old_values?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json
          new_values?: Json | null
          old_values?: Json | null
        }
        Relationships: []
      }
      bot_agent_training_examples: {
        Row: {
          agent_id: string
          answer: string
          created_at: string
          created_by: string | null
          id: string
          question: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          answer: string
          created_at?: string
          created_by?: string | null
          id?: string
          question: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          answer?: string
          created_at?: string
          created_by?: string | null
          id?: string
          question?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_agent_training_examples_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "bot_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_agents: {
        Row: {
          agent_name: string | null
          agent_version: string
          created_at: string
          deployment: string | null
          description: string | null
          id: string
          is_active: boolean
          is_default: boolean
          max_tokens: number
          name: string
          provider: string
          public_access: boolean
          sort_order: number
          system_prompt: string
          temperature: number
          updated_at: string
        }
        Insert: {
          agent_name?: string | null
          agent_version?: string
          created_at?: string
          deployment?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          max_tokens?: number
          name: string
          provider?: string
          public_access?: boolean
          sort_order?: number
          system_prompt?: string
          temperature?: number
          updated_at?: string
        }
        Update: {
          agent_name?: string | null
          agent_version?: string
          created_at?: string
          deployment?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          max_tokens?: number
          name?: string
          provider?: string
          public_access?: boolean
          sort_order?: number
          system_prompt?: string
          temperature?: number
          updated_at?: string
        }
        Relationships: []
      }
      bot_sessions: {
        Row: {
          client_email: string | null
          client_name: string | null
          client_phone: string | null
          context: Json
          created_at: string
          expires_at: string
          id: string
          latitude: number | null
          location: string | null
          longitude: number | null
          owner_id: string | null
          preferred_branch_id: string | null
          session_id: string
          updated_at: string
        }
        Insert: {
          client_email?: string | null
          client_name?: string | null
          client_phone?: string | null
          context?: Json
          created_at?: string
          expires_at?: string
          id?: string
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          owner_id?: string | null
          preferred_branch_id?: string | null
          session_id: string
          updated_at?: string
        }
        Update: {
          client_email?: string | null
          client_name?: string | null
          client_phone?: string | null
          context?: Json
          created_at?: string
          expires_at?: string
          id?: string
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          owner_id?: string | null
          preferred_branch_id?: string | null
          session_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      bot_settings: {
        Row: {
          ai_model: string
          allow_human_takeover: boolean
          auto_speak: boolean
          avatar_url: string
          bot_name: string
          bubble_style: string
          business_hours: Json
          business_hours_enabled: boolean
          created_at: string
          engine: string
          header_subtitle: string
          id: number
          offline_message: string
          position: string
          primary_color: string
          quick_replies: Json
          rasa_timeout_ms: number
          rasa_url: string
          show_branding: boolean
          sound_enabled: boolean
          system_prompt: string
          updated_at: string
          voice_enabled: boolean
          voice_name: string
          welcome_message: string
        }
        Insert: {
          ai_model?: string
          allow_human_takeover?: boolean
          auto_speak?: boolean
          avatar_url?: string
          bot_name?: string
          bubble_style?: string
          business_hours?: Json
          business_hours_enabled?: boolean
          created_at?: string
          engine?: string
          header_subtitle?: string
          id: number
          offline_message?: string
          position?: string
          primary_color?: string
          quick_replies?: Json
          rasa_timeout_ms?: number
          rasa_url?: string
          show_branding?: boolean
          sound_enabled?: boolean
          system_prompt?: string
          updated_at?: string
          voice_enabled?: boolean
          voice_name?: string
          welcome_message?: string
        }
        Update: {
          ai_model?: string
          allow_human_takeover?: boolean
          auto_speak?: boolean
          avatar_url?: string
          bot_name?: string
          bubble_style?: string
          business_hours?: Json
          business_hours_enabled?: boolean
          created_at?: string
          engine?: string
          header_subtitle?: string
          id?: number
          offline_message?: string
          position?: string
          primary_color?: string
          quick_replies?: Json
          rasa_timeout_ms?: number
          rasa_url?: string
          show_branding?: boolean
          sound_enabled?: boolean
          system_prompt?: string
          updated_at?: string
          voice_enabled?: boolean
          voice_name?: string
          welcome_message?: string
        }
        Relationships: []
      }
      branches: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          id: string
          is_active: boolean
          latitude: number | null
          longitude: number | null
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      brands: {
        Row: {
          ai_engine: string
          allowed_origins: string[]
          bot_persona: string
          created_at: string
          domains: string[]
          id: string
          key: string
          name: string
          system_prompt: string
          updated_at: string
        }
        Insert: {
          ai_engine?: string
          allowed_origins?: string[]
          bot_persona?: string
          created_at?: string
          domains?: string[]
          id?: string
          key: string
          name: string
          system_prompt: string
          updated_at?: string
        }
        Update: {
          ai_engine?: string
          allowed_origins?: string[]
          bot_persona?: string
          created_at?: string
          domains?: string[]
          id?: string
          key?: string
          name?: string
          system_prompt?: string
          updated_at?: string
        }
        Relationships: []
      }
      chat_gateway_quota: {
        Row: {
          bucket_key: string
          request_count: number
          window_start: string
        }
        Insert: {
          bucket_key: string
          request_count?: number
          window_start: string
        }
        Update: {
          bucket_key?: string
          request_count?: number
          window_start?: string
        }
        Relationships: []
      }
      chat_requests: {
        Row: {
          agent_snapshot: Json | null
          conversation_id: string
          created_at: string
          error_code: string | null
          finished_at: string | null
          id: string
          input_hash: string
          response: Json | null
          status: string
        }
        Insert: {
          agent_snapshot?: Json | null
          conversation_id: string
          created_at?: string
          error_code?: string | null
          finished_at?: string | null
          id: string
          input_hash: string
          response?: Json | null
          status?: string
        }
        Update: {
          agent_snapshot?: Json | null
          conversation_id?: string
          created_at?: string
          error_code?: string | null
          finished_at?: string | null
          id?: string
          input_hash?: string
          response?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_requests_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      cloud_storage_providers: {
        Row: {
          bucket_name: string
          config: Json | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          provider_type: string
          region: string | null
          updated_at: string
        }
        Insert: {
          bucket_name: string
          config?: Json | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          provider_type: string
          region?: string | null
          updated_at?: string
        }
        Update: {
          bucket_name?: string
          config?: Json | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          provider_type?: string
          region?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          admin_notes: string | null
          agent_id: string | null
          assigned_admin: string | null
          created_at: string
          human_takeover: boolean
          id: string
          last_message_at: string
          message_count: number
          metadata: Json
          owner_id: string | null
          session_id: string
          status: string
          updated_at: string
          visitor_email: string | null
          visitor_name: string | null
        }
        Insert: {
          admin_notes?: string | null
          agent_id?: string | null
          assigned_admin?: string | null
          created_at?: string
          human_takeover?: boolean
          id?: string
          last_message_at?: string
          message_count?: number
          metadata?: Json
          owner_id?: string | null
          session_id: string
          status?: string
          updated_at?: string
          visitor_email?: string | null
          visitor_name?: string | null
        }
        Update: {
          admin_notes?: string | null
          agent_id?: string | null
          assigned_admin?: string | null
          created_at?: string
          human_takeover?: boolean
          id?: string
          last_message_at?: string
          message_count?: number
          metadata?: Json
          owner_id?: string | null
          session_id?: string
          status?: string
          updated_at?: string
          visitor_email?: string | null
          visitor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "bot_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      daftra_transactions: {
        Row: {
          amount: number
          category: string | null
          created_at: string
          created_by: string | null
          daftra_reference: string | null
          description: string
          file_id: string | null
          id: string
          project_id: string
          status: string | null
          transaction_date: string
          transaction_type: string
        }
        Insert: {
          amount: number
          category?: string | null
          created_at?: string
          created_by?: string | null
          daftra_reference?: string | null
          description: string
          file_id?: string | null
          id?: string
          project_id: string
          status?: string | null
          transaction_date?: string
          transaction_type: string
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string
          created_by?: string | null
          daftra_reference?: string | null
          description?: string
          file_id?: string | null
          id?: string
          project_id?: string
          status?: string | null
          transaction_date?: string
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "daftra_transactions_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "project_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daftra_transactions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      escalation_tickets: {
        Row: {
          brand: string | null
          created_at: string
          description: string | null
          id: string
          reason: string | null
          sender_id: string | null
          status: string | null
        }
        Insert: {
          brand?: string | null
          created_at?: string
          description?: string | null
          id?: string
          reason?: string | null
          sender_id?: string | null
          status?: string | null
        }
        Update: {
          brand?: string | null
          created_at?: string
          description?: string | null
          id?: string
          reason?: string | null
          sender_id?: string | null
          status?: string | null
        }
        Relationships: []
      }
      events: {
        Row: {
          action_name: string | null
          data: string | null
          id: number
          intent_name: string | null
          sender_id: string
          timestamp: number | null
          type_name: string
        }
        Insert: {
          action_name?: string | null
          data?: string | null
          id?: number
          intent_name?: string | null
          sender_id: string
          timestamp?: number | null
          type_name: string
        }
        Update: {
          action_name?: string | null
          data?: string | null
          id?: number
          intent_name?: string | null
          sender_id?: string
          timestamp?: number | null
          type_name?: string
        }
        Relationships: []
      }
      feedback: {
        Row: {
          brand: string | null
          created_at: string
          feedback_text: string | null
          id: string
          rating: number | null
          sender_id: string | null
          service: string | null
        }
        Insert: {
          brand?: string | null
          created_at?: string
          feedback_text?: string | null
          id?: string
          rating?: number | null
          sender_id?: string | null
          service?: string | null
        }
        Update: {
          brand?: string | null
          created_at?: string
          feedback_text?: string | null
          id?: string
          rating?: number | null
          sender_id?: string | null
          service?: string | null
        }
        Relationships: []
      }
      file_comments: {
        Row: {
          content: string
          created_at: string
          file_id: string
          id: string
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          content: string
          created_at?: string
          file_id: string
          id?: string
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          file_id?: string
          id?: string
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "file_comments_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "project_files"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          config: Json
          created_at: string
          enabled: boolean
          events: Json
          id: string
          name: string
          type: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          enabled?: boolean
          events?: Json
          id?: string
          name: string
          type: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          enabled?: boolean
          events?: Json
          id?: string
          name?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      kb_collections: {
        Row: {
          created_at: string
          description: string | null
          document_count: number | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          document_count?: number | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          document_count?: number | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      kb_documents: {
        Row: {
          collection_id: string | null
          created_at: string
          id: string
          metadata: Json | null
          name: string
          status: string | null
          type: string | null
        }
        Insert: {
          collection_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          name: string
          status?: string | null
          type?: string | null
        }
        Update: {
          collection_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          name?: string
          status?: string | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kb_documents_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "kb_collections"
            referencedColumns: ["id"]
          },
        ]
      }
      laban_orders: {
        Row: {
          branch: string | null
          client_name: string | null
          created_at: string
          description: string | null
          dims: string | null
          id: string
          material: string | null
          notes: string | null
          order_number: string | null
          phone: string | null
          qty: number | null
          status: string | null
          unit_type: string | null
          updated_at: string | null
        }
        Insert: {
          branch?: string | null
          client_name?: string | null
          created_at?: string
          description?: string | null
          dims?: string | null
          id?: string
          material?: string | null
          notes?: string | null
          order_number?: string | null
          phone?: string | null
          qty?: number | null
          status?: string | null
          unit_type?: string | null
          updated_at?: string | null
        }
        Update: {
          branch?: string | null
          client_name?: string | null
          created_at?: string
          description?: string | null
          dims?: string | null
          id?: string
          material?: string | null
          notes?: string | null
          order_number?: string | null
          phone?: string | null
          qty?: number | null
          status?: string | null
          unit_type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      leads: {
        Row: {
          brand: string | null
          created_at: string
          id: string
          location: string | null
          metadata: Json
          name: string | null
          phone: string | null
          sender_id: string | null
          service_type: string | null
          source: string | null
          status: string | null
        }
        Insert: {
          brand?: string | null
          created_at?: string
          id?: string
          location?: string | null
          metadata?: Json
          name?: string | null
          phone?: string | null
          sender_id?: string | null
          service_type?: string | null
          source?: string | null
          status?: string | null
        }
        Update: {
          brand?: string | null
          created_at?: string
          id?: string
          location?: string | null
          metadata?: Json
          name?: string | null
          phone?: string | null
          sender_id?: string | null
          service_type?: string | null
          source?: string | null
          status?: string | null
        }
        Relationships: []
      }
      maintenance_categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          key: string
          label_ar: string
          label_en: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          key: string
          label_ar: string
          label_en?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          key?: string
          label_ar?: string
          label_en?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      maintenance_request_notes: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          note: string
          note_type: string
          request_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          note: string
          note_type?: string
          request_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string
          note_type?: string
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_request_notes_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "maintenance_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_requests: {
        Row: {
          assigned_at: string | null
          assigned_to: string | null
          attachments: Json | null
          building: string | null
          client_phone: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          daftra_client_id: string | null
          daftra_document_url: string | null
          daftra_invoice_id: string | null
          daftra_invoice_number: string | null
          description: string | null
          fault_category: Database["public"]["Enums"]["fault_category"]
          floor: string | null
          id: string
          payment_status: string | null
          priority: Database["public"]["Enums"]["maintenance_priority"]
          request_number: string | null
          requester_email: string | null
          requester_name: string
          requester_phone: string | null
          resolution_notes: string | null
          source: string
          source_reference: string | null
          status: Database["public"]["Enums"]["maintenance_status"]
          ticket_number: string
          title: string
          unit: string | null
          updated_at: string
          workflow_stage: string | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_to?: string | null
          attachments?: Json | null
          building?: string | null
          client_phone?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          daftra_client_id?: string | null
          daftra_document_url?: string | null
          daftra_invoice_id?: string | null
          daftra_invoice_number?: string | null
          description?: string | null
          fault_category?: Database["public"]["Enums"]["fault_category"]
          floor?: string | null
          id?: string
          payment_status?: string | null
          priority?: Database["public"]["Enums"]["maintenance_priority"]
          request_number?: string | null
          requester_email?: string | null
          requester_name: string
          requester_phone?: string | null
          resolution_notes?: string | null
          source?: string
          source_reference?: string | null
          status?: Database["public"]["Enums"]["maintenance_status"]
          ticket_number?: string
          title: string
          unit?: string | null
          updated_at?: string
          workflow_stage?: string | null
        }
        Update: {
          assigned_at?: string | null
          assigned_to?: string | null
          attachments?: Json | null
          building?: string | null
          client_phone?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          daftra_client_id?: string | null
          daftra_document_url?: string | null
          daftra_invoice_id?: string | null
          daftra_invoice_number?: string | null
          description?: string | null
          fault_category?: Database["public"]["Enums"]["fault_category"]
          floor?: string | null
          id?: string
          payment_status?: string | null
          priority?: Database["public"]["Enums"]["maintenance_priority"]
          request_number?: string | null
          requester_email?: string | null
          requester_name?: string
          requester_phone?: string | null
          resolution_notes?: string | null
          source?: string
          source_reference?: string | null
          status?: Database["public"]["Enums"]["maintenance_status"]
          ticket_number?: string
          title?: string
          unit?: string | null
          updated_at?: string
          workflow_stage?: string | null
        }
        Relationships: []
      }
      maintenance_technicians: {
        Row: {
          city_id: string | null
          created_at: string
          id: string
          is_active: boolean
          is_verified: boolean
          latitude: number | null
          longitude: number | null
          name: string
          phone: string | null
          rating: number | null
          review_count: number
          specialization: string | null
          tier: string | null
          updated_at: string
        }
        Insert: {
          city_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_verified?: boolean
          latitude?: number | null
          longitude?: number | null
          name: string
          phone?: string | null
          rating?: number | null
          review_count?: number
          specialization?: string | null
          tier?: string | null
          updated_at?: string
        }
        Update: {
          city_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_verified?: boolean
          latitude?: number | null
          longitude?: number | null
          name?: string
          phone?: string | null
          rating?: number | null
          review_count?: number
          specialization?: string | null
          tier?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          attachments: Json
          content: string
          conversation_id: string
          created_at: string
          id: string
          request_id: string | null
          role: string
        }
        Insert: {
          attachments?: Json
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          request_id?: string | null
          role: string
        }
        Update: {
          attachments?: Json
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          request_id?: string | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_request_conversation_fkey"
            columns: ["request_id", "conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_requests"
            referencedColumns: ["id", "conversation_id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean | null
          message: string | null
          project_id: string | null
          title: string
          type: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean | null
          message?: string | null
          project_id?: string | null
          title: string
          type?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean | null
          message?: string | null
          project_id?: string | null
          title?: string
          type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      outbound_messages: {
        Row: {
          channel: string
          created_at: string
          error_message: string | null
          id: string
          message: string
          payload: Json
          provider_response: Json | null
          recipient: string
          request_id: string | null
          scheduled_at: string
          sent_at: string | null
          status: string
        }
        Insert: {
          channel?: string
          created_at?: string
          error_message?: string | null
          id?: string
          message: string
          payload?: Json
          provider_response?: Json | null
          recipient: string
          request_id?: string | null
          scheduled_at?: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          channel?: string
          created_at?: string
          error_message?: string | null
          id?: string
          message?: string
          payload?: Json
          provider_response?: Json | null
          recipient?: string
          request_id?: string | null
          scheduled_at?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "outbound_messages_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "maintenance_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_files: {
        Row: {
          caption: string | null
          created_at: string
          duration_seconds: number | null
          file_name: string
          file_size: number | null
          file_type: string
          file_url: string
          height: number | null
          id: string
          mime_type: string | null
          page_count: number | null
          project_id: string
          sender_name: string | null
          sender_phone: string | null
          storage_path: string | null
          thumbnail_url: string | null
          updated_at: string
          whatsapp_message_id: string | null
          width: number | null
        }
        Insert: {
          caption?: string | null
          created_at?: string
          duration_seconds?: number | null
          file_name: string
          file_size?: number | null
          file_type: string
          file_url: string
          height?: number | null
          id?: string
          mime_type?: string | null
          page_count?: number | null
          project_id: string
          sender_name?: string | null
          sender_phone?: string | null
          storage_path?: string | null
          thumbnail_url?: string | null
          updated_at?: string
          whatsapp_message_id?: string | null
          width?: number | null
        }
        Update: {
          caption?: string | null
          created_at?: string
          duration_seconds?: number | null
          file_name?: string
          file_size?: number | null
          file_type?: string
          file_url?: string
          height?: number | null
          id?: string
          mime_type?: string | null
          page_count?: number | null
          project_id?: string
          sender_name?: string | null
          sender_phone?: string | null
          storage_path?: string | null
          thumbnail_url?: string | null
          updated_at?: string
          whatsapp_message_id?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "project_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          created_at: string
          id: string
          permission: string
          project_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          permission?: string
          project_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          permission?: string
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          client_name: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          location: string | null
          name: string
          project_number: string
          start_date: string | null
          status: string
          thumbnail_url: string | null
          updated_at: string
        }
        Insert: {
          client_name?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          location?: string | null
          name: string
          project_number: string
          start_date?: string | null
          status?: string
          thumbnail_url?: string | null
          updated_at?: string
        }
        Update: {
          client_name?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          location?: string | null
          name?: string
          project_number?: string
          start_date?: string | null
          status?: string
          thumbnail_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      suggestions: {
        Row: {
          brand: string | null
          created_at: string
          id: string
          sender_id: string | null
          suggestion: string | null
        }
        Insert: {
          brand?: string | null
          created_at?: string
          id?: string
          sender_id?: string | null
          suggestion?: string | null
        }
        Update: {
          brand?: string | null
          created_at?: string
          id?: string
          sender_id?: string | null
          suggestion?: string | null
        }
        Relationships: []
      }
      supcloud_keepalive: {
        Row: {
          id: number
          marker: string
        }
        Insert: {
          id: number
          marker?: string
        }
        Update: {
          id?: number
          marker?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          conversation_started_timestamp: number | null
          sender_id: string
          user_id: string
        }
        Insert: {
          conversation_started_timestamp?: number | null
          sender_id: string
          user_id: string
        }
        Update: {
          conversation_started_timestamp?: number | null
          sender_id?: string
          user_id?: string
        }
        Relationships: []
      }
      webhook_logs: {
        Row: {
          created_at: string
          error_message: string | null
          event: string
          id: string
          integration_id: string | null
          integration_type: string
          request_payload: Json | null
          response_body: string | null
          status: string
          status_code: number | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event: string
          id?: string
          integration_id?: string | null
          integration_type: string
          request_payload?: Json | null
          response_body?: string | null
          status: string
          status_code?: number | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event?: string
          id?: string
          integration_id?: string | null
          integration_type?: string
          request_payload?: Json | null
          response_body?: string | null
          status?: string
          status_code?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_logs_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_integrations: {
        Row: {
          access_token: string
          business_account_id: string
          created_at: string | null
          expires_at: string | null
          id: string
          phone_number_id: string
          status: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          access_token: string
          business_account_id: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          phone_number_id: string
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          access_token?: string
          business_account_id?: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          phone_number_id?: string
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      whatsapp_media: {
        Row: {
          caption: string | null
          id: string
          integration_id: string | null
          media_id: string
          mime_type: string | null
          size: number | null
          type: string
          uploaded_at: string | null
          url: string
        }
        Insert: {
          caption?: string | null
          id?: string
          integration_id?: string | null
          media_id: string
          mime_type?: string | null
          size?: number | null
          type: string
          uploaded_at?: string | null
          url: string
        }
        Update: {
          caption?: string | null
          id?: string
          integration_id?: string | null
          media_id?: string
          mime_type?: string | null
          size?: number | null
          type?: string
          uploaded_at?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_media_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_message_templates: {
        Row: {
          body_text: string | null
          business_id: string | null
          business_name: string | null
          buttons: Json
          category: string | null
          components: Json
          footer_text: string | null
          header_component: Json | null
          imported_at: string
          is_primary_device_delivery_only: boolean | null
          language: string
          library_template_name: string | null
          message_send_ttl_seconds: number | null
          namespace: string | null
          parameter_format: string | null
          previous_category: string | null
          raw_template: Json
          source_file: string | null
          status: string | null
          sub_category: string | null
          template_id: string
          template_name: string
          updated_at: string
          variables: Json
          waba_id: string
          waba_name: string | null
        }
        Insert: {
          body_text?: string | null
          business_id?: string | null
          business_name?: string | null
          buttons?: Json
          category?: string | null
          components?: Json
          footer_text?: string | null
          header_component?: Json | null
          imported_at?: string
          is_primary_device_delivery_only?: boolean | null
          language: string
          library_template_name?: string | null
          message_send_ttl_seconds?: number | null
          namespace?: string | null
          parameter_format?: string | null
          previous_category?: string | null
          raw_template: Json
          source_file?: string | null
          status?: string | null
          sub_category?: string | null
          template_id: string
          template_name: string
          updated_at?: string
          variables?: Json
          waba_id: string
          waba_name?: string | null
        }
        Update: {
          body_text?: string | null
          business_id?: string | null
          business_name?: string | null
          buttons?: Json
          category?: string | null
          components?: Json
          footer_text?: string | null
          header_component?: Json | null
          imported_at?: string
          is_primary_device_delivery_only?: boolean | null
          language?: string
          library_template_name?: string | null
          message_send_ttl_seconds?: number | null
          namespace?: string | null
          parameter_format?: string | null
          previous_category?: string | null
          raw_template?: Json
          source_file?: string | null
          status?: string | null
          sub_category?: string | null
          template_id?: string
          template_name?: string
          updated_at?: string
          variables?: Json
          waba_id?: string
          waba_name?: string | null
        }
        Relationships: []
      }
      whatsapp_messages: {
        Row: {
          created_at: string | null
          id: string
          integration_id: string | null
          media_url: string | null
          message: string
          status: string | null
          timestamp: string
          type: string | null
        }
        Insert: {
          created_at?: string | null
          id: string
          integration_id?: string | null
          media_url?: string | null
          message: string
          status?: string | null
          timestamp: string
          type?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          integration_id?: string | null
          media_url?: string | null
          message?: string
          status?: string | null
          timestamp?: string
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_templates: {
        Row: {
          body_text: string
          category: string | null
          created_at: string | null
          id: number
          language_code: string | null
          template_name: string
          updated_at: string | null
        }
        Insert: {
          body_text: string
          category?: string | null
          created_at?: string | null
          id?: number
          language_code?: string | null
          template_name: string
          updated_at?: string | null
        }
        Update: {
          body_text?: string
          category?: string | null
          created_at?: string | null
          id?: number
          language_code?: string | null
          template_name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      bot_settings_public: {
        Row: {
          auto_speak: boolean | null
          avatar_url: string | null
          bot_name: string | null
          bubble_style: string | null
          business_hours: Json | null
          business_hours_enabled: boolean | null
          header_subtitle: string | null
          id: number | null
          offline_message: string | null
          position: string | null
          primary_color: string | null
          quick_replies: Json | null
          show_branding: boolean | null
          sound_enabled: boolean | null
          voice_enabled: boolean | null
          voice_name: string | null
          welcome_message: string | null
        }
        Insert: {
          auto_speak?: boolean | null
          avatar_url?: string | null
          bot_name?: string | null
          bubble_style?: string | null
          business_hours?: Json | null
          business_hours_enabled?: boolean | null
          header_subtitle?: string | null
          id?: number | null
          offline_message?: string | null
          position?: string | null
          primary_color?: string | null
          quick_replies?: Json | null
          show_branding?: boolean | null
          sound_enabled?: boolean | null
          voice_enabled?: boolean | null
          voice_name?: string | null
          welcome_message?: string | null
        }
        Update: {
          auto_speak?: boolean | null
          avatar_url?: string | null
          bot_name?: string | null
          bubble_style?: string | null
          business_hours?: Json | null
          business_hours_enabled?: boolean | null
          header_subtitle?: string | null
          id?: number | null
          offline_message?: string | null
          position?: string | null
          primary_color?: string | null
          quick_replies?: Json | null
          show_branding?: boolean | null
          sound_enabled?: boolean | null
          voice_enabled?: boolean | null
          voice_name?: string | null
          welcome_message?: string | null
        }
        Relationships: []
      }
      v_whatsapp_message_templates: {
        Row: {
          body_text: string | null
          buttons_count: number | null
          category: string | null
          footer_text: string | null
          imported_at: string | null
          language: string | null
          parameter_format: string | null
          status: string | null
          template_id: string | null
          template_name: string | null
          updated_at: string | null
          variables_all: Json | null
          variables_count: number | null
          waba_id: string | null
          waba_name: string | null
        }
        Insert: {
          body_text?: string | null
          buttons_count?: never
          category?: string | null
          footer_text?: string | null
          imported_at?: string | null
          language?: string | null
          parameter_format?: string | null
          status?: string | null
          template_id?: string | null
          template_name?: string | null
          updated_at?: string | null
          variables_all?: never
          variables_count?: never
          waba_id?: string | null
          waba_name?: string | null
        }
        Update: {
          body_text?: string | null
          buttons_count?: never
          category?: string | null
          footer_text?: string | null
          imported_at?: string | null
          language?: string | null
          parameter_format?: string | null
          status?: string | null
          template_id?: string | null
          template_name?: string | null
          updated_at?: string | null
          variables_all?: never
          variables_count?: never
          waba_id?: string | null
          waba_name?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      bot_begin_chat_request: {
        Args: {
          p_agent_id: string
          p_attachments?: Json
          p_conversation_id: string
          p_message: string
          p_request_id: string
          p_user_id: string
        }
        Returns: Json
      }
      bot_create_conversation: {
        Args: {
          p_agent_id?: string
          p_conversation_id: string
          p_user_id: string
        }
        Returns: Json
      }
      bot_finalize_chat_request: {
        Args: {
          p_error_code?: string
          p_request_id: string
          p_response?: Json
          p_status: string
          p_user_id: string
        }
        Returns: Json
      }
      consume_guest_chat_quota: {
        Args: { p_agent_id: string; p_ip_hash: string; p_visitor_id: string }
        Returns: boolean
      }
      get_daily_message_counts: {
        Args: { days?: number }
        Returns: {
          count: number
          date: string
        }[]
      }
      get_message_status_counts: {
        Args: never
        Returns: {
          delivered: number
          failed: number
          read: number
          sent: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      next_maintenance_request_number: { Args: never; Returns: string }
    }
    Enums: {
      app_role:
        | "admin"
        | "architect"
        | "consultant"
        | "contractor"
        | "client"
        | "viewer"
      fault_category:
        | "electrical"
        | "plumbing"
        | "hvac"
        | "structural"
        | "painting"
        | "carpentry"
        | "cleaning"
        | "other"
      maintenance_priority: "low" | "medium" | "high" | "urgent"
      maintenance_status:
        | "new"
        | "assigned"
        | "in_progress"
        | "completed"
        | "cancelled"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: [
        "admin",
        "architect",
        "consultant",
        "contractor",
        "client",
        "viewer",
      ],
      fault_category: [
        "electrical",
        "plumbing",
        "hvac",
        "structural",
        "painting",
        "carpentry",
        "cleaning",
        "other",
      ],
      maintenance_priority: ["low", "medium", "high", "urgent"],
      maintenance_status: [
        "new",
        "assigned",
        "in_progress",
        "completed",
        "cancelled",
      ],
    },
  },
} as const
