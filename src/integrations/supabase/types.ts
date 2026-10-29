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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      attack_log: {
        Row: {
          attack_type: string
          blocked: boolean
          created_at: string
          id: string
          ip: string | null
          method: string | null
          payload_preview: string | null
          rule_matched: string | null
          severity: string
          url: string | null
        }
        Insert: {
          attack_type: string
          blocked?: boolean
          created_at?: string
          id?: string
          ip?: string | null
          method?: string | null
          payload_preview?: string | null
          rule_matched?: string | null
          severity?: string
          url?: string | null
        }
        Update: {
          attack_type?: string
          blocked?: boolean
          created_at?: string
          id?: string
          ip?: string | null
          method?: string | null
          payload_preview?: string | null
          rule_matched?: string | null
          severity?: string
          url?: string | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json
          entity: string | null
          entity_id: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json
          entity?: string | null
          entity_id?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json
          entity?: string | null
          entity_id?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      automation_runs: {
        Row: {
          automation_id: string
          contact_id: string | null
          created_at: string
          error: string | null
          id: string
          run_at: string
          status: string
          step: number
        }
        Insert: {
          automation_id: string
          contact_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          run_at?: string
          status?: string
          step?: number
        }
        Update: {
          automation_id?: string
          contact_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          run_at?: string
          status?: string
          step?: number
        }
        Relationships: [
          {
            foreignKeyName: "automation_runs_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      automations: {
        Row: {
          actions: Json
          active: boolean
          conditions: Json
          created_at: string
          id: string
          name: string
          trigger_type: string
          updated_at: string
        }
        Insert: {
          actions?: Json
          active?: boolean
          conditions?: Json
          created_at?: string
          id?: string
          name: string
          trigger_type: string
          updated_at?: string
        }
        Update: {
          actions?: Json
          active?: boolean
          conditions?: Json
          created_at?: string
          id?: string
          name?: string
          trigger_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      banned_ips: {
        Row: {
          attack_count: number
          attack_type: string | null
          banned_at: string
          geo_city: string | null
          geo_country: string | null
          geo_org: string | null
          id: string
          ip: string
          last_attack_at: string
          notes: string | null
          permanent_block: boolean
          reason: string
          reviewed: boolean
          sample_payload: string | null
          severity: string | null
          unbanned: boolean
          user_agent: string | null
        }
        Insert: {
          attack_count?: number
          attack_type?: string | null
          banned_at?: string
          geo_city?: string | null
          geo_country?: string | null
          geo_org?: string | null
          id?: string
          ip: string
          last_attack_at?: string
          notes?: string | null
          permanent_block?: boolean
          reason: string
          reviewed?: boolean
          sample_payload?: string | null
          severity?: string | null
          unbanned?: boolean
          user_agent?: string | null
        }
        Update: {
          attack_count?: number
          attack_type?: string | null
          banned_at?: string
          geo_city?: string | null
          geo_country?: string | null
          geo_org?: string | null
          id?: string
          ip?: string
          last_attack_at?: string
          notes?: string | null
          permanent_block?: boolean
          reason?: string
          reviewed?: boolean
          sample_payload?: string | null
          severity?: string | null
          unbanned?: boolean
          user_agent?: string | null
        }
        Relationships: []
      }
      campaign_recipients: {
        Row: {
          attempts: number
          campaign_id: string
          channel: Database["public"]["Enums"]["channel"]
          clicked_at: string | null
          contact_id: string
          created_at: string
          delivered_at: string | null
          exclusion_reason: string | null
          id: string
          last_error: string | null
          next_attempt_at: string | null
          opened_at: string | null
          provider_message_id: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["delivery_status"]
          updated_at: string
        }
        Insert: {
          attempts?: number
          campaign_id: string
          channel: Database["public"]["Enums"]["channel"]
          clicked_at?: string | null
          contact_id: string
          created_at?: string
          delivered_at?: string | null
          exclusion_reason?: string | null
          id?: string
          last_error?: string | null
          next_attempt_at?: string | null
          opened_at?: string | null
          provider_message_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["delivery_status"]
          updated_at?: string
        }
        Update: {
          attempts?: number
          campaign_id?: string
          channel?: Database["public"]["Enums"]["channel"]
          clicked_at?: string | null
          contact_id?: string
          created_at?: string
          delivered_at?: string | null
          exclusion_reason?: string | null
          id?: string
          last_error?: string | null
          next_attempt_at?: string | null
          opened_at?: string | null
          provider_message_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["delivery_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          body_html: string | null
          body_text: string | null
          channel: Database["public"]["Enums"]["channel"]
          completed_at: string | null
          created_at: string
          created_by: string | null
          from_email: string | null
          from_name: string | null
          id: string
          list_ids: string[]
          name: string
          reply_to: string | null
          scheduled_at: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["campaign_status"]
          subject: string | null
          template_id: string | null
          updated_at: string
        }
        Insert: {
          body_html?: string | null
          body_text?: string | null
          channel: Database["public"]["Enums"]["channel"]
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          from_email?: string | null
          from_name?: string | null
          id?: string
          list_ids?: string[]
          name: string
          reply_to?: string | null
          scheduled_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          subject?: string | null
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          body_html?: string | null
          body_text?: string | null
          channel?: Database["public"]["Enums"]["channel"]
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          from_email?: string | null
          from_name?: string | null
          id?: string
          list_ids?: string[]
          name?: string
          reply_to?: string | null
          scheduled_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          subject?: string | null
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_tags: {
        Row: {
          contact_id: string
          created_at: string
          tag_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          tag_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_tags_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          allow_email: boolean
          allow_whatsapp: boolean
          company: string | null
          consent_at: string | null
          consent_source: string | null
          created_at: string
          created_by: string | null
          custom_fields: Json
          email: string | null
          email_valid: boolean
          full_name: string | null
          id: string
          phone: string | null
          phone_valid: boolean
          source: string | null
          status: Database["public"]["Enums"]["contact_status"]
          updated_at: string
        }
        Insert: {
          allow_email?: boolean
          allow_whatsapp?: boolean
          company?: string | null
          consent_at?: string | null
          consent_source?: string | null
          created_at?: string
          created_by?: string | null
          custom_fields?: Json
          email?: string | null
          email_valid?: boolean
          full_name?: string | null
          id?: string
          phone?: string | null
          phone_valid?: boolean
          source?: string | null
          status?: Database["public"]["Enums"]["contact_status"]
          updated_at?: string
        }
        Update: {
          allow_email?: boolean
          allow_whatsapp?: boolean
          company?: string | null
          consent_at?: string | null
          consent_source?: string | null
          created_at?: string
          created_by?: string | null
          custom_fields?: Json
          email?: string | null
          email_valid?: boolean
          full_name?: string | null
          id?: string
          phone?: string | null
          phone_valid?: boolean
          source?: string | null
          status?: Database["public"]["Enums"]["contact_status"]
          updated_at?: string
        }
        Relationships: []
      }
      coupons: {
        Row: {
          active: boolean
          code: string
          created_at: string
          expires_at: string | null
          id: string
          min_value_cents: number
          percent: number
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          expires_at?: string | null
          id?: string
          min_value_cents?: number
          percent: number
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          min_value_cents?: number
          percent?: number
        }
        Relationships: []
      }
      events: {
        Row: {
          created_at: string
          data: Json | null
          id: string
          lead_id: string | null
          page: string | null
          session_id: string | null
          type: string
          value_cents: number | null
        }
        Insert: {
          created_at?: string
          data?: Json | null
          id?: string
          lead_id?: string | null
          page?: string | null
          session_id?: string | null
          type: string
          value_cents?: number | null
        }
        Update: {
          created_at?: string
          data?: Json | null
          id?: string
          lead_id?: string | null
          page?: string | null
          session_id?: string | null
          type?: string
          value_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          city: string | null
          country: string | null
          created_at: string
          email: string | null
          id: string
          ip: string | null
          last_seen_at: string
          name: string
          phone: string | null
          referrer: string | null
          user_agent: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          city?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          id?: string
          ip?: string | null
          last_seen_at?: string
          name: string
          phone?: string | null
          referrer?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          city?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          id?: string
          ip?: string | null
          last_seen_at?: string
          name?: string
          phone?: string | null
          referrer?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: []
      }
      list_members: {
        Row: {
          added_at: string
          contact_id: string
          list_id: string
        }
        Insert: {
          added_at?: string
          contact_id: string
          list_id: string
        }
        Update: {
          added_at?: string
          contact_id?: string
          list_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "list_members_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "list_members_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "lists"
            referencedColumns: ["id"]
          },
        ]
      }
      lists: {
        Row: {
          created_at: string
          description: string | null
          id: string
          kind: string
          name: string
          rules: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          kind?: string
          name: string
          rules?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          kind?: string
          name?: string
          rules?: Json
          updated_at?: string
        }
        Relationships: []
      }
      logs: {
        Row: {
          action: string
          created_at: string
          destination_phone: string | null
          extra: Json | null
          geo_city: string | null
          geo_country: string | null
          id: string
          ip: string | null
          name: string | null
          notes: string | null
          page: string | null
          phone: string | null
          suspicious: boolean
          user_agent: string | null
        }
        Insert: {
          action: string
          created_at?: string
          destination_phone?: string | null
          extra?: Json | null
          geo_city?: string | null
          geo_country?: string | null
          id?: string
          ip?: string | null
          name?: string | null
          notes?: string | null
          page?: string | null
          phone?: string | null
          suspicious?: boolean
          user_agent?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          destination_phone?: string | null
          extra?: Json | null
          geo_city?: string | null
          geo_country?: string | null
          id?: string
          ip?: string | null
          name?: string | null
          notes?: string | null
          page?: string | null
          phone?: string | null
          suspicious?: boolean
          user_agent?: string | null
        }
        Relationships: []
      }
      message_events: {
        Row: {
          campaign_id: string | null
          channel: Database["public"]["Enums"]["channel"]
          contact_id: string | null
          event_type: string
          id: string
          occurred_at: string
          payload: Json
          provider_message_id: string | null
          recipient_id: string | null
        }
        Insert: {
          campaign_id?: string | null
          channel: Database["public"]["Enums"]["channel"]
          contact_id?: string | null
          event_type: string
          id?: string
          occurred_at?: string
          payload?: Json
          provider_message_id?: string | null
          recipient_id?: string | null
        }
        Update: {
          campaign_id?: string | null
          channel?: Database["public"]["Enums"]["channel"]
          contact_id?: string | null
          event_type?: string
          id?: string
          occurred_at?: string
          payload?: Json
          provider_message_id?: string | null
          recipient_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_events_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "campaign_recipients"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          body_html: string | null
          body_text: string | null
          category: string | null
          channel: Database["public"]["Enums"]["channel"]
          created_at: string
          id: string
          name: string
          provider_status: string | null
          provider_template_name: string | null
          subject: string | null
          updated_at: string
        }
        Insert: {
          body_html?: string | null
          body_text?: string | null
          category?: string | null
          channel: Database["public"]["Enums"]["channel"]
          created_at?: string
          id?: string
          name: string
          provider_status?: string | null
          provider_template_name?: string | null
          subject?: string | null
          updated_at?: string
        }
        Update: {
          body_html?: string | null
          body_text?: string | null
          category?: string | null
          channel?: Database["public"]["Enums"]["channel"]
          created_at?: string
          id?: string
          name?: string
          provider_status?: string | null
          provider_template_name?: string | null
          subject?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          confirmed_by: string | null
          coupon_code: string | null
          created_at: string
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          id: string
          items: Json
          lead_id: string | null
          notes: string | null
          paid_at: string | null
          payment_method: string
          status: string
          total_cents: number
          tracking: Json
          updated_at: string
        }
        Insert: {
          confirmed_by?: string | null
          coupon_code?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          items?: Json
          lead_id?: string | null
          notes?: string | null
          paid_at?: string | null
          payment_method?: string
          status?: string
          total_cents?: number
          tracking?: Json
          updated_at?: string
        }
        Update: {
          confirmed_by?: string | null
          coupon_code?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          items?: Json
          lead_id?: string | null
          notes?: string | null
          paid_at?: string | null
          payment_method?: string
          status?: string
          total_cents?: number
          tracking?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      sessions: {
        Row: {
          current_page: string | null
          id: string
          ip: string | null
          last_seen_at: string
          lead_id: string | null
          referrer: string | null
          started_at: string
          user_agent: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          current_page?: string | null
          id?: string
          ip?: string | null
          last_seen_at?: string
          lead_id?: string | null
          referrer?: string | null
          started_at?: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          current_page?: string | null
          id?: string
          ip?: string | null
          last_seen_at?: string
          lead_id?: string | null
          referrer?: string | null
          started_at?: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressions: {
        Row: {
          channel: Database["public"]["Enums"]["channel"] | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          phone: string | null
          reason: string
          source: string
        }
        Insert: {
          channel?: Database["public"]["Enums"]["channel"] | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          phone?: string | null
          reason: string
          source?: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["channel"] | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          phone?: string | null
          reason?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppressions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      visitor_ips: {
        Row: {
          blocked: boolean
          blocked_at: string | null
          blocked_reason: string | null
          first_page: string | null
          first_seen_at: string
          fp_gpu: string | null
          fp_hash: string | null
          fp_lang: string | null
          fp_platform: string | null
          fp_screen: string | null
          fp_timezone: string | null
          geo_city: string | null
          geo_country: string | null
          geo_country_code: string | null
          geo_lat: number | null
          geo_lon: number | null
          geo_org: string | null
          geo_region: string | null
          id: string
          ip: string
          is_datacenter: boolean | null
          is_proxy: boolean | null
          is_tor: boolean | null
          is_virtual: boolean | null
          is_vpn: boolean | null
          last_page: string | null
          last_seen_at: string
          name: string | null
          notes: string | null
          permanent_block: boolean
          tz_mismatch: boolean | null
          user_agent: string | null
          visit_count: number
        }
        Insert: {
          blocked?: boolean
          blocked_at?: string | null
          blocked_reason?: string | null
          first_page?: string | null
          first_seen_at?: string
          fp_gpu?: string | null
          fp_hash?: string | null
          fp_lang?: string | null
          fp_platform?: string | null
          fp_screen?: string | null
          fp_timezone?: string | null
          geo_city?: string | null
          geo_country?: string | null
          geo_country_code?: string | null
          geo_lat?: number | null
          geo_lon?: number | null
          geo_org?: string | null
          geo_region?: string | null
          id?: string
          ip: string
          is_datacenter?: boolean | null
          is_proxy?: boolean | null
          is_tor?: boolean | null
          is_virtual?: boolean | null
          is_vpn?: boolean | null
          last_page?: string | null
          last_seen_at?: string
          name?: string | null
          notes?: string | null
          permanent_block?: boolean
          tz_mismatch?: boolean | null
          user_agent?: string | null
          visit_count?: number
        }
        Update: {
          blocked?: boolean
          blocked_at?: string | null
          blocked_reason?: string | null
          first_page?: string | null
          first_seen_at?: string
          fp_gpu?: string | null
          fp_hash?: string | null
          fp_lang?: string | null
          fp_platform?: string | null
          fp_screen?: string | null
          fp_timezone?: string | null
          geo_city?: string | null
          geo_country?: string | null
          geo_country_code?: string | null
          geo_lat?: number | null
          geo_lon?: number | null
          geo_org?: string | null
          geo_region?: string | null
          id?: string
          ip?: string
          is_datacenter?: boolean | null
          is_proxy?: boolean | null
          is_tor?: boolean | null
          is_virtual?: boolean | null
          is_vpn?: boolean | null
          last_page?: string | null
          last_seen_at?: string
          name?: string | null
          notes?: string | null
          permanent_block?: boolean
          tz_mismatch?: boolean | null
          user_agent?: string | null
          visit_count?: number
        }
        Relationships: []
      }
      webhook_events: {
        Row: {
          error: string | null
          external_id: string | null
          id: string
          payload: Json
          processed: boolean
          provider: string
          received_at: string
        }
        Insert: {
          error?: string | null
          external_id?: string | null
          id?: string
          payload: Json
          processed?: boolean
          provider: string
          received_at?: string
        }
        Update: {
          error?: string | null
          external_id?: string | null
          id?: string
          payload?: Json
          processed?: boolean
          provider?: string
          received_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      daily_activity: {
        Args: { _days?: number }
        Returns: {
          channel: Database["public"]["Enums"]["channel"]
          day: string
          failed: number
          sent: number
        }[]
      }
      dashboard_stats: { Args: never; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_member: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "operator"
      campaign_status:
        | "draft"
        | "scheduled"
        | "queued"
        | "sending"
        | "paused"
        | "completed"
        | "cancelled"
        | "failed"
      channel: "email" | "whatsapp"
      contact_status:
        | "active"
        | "inactive"
        | "unsubscribed"
        | "blocked"
        | "bounced"
      delivery_status:
        | "pending"
        | "excluded"
        | "sending"
        | "accepted"
        | "delivered"
        | "opened"
        | "clicked"
        | "read"
        | "replied"
        | "bounced"
        | "failed"
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
      app_role: ["admin", "operator"],
      campaign_status: [
        "draft",
        "scheduled",
        "queued",
        "sending",
        "paused",
        "completed",
        "cancelled",
        "failed",
      ],
      channel: ["email", "whatsapp"],
      contact_status: [
        "active",
        "inactive",
        "unsubscribed",
        "blocked",
        "bounced",
      ],
      delivery_status: [
        "pending",
        "excluded",
        "sending",
        "accepted",
        "delivered",
        "opened",
        "clicked",
        "read",
        "replied",
        "bounced",
        "failed",
      ],
    },
  },
} as const
