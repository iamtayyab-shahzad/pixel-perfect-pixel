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
      appointments: {
        Row: {
          access_token: string
          address_line: string
          business_id: string
          city: string
          created_at: string
          customer_id: string
          delay_minutes: number
          estimated_minutes: number
          id: string
          inquiry_id: string | null
          postal_code: string
          priority: Database["public"]["Enums"]["priority"]
          problem_summary: string
          required_skill_ids: string[]
          service_id: string
          status: Database["public"]["Enums"]["appointment_status"]
          window_end: string
          window_start: string
        }
        Insert: {
          access_token?: string
          address_line: string
          business_id: string
          city: string
          created_at?: string
          customer_id: string
          delay_minutes?: number
          estimated_minutes: number
          id?: string
          inquiry_id?: string | null
          postal_code: string
          priority?: Database["public"]["Enums"]["priority"]
          problem_summary?: string
          required_skill_ids: string[]
          service_id: string
          status?: Database["public"]["Enums"]["appointment_status"]
          window_end: string
          window_start: string
        }
        Update: {
          access_token?: string
          address_line?: string
          business_id?: string
          city?: string
          created_at?: string
          customer_id?: string
          delay_minutes?: number
          estimated_minutes?: number
          id?: string
          inquiry_id?: string | null
          postal_code?: string
          priority?: Database["public"]["Enums"]["priority"]
          problem_summary?: string
          required_skill_ids?: string[]
          service_id?: string
          status?: Database["public"]["Enums"]["appointment_status"]
          window_end?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      assignments: {
        Row: {
          appointment_id: string
          assigned_at: string
          assigned_by: string | null
          blocked_end: string
          blocked_start: string
          business_id: string
          id: string
          status: Database["public"]["Enums"]["assignment_status"]
          technician_id: string
        }
        Insert: {
          appointment_id: string
          assigned_at?: string
          assigned_by?: string | null
          blocked_end: string
          blocked_start: string
          business_id: string
          id?: string
          status?: Database["public"]["Enums"]["assignment_status"]
          technician_id: string
        }
        Update: {
          appointment_id?: string
          assigned_at?: string
          assigned_by?: string | null
          blocked_end?: string
          blocked_start?: string
          business_id?: string
          id?: string
          status?: Database["public"]["Enums"]["assignment_status"]
          technician_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_blocks: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          ends_at: string
          id: string
          kind: Database["public"]["Enums"]["block_kind"]
          note: string | null
          starts_at: string
          technician_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          ends_at: string
          id?: string
          kind: Database["public"]["Enums"]["block_kind"]
          note?: string | null
          starts_at: string
          technician_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["block_kind"]
          note?: string | null
          starts_at?: string
          technician_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_blocks_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_blocks_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          created_at: string
          id: string
          name: string
          service_area_description: string
          timezone: string
          travel_minutes: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          service_area_description?: string
          timezone?: string
          travel_minutes?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          service_area_description?: string
          timezone?: string
          travel_minutes?: number
        }
        Relationships: []
      }
      change_requests: {
        Row: {
          appointment_id: string
          business_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          kind: Database["public"]["Enums"]["change_kind"]
          proposed_technician_id: string | null
          proposed_window_end: string | null
          proposed_window_start: string | null
          reason: string
          requested_by: string
          status: Database["public"]["Enums"]["change_status"]
        }
        Insert: {
          appointment_id: string
          business_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          kind: Database["public"]["Enums"]["change_kind"]
          proposed_technician_id?: string | null
          proposed_window_end?: string | null
          proposed_window_start?: string | null
          reason: string
          requested_by: string
          status?: Database["public"]["Enums"]["change_status"]
        }
        Update: {
          appointment_id?: string
          business_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["change_kind"]
          proposed_technician_id?: string | null
          proposed_window_end?: string | null
          proposed_window_start?: string | null
          reason?: string
          requested_by?: string
          status?: Database["public"]["Enums"]["change_status"]
        }
        Relationships: [
          {
            foreignKeyName: "change_requests_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_requests_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_requests_proposed_technician_id_fkey"
            columns: ["proposed_technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address_line: string
          business_id: string
          city: string
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string
          postal_code: string
        }
        Insert: {
          address_line: string
          business_id: string
          city: string
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          phone: string
          postal_code: string
        }
        Update: {
          address_line?: string
          business_id?: string
          city?: string
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string
          postal_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      inquiries: {
        Row: {
          answers: Json
          business_id: string
          created_at: string
          customer_id: string | null
          description: string
          id: string
          missing_info: string | null
          preferred_window_end: string | null
          preferred_window_start: string | null
          priority: Database["public"]["Enums"]["priority"]
          service_id: string | null
          status: Database["public"]["Enums"]["inquiry_status"]
        }
        Insert: {
          answers?: Json
          business_id: string
          created_at?: string
          customer_id?: string | null
          description: string
          id?: string
          missing_info?: string | null
          preferred_window_end?: string | null
          preferred_window_start?: string | null
          priority?: Database["public"]["Enums"]["priority"]
          service_id?: string | null
          status?: Database["public"]["Enums"]["inquiry_status"]
        }
        Update: {
          answers?: Json
          business_id?: string
          created_at?: string
          customer_id?: string | null
          description?: string
          id?: string
          missing_info?: string | null
          preferred_window_end?: string | null
          preferred_window_start?: string | null
          priority?: Database["public"]["Enums"]["priority"]
          service_id?: string | null
          status?: Database["public"]["Enums"]["inquiry_status"]
        }
        Relationships: [
          {
            foreignKeyName: "inquiries_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiries_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiries_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      job_documents: {
        Row: {
          appointment_id: string
          business_id: string
          created_at: string
          id: string
          kind: string
          storage_path: string
        }
        Insert: {
          appointment_id: string
          business_id: string
          created_at?: string
          id?: string
          kind: string
          storage_path: string
        }
        Update: {
          appointment_id?: string
          business_id?: string
          created_at?: string
          id?: string
          kind?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_documents_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_documents_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      job_events: {
        Row: {
          actor_label: string
          actor_user_id: string | null
          after: Json | null
          appointment_id: string | null
          before: Json | null
          business_id: string
          created_at: string
          id: string
          inquiry_id: string | null
          reason: string | null
          type: string
        }
        Insert: {
          actor_label: string
          actor_user_id?: string | null
          after?: Json | null
          appointment_id?: string | null
          before?: Json | null
          business_id: string
          created_at?: string
          id?: string
          inquiry_id?: string | null
          reason?: string | null
          type: string
        }
        Update: {
          actor_label?: string
          actor_user_id?: string | null
          after?: Json | null
          appointment_id?: string | null
          before?: Json | null
          business_id?: string
          created_at?: string
          id?: string
          inquiry_id?: string | null
          reason?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_events_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_events_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_events_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
        ]
      }
      job_notes: {
        Row: {
          appointment_id: string
          author_label: string
          author_user_id: string | null
          body: string
          business_id: string
          created_at: string
          id: string
        }
        Insert: {
          appointment_id: string
          author_label: string
          author_user_id?: string | null
          body: string
          business_id: string
          created_at?: string
          id?: string
        }
        Update: {
          appointment_id?: string
          author_label?: string
          author_user_id?: string | null
          body?: string
          business_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_notes_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_notes_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          appointment_id: string
          body: string
          business_id: string
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          customer_id: string
          id: string
          sent_at: string | null
          status: Database["public"]["Enums"]["notification_status"]
          status_detail: string | null
          subject: string
        }
        Insert: {
          appointment_id: string
          body: string
          business_id: string
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          customer_id: string
          id?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          status_detail?: string | null
          subject: string
        }
        Update: {
          appointment_id?: string
          body?: string
          business_id?: string
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          customer_id?: string
          id?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          status_detail?: string | null
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      resources: {
        Row: {
          business_id: string
          code: string
          id: string
          label: string
          quantity: number
        }
        Insert: {
          business_id: string
          code: string
          id?: string
          label: string
          quantity: number
        }
        Update: {
          business_id?: string
          code?: string
          id?: string
          label?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "resources_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      service_resources: {
        Row: {
          quantity: number
          resource_id: string
          service_id: string
        }
        Insert: {
          quantity?: number
          resource_id: string
          service_id: string
        }
        Update: {
          quantity?: number
          resource_id?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_resources_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_resources_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          buffer_minutes: number
          business_id: string
          code: string
          customer_description: string
          estimated_minutes: number
          id: string
          label: string
          required_skill_ids: string[]
        }
        Insert: {
          buffer_minutes?: number
          business_id: string
          code: string
          customer_description?: string
          estimated_minutes: number
          id?: string
          label: string
          required_skill_ids: string[]
        }
        Update: {
          buffer_minutes?: number
          business_id?: string
          code?: string
          customer_description?: string
          estimated_minutes?: number
          id?: string
          label?: string
          required_skill_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "services_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      skills: {
        Row: {
          business_id: string
          code: string
          id: string
          label: string
        }
        Insert: {
          business_id: string
          code: string
          id?: string
          label: string
        }
        Update: {
          business_id?: string
          code?: string
          id?: string
          label?: string
        }
        Relationships: [
          {
            foreignKeyName: "skills_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      technician_skills: {
        Row: {
          level: Database["public"]["Enums"]["skill_level"]
          skill_id: string
          technician_id: string
        }
        Insert: {
          level?: Database["public"]["Enums"]["skill_level"]
          skill_id: string
          technician_id: string
        }
        Update: {
          level?: Database["public"]["Enums"]["skill_level"]
          skill_id?: string
          technician_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "technician_skills_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technician_skills_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      technicians: {
        Row: {
          business_id: string
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_owner: boolean
          phone: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          is_owner?: boolean
          phone?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_owner?: boolean
          phone?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "technicians_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          business_id: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          business_id: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          business_id?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      working_hours: {
        Row: {
          end_time: string
          id: string
          start_time: string
          technician_id: string
          weekday: number
        }
        Insert: {
          end_time: string
          id?: string
          start_time: string
          technician_id: string
          weekday: number
        }
        Update: {
          end_time?: string
          id?: string
          start_time?: string
          technician_id?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "working_hours_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_staff_access: { Args: never; Returns: string }
      confirm_booking: {
        Args: {
          _actor_label: string
          _address_line: string
          _buffer_minutes: number
          _business_id: string
          _city: string
          _customer_id: string
          _estimated_minutes: number
          _explanation: Json
          _inquiry_id: string
          _postal_code: string
          _priority: Database["public"]["Enums"]["priority"]
          _problem_summary: string
          _required_skill_ids: string[]
          _service_id: string
          _technician_id: string
          _window_end: string
          _window_start: string
        }
        Returns: {
          access_token: string
          appointment_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_assigned: {
        Args: { _appointment_id: string; _user_id: string }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "owner" | "technician"
      appointment_status:
        | "proposed"
        | "confirmed"
        | "en_route"
        | "in_progress"
        | "delayed"
        | "completed"
        | "cancelled"
      assignment_status: "active" | "swap_requested" | "replaced"
      block_kind: "leave" | "sick" | "unavailable" | "training" | "off"
      change_kind: "reschedule" | "reassign"
      change_status: "pending" | "approved" | "rejected" | "withdrawn"
      inquiry_status:
        | "new"
        | "needs_info"
        | "qualified"
        | "offered"
        | "booked"
        | "closed_lost"
      notification_channel: "sms" | "email"
      notification_status: "pending" | "sent" | "failed"
      priority: "emergency" | "high" | "normal" | "routine"
      skill_level: "primary" | "capable"
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
      app_role: ["owner", "technician"],
      appointment_status: [
        "proposed",
        "confirmed",
        "en_route",
        "in_progress",
        "delayed",
        "completed",
        "cancelled",
      ],
      assignment_status: ["active", "swap_requested", "replaced"],
      block_kind: ["leave", "sick", "unavailable", "training", "off"],
      change_kind: ["reschedule", "reassign"],
      change_status: ["pending", "approved", "rejected", "withdrawn"],
      inquiry_status: [
        "new",
        "needs_info",
        "qualified",
        "offered",
        "booked",
        "closed_lost",
      ],
      notification_channel: ["sms", "email"],
      notification_status: ["pending", "sent", "failed"],
      priority: ["emergency", "high", "normal", "routine"],
      skill_level: ["primary", "capable"],
    },
  },
} as const
