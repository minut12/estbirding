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
      _events_admin_bootstrap_or_check: {
        Args: { admin_key: string }
        Returns: undefined
      }
      events_admin_archive: {
        Args: { admin_key: string; p_id: string }
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
      events_admin_create:
        | {
            Args: {
              admin_key: string
              p_description?: string
              p_ends_at?: string
              p_lat?: number
              p_location_name?: string
              p_lon?: number
              p_starts_at: string
              p_title: string
              p_type?: string
              p_url?: string
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
        | {
            Args: {
              admin_key: string
              p_description?: string
              p_ends_at?: string
              p_image_path?: string
              p_image_url?: string
              p_lat?: number
              p_location_name?: string
              p_lon?: number
              p_starts_at: string
              p_title: string
              p_type?: string
              p_url?: string
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
        Args: { admin_key: string; p_id: string }
        Returns: Json
      }
      events_admin_health: { Args: { admin_key: string }; Returns: Json }
      events_admin_unarchive: {
        Args: { admin_key: string; p_id: string }
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
      events_admin_update: {
        Args: { admin_key: string; p_id: string; p_patch: Json }
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
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
