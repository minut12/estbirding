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
      admin_secrets: {
        Row: {
          created_at: string
          hash: string
          key: string
        }
        Insert: {
          created_at?: string
          hash: string
          key: string
        }
        Update: {
          created_at?: string
          hash?: string
          key?: string
        }
        Relationships: []
      }
      bird_avatar_map: {
        Row: {
          file_path: string
          public_url: string
          species_key: string
          updated_at: string
        }
        Insert: {
          file_path: string
          public_url: string
          species_key: string
          updated_at?: string
        }
        Update: {
          file_path?: string
          public_url?: string
          species_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      ebird_cache: {
        Row: {
          fetched_at: string
          lat: number | null
          location_name: string | null
          lon: number | null
          occ7: number | null
          species_name: string
          sub_id: string | null
          t: string | null
        }
        Insert: {
          fetched_at?: string
          lat?: number | null
          location_name?: string | null
          lon?: number | null
          occ7?: number | null
          species_name: string
          sub_id?: string | null
          t?: string | null
        }
        Update: {
          fetched_at?: string
          lat?: number | null
          location_name?: string | null
          lon?: number | null
          occ7?: number | null
          species_name?: string
          sub_id?: string | null
          t?: string | null
        }
        Relationships: []
      }
      elurikkus_cache: {
        Row: {
          behavior: string | null
          collectors: string | null
          coords_source: string | null
          coords_status: string | null
          county: string | null
          fetched_at: string
          individual_count: number | null
          lat: number | null
          locality: string | null
          lon: number | null
          municipality: string | null
          occ7: number | null
          open_url: string | null
          search_url: string | null
          species_name: string
          t: string | null
        }
        Insert: {
          behavior?: string | null
          collectors?: string | null
          coords_source?: string | null
          coords_status?: string | null
          county?: string | null
          fetched_at?: string
          individual_count?: number | null
          lat?: number | null
          locality?: string | null
          lon?: number | null
          municipality?: string | null
          occ7?: number | null
          open_url?: string | null
          search_url?: string | null
          species_name: string
          t?: string | null
        }
        Update: {
          behavior?: string | null
          collectors?: string | null
          coords_source?: string | null
          coords_status?: string | null
          county?: string | null
          fetched_at?: string
          individual_count?: number | null
          lat?: number | null
          locality?: string | null
          lon?: number | null
          municipality?: string | null
          occ7?: number | null
          open_url?: string | null
          search_url?: string | null
          species_name?: string
          t?: string | null
        }
        Relationships: []
      }
      elurikkus_observations: {
        Row: {
          behavior: string | null
          county: string | null
          fetched_at: string
          id: string
          individual_count: number | null
          lat: number | null
          locality: string | null
          lon: number | null
          observed_at: string
          observer: string | null
          species_lat: string | null
          species_name: string
          sub_id: string | null
        }
        Insert: {
          behavior?: string | null
          county?: string | null
          fetched_at?: string
          id?: string
          individual_count?: number | null
          lat?: number | null
          locality?: string | null
          lon?: number | null
          observed_at: string
          observer?: string | null
          species_lat?: string | null
          species_name: string
          sub_id?: string | null
        }
        Update: {
          behavior?: string | null
          county?: string | null
          fetched_at?: string
          id?: string
          individual_count?: number | null
          lat?: number | null
          locality?: string | null
          lon?: number | null
          observed_at?: string
          observer?: string | null
          species_lat?: string | null
          species_name?: string
          sub_id?: string | null
        }
        Relationships: []
      }
      elurikkus_raport: {
        Row: {
          estonia_entries: Json
          generated_at: string
          generation_meta: Json
          id: string
          intro_et: string | null
          kevadranne_arrivals: Json
          kevadranne_narrative_et: string | null
          period_end: string
          period_start: string
        }
        Insert: {
          estonia_entries?: Json
          generated_at?: string
          generation_meta?: Json
          id?: string
          intro_et?: string | null
          kevadranne_arrivals?: Json
          kevadranne_narrative_et?: string | null
          period_end: string
          period_start: string
        }
        Update: {
          estonia_entries?: Json
          generated_at?: string
          generation_meta?: Json
          id?: string
          intro_et?: string | null
          kevadranne_arrivals?: Json
          kevadranne_narrative_et?: string | null
          period_end?: string
          period_start?: string
        }
        Relationships: []
      }
      ennustus_cache: {
        Row: {
          best_period_label: string | null
          best_period_pct: number | null
          cell_lat: number | null
          cell_lon: number | null
          computed_at: number
          current_pct: number | null
          exit_reason: string | null
          id: number
          no_data: boolean | null
          score: number
          season: string | null
          species_name: string
          updated_at: string | null
        }
        Insert: {
          best_period_label?: string | null
          best_period_pct?: number | null
          cell_lat?: number | null
          cell_lon?: number | null
          computed_at: number
          current_pct?: number | null
          exit_reason?: string | null
          id?: number
          no_data?: boolean | null
          score?: number
          season?: string | null
          species_name: string
          updated_at?: string | null
        }
        Update: {
          best_period_label?: string | null
          best_period_pct?: number | null
          cell_lat?: number | null
          cell_lon?: number | null
          computed_at?: number
          current_pct?: number | null
          exit_reason?: string | null
          id?: number
          no_data?: boolean | null
          score?: number
          season?: string | null
          species_name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      europe_ebird_cache: {
        Row: {
          country_code: string
          fetched_at: string
          latest_lat: number | null
          latest_loc: string | null
          latest_lon: number | null
          latest_obs_date: string | null
          occ7: number
          species_name: string
        }
        Insert: {
          country_code: string
          fetched_at?: string
          latest_lat?: number | null
          latest_loc?: string | null
          latest_lon?: number | null
          latest_obs_date?: string | null
          occ7?: number
          species_name: string
        }
        Update: {
          country_code?: string
          fetched_at?: string
          latest_lat?: number | null
          latest_loc?: string | null
          latest_lon?: number | null
          latest_obs_date?: string | null
          occ7?: number
          species_name?: string
        }
        Relationships: []
      }
      europe_snapshot: {
        Row: {
          created_at: string
          generated_at: string | null
          heartbeat_at: string | null
          id: number
          last_error: string | null
          points_json: Json
          progress_done: number
          progress_total: number
          run_id: string | null
          running_started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          generated_at?: string | null
          heartbeat_at?: string | null
          id?: number
          last_error?: string | null
          points_json?: Json
          progress_done?: number
          progress_total?: number
          run_id?: string | null
          running_started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          generated_at?: string | null
          heartbeat_at?: string | null
          id?: number
          last_error?: string | null
          points_json?: Json
          progress_done?: number
          progress_total?: number
          run_id?: string | null
          running_started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          all_day: boolean
          category: string
          content_html: string | null
          created_at: string
          created_by: string | null
          description: string
          end_at: string | null
          guid: string
          id: string
          image_url: string | null
          is_archived: boolean
          is_cancelled: boolean
          is_published: boolean
          language: string
          lat: number | null
          lng: number | null
          location_lat: number | null
          location_lon: number | null
          location_name: string | null
          organizer_name: string | null
          registration_url: string | null
          source_id: string
          source_slug: string
          start_at: string
          tags: string[] | null
          title: string
          updated_at: string
          url: string | null
        }
        Insert: {
          all_day?: boolean
          category?: string
          content_html?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          end_at?: string | null
          guid: string
          id?: string
          image_url?: string | null
          is_archived?: boolean
          is_cancelled?: boolean
          is_published?: boolean
          language?: string
          lat?: number | null
          lng?: number | null
          location_lat?: number | null
          location_lon?: number | null
          location_name?: string | null
          organizer_name?: string | null
          registration_url?: string | null
          source_id: string
          source_slug: string
          start_at: string
          tags?: string[] | null
          title: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          all_day?: boolean
          category?: string
          content_html?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          end_at?: string | null
          guid?: string
          id?: string
          image_url?: string | null
          is_archived?: boolean
          is_cancelled?: boolean
          is_published?: boolean
          language?: string
          lat?: number | null
          lng?: number | null
          location_lat?: number | null
          location_lon?: number | null
          location_name?: string | null
          organizer_name?: string | null
          registration_url?: string | null
          source_id?: string
          source_slug?: string
          start_at?: string
          tags?: string[] | null
          title?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "events_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      events_manual: {
        Row: {
          archived_at: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          ends_at: string | null
          id: string
          image_path: string | null
          image_url: string | null
          lat: number | null
          location_name: string | null
          lon: number | null
          starts_at: string
          status: string
          title: string
          type: string
          updated_at: string
          url: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          image_path?: string | null
          image_url?: string | null
          lat?: number | null
          location_name?: string | null
          lon?: number | null
          starts_at: string
          status?: string
          title: string
          type?: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          image_path?: string | null
          image_url?: string | null
          lat?: number | null
          location_name?: string | null
          lon?: number | null
          starts_at?: string
          status?: string
          title?: string
          type?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: []
      }
      events_sources: {
        Row: {
          created_at: string
          homepage_url: string | null
          id: string
          is_active: boolean
          name: string
          slug: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          homepage_url?: string | null
          id?: string
          is_active?: boolean
          name: string
          slug: string
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          homepage_url?: string | null
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      linnuliigid_snapshot: {
        Row: {
          created_at: string
          generated_at: string | null
          heartbeat_at: string | null
          id: number
          last_error: string | null
          points_json: Json
          progress_done: number
          progress_total: number
          run_id: string | null
          running_started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          generated_at?: string | null
          heartbeat_at?: string | null
          id?: number
          last_error?: string | null
          points_json?: Json
          progress_done?: number
          progress_total?: number
          run_id?: string | null
          running_started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          generated_at?: string | null
          heartbeat_at?: string | null
          id?: number
          last_error?: string | null
          points_json?: Json
          progress_done?: number
          progress_total?: number
          run_id?: string | null
          running_started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      linnuliigid_spring_dates: {
        Row: {
          species_key: string
          species_name: string
          spring_date: string
          spring_time: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          species_key: string
          species_name?: string
          spring_date?: string
          spring_time?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          species_key?: string
          species_name?: string
          spring_date?: string
          spring_time?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      map_species_preferences: {
        Row: {
          created_at: string
          id: string
          is_hidden: boolean
          map_scope: string
          species_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_hidden?: boolean
          map_scope: string
          species_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_hidden?: boolean
          map_scope?: string
          species_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      news_items: {
        Row: {
          archived: boolean
          body: string | null
          body_et: string | null
          cached_image_path: string | null
          cached_image_url: string | null
          content_fetch_error: string | null
          content_fetched_at: string | null
          content_html: string | null
          created_at: string
          external_id: string | null
          fetched_at: string
          guid: string
          id: string
          image_cached_url: string | null
          image_url: string | null
          image_url_original: string | null
          language: string
          permalink_url: string | null
          published_at: string
          raw_json: Json | null
          source_id: string
          source_key: string | null
          source_lang: string | null
          source_slug: string
          summary: string | null
          title: string
          title_et: string | null
          translate_hash: string | null
          translated_at: string | null
          translated_body: string | null
          translated_title: string | null
          translation_error: string | null
          translation_status: string
          updated_at: string
          url: string
        }
        Insert: {
          archived?: boolean
          body?: string | null
          body_et?: string | null
          cached_image_path?: string | null
          cached_image_url?: string | null
          content_fetch_error?: string | null
          content_fetched_at?: string | null
          content_html?: string | null
          created_at?: string
          external_id?: string | null
          fetched_at?: string
          guid: string
          id?: string
          image_cached_url?: string | null
          image_url?: string | null
          image_url_original?: string | null
          language?: string
          permalink_url?: string | null
          published_at?: string
          raw_json?: Json | null
          source_id: string
          source_key?: string | null
          source_lang?: string | null
          source_slug: string
          summary?: string | null
          title: string
          title_et?: string | null
          translate_hash?: string | null
          translated_at?: string | null
          translated_body?: string | null
          translated_title?: string | null
          translation_error?: string | null
          translation_status?: string
          updated_at?: string
          url: string
        }
        Update: {
          archived?: boolean
          body?: string | null
          body_et?: string | null
          cached_image_path?: string | null
          cached_image_url?: string | null
          content_fetch_error?: string | null
          content_fetched_at?: string | null
          content_html?: string | null
          created_at?: string
          external_id?: string | null
          fetched_at?: string
          guid?: string
          id?: string
          image_cached_url?: string | null
          image_url?: string | null
          image_url_original?: string | null
          language?: string
          permalink_url?: string | null
          published_at?: string
          raw_json?: Json | null
          source_id?: string
          source_key?: string | null
          source_lang?: string | null
          source_slug?: string
          summary?: string | null
          title?: string
          title_et?: string | null
          translate_hash?: string | null
          translated_at?: string | null
          translated_body?: string | null
          translated_title?: string | null
          translation_error?: string | null
          translation_status?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "news_items_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "news_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      news_sources: {
        Row: {
          created_at: string
          feed_url: string | null
          fetch_url: string | null
          homepage_url: string | null
          id: string
          is_active: boolean
          is_enabled: boolean
          key: string | null
          name: string
          slug: string
          source_key: string | null
          translate_to_et: boolean
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          feed_url?: string | null
          fetch_url?: string | null
          homepage_url?: string | null
          id?: string
          is_active?: boolean
          is_enabled?: boolean
          key?: string | null
          name: string
          slug: string
          source_key?: string | null
          translate_to_et?: boolean
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          feed_url?: string | null
          fetch_url?: string | null
          homepage_url?: string | null
          id?: string
          is_active?: boolean
          is_enabled?: boolean
          key?: string | null
          name?: string
          slug?: string
          source_key?: string | null
          translate_to_et?: boolean
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      prediction_jobs: {
        Row: {
          analysis_version: string | null
          created_at: string
          error_json: Json | null
          generated_at: string | null
          id: string
          request_id: string
          result_json: Json | null
          scope: string
          settings: Json | null
          species_key: string
          species_name: string
          status: string
          updated_at: string
        }
        Insert: {
          analysis_version?: string | null
          created_at?: string
          error_json?: Json | null
          generated_at?: string | null
          id?: string
          request_id: string
          result_json?: Json | null
          scope?: string
          settings?: Json | null
          species_key: string
          species_name: string
          status?: string
          updated_at?: string
        }
        Update: {
          analysis_version?: string | null
          created_at?: string
          error_json?: Json | null
          generated_at?: string | null
          id?: string
          request_id?: string
          result_json?: Json | null
          scope?: string
          settings?: Json | null
          species_key?: string
          species_name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          created_at: string
          device_label: string | null
          endpoint: string
          id: string
          key_auth: string
          key_p256dh: string
          subscribed_species: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          device_label?: string | null
          endpoint: string
          id?: string
          key_auth: string
          key_p256dh: string
          subscribed_species?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          device_label?: string | null
          endpoint?: string
          id?: string
          key_auth?: string
          key_p256dh?: string
          subscribed_species?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          created_at: string
          id: string
          permission_key: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          created_at?: string
          id?: string
          permission_key: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          created_at?: string
          id?: string
          permission_key?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      species_prediction_defaults: {
        Row: {
          created_at: string
          id: string
          map_scope: string
          settings: Json
          species_key: string
          species_name: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          map_scope: string
          settings?: Json
          species_key: string
          species_name?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          map_scope?: string
          settings?: Json
          species_key?: string
          species_name?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      species_year_first_obs: {
        Row: {
          fetched_at: string
          first_obs_date: string
          locality: string | null
          observer: string | null
          species_et: string
          year: number
        }
        Insert: {
          fetched_at?: string
          first_obs_date: string
          locality?: string | null
          observer?: string | null
          species_et: string
          year: number
        }
        Update: {
          fetched_at?: string
          first_obs_date?: string
          locality?: string | null
          observer?: string | null
          species_et?: string
          year?: number
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
      vaatluste_raport: {
        Row: {
          estonia_entries: Json
          estonia_narrative_et: string | null
          europe_entries: Json
          europe_narrative_et: string | null
          generated_at: string
          generation_meta: Json | null
          id: string
          intro_et: string | null
          model: string | null
          period_end: string
          period_start: string
          source_data: Json | null
        }
        Insert: {
          estonia_entries?: Json
          estonia_narrative_et?: string | null
          europe_entries?: Json
          europe_narrative_et?: string | null
          generated_at?: string
          generation_meta?: Json | null
          id?: string
          intro_et?: string | null
          model?: string | null
          period_end: string
          period_start: string
          source_data?: Json | null
        }
        Update: {
          estonia_entries?: Json
          estonia_narrative_et?: string | null
          europe_entries?: Json
          europe_narrative_et?: string | null
          generated_at?: string
          generation_meta?: Json | null
          id?: string
          intro_et?: string | null
          model?: string | null
          period_end?: string
          period_start?: string
          source_data?: Json | null
        }
        Relationships: []
      }
    }
    Views: {
      news_items_v: {
        Row: {
          archived: boolean | null
          body: string | null
          body_et: string | null
          cached_image_path: string | null
          cached_image_url: string | null
          content_fetch_error: string | null
          content_fetched_at: string | null
          content_html: string | null
          created_at: string | null
          display_image_url: string | null
          external_id: string | null
          fetched_at: string | null
          guid: string | null
          id: string | null
          image_cached_url: string | null
          image_url: string | null
          image_url_original: string | null
          language: string | null
          permalink_url: string | null
          published_at: string | null
          raw_json: Json | null
          source_id: string | null
          source_key: string | null
          source_lang: string | null
          source_name: string | null
          source_slug: string | null
          summary: string | null
          title: string | null
          title_et: string | null
          translated_at: string | null
          translated_body: string | null
          translated_title: string | null
          translation_error: string | null
          translation_status: string | null
          updated_at: string | null
          url: string | null
        }
        Relationships: [
          {
            foreignKeyName: "news_items_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "news_sources"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      events_admin_assert_admin: { Args: never; Returns: undefined }
      events_admin_create: {
        Args: {
          p_description: string
          p_ends_at: string
          p_image_path: string
          p_image_url: string
          p_lat: number
          p_location_name: string
          p_lon: number
          p_starts_at: string
          p_title: string
          p_type: string
          p_url: string
        }
        Returns: {
          archived_at: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          ends_at: string | null
          id: string
          image_path: string | null
          image_url: string | null
          lat: number | null
          location_name: string | null
          lon: number | null
          starts_at: string
          status: string
          title: string
          type: string
          updated_at: string
          url: string | null
        }
        SetofOptions: {
          from: "*"
          to: "events_manual"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      events_admin_delete: {
        Args: { p_id: string }
        Returns: {
          archived_at: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          ends_at: string | null
          id: string
          image_path: string | null
          image_url: string | null
          lat: number | null
          location_name: string | null
          lon: number | null
          starts_at: string
          status: string
          title: string
          type: string
          updated_at: string
          url: string | null
        }
        SetofOptions: {
          from: "*"
          to: "events_manual"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      events_admin_health: { Args: never; Returns: Json }
      events_admin_update: {
        Args: { p_id: string; p_patch: Json }
        Returns: {
          archived_at: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          ends_at: string | null
          id: string
          image_path: string | null
          image_url: string | null
          lat: number | null
          location_name: string | null
          lon: number | null
          starts_at: string
          status: string
          title: string
          type: string
          updated_at: string
          url: string | null
        }
        SetofOptions: {
          from: "*"
          to: "events_manual"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_all_avatars: {
        Args: never
        Returns: {
          public_url: string
          species_key: string
        }[]
      }
      get_subscriptions_for_species: {
        Args: { species_list: string[] }
        Returns: {
          endpoint: string
          key_auth: string
          key_p256dh: string
          subscribed_species: string[]
        }[]
      }
      get_user_permissions: { Args: { _user_id: string }; Returns: string[] }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_permission: {
        Args: { _permission: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user_level_1" | "user_level_2"
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
      app_role: ["admin", "user_level_1", "user_level_2"],
    },
  },
} as const
