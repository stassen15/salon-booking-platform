export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type BookingStatus =
  | "pending"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "no_show";

export type PaymentStatus = "unpaid" | "deposit_submitted" | "paid_in_full";

export type NotificationStatus = "queued" | "sent" | "failed";

export type NotificationType = "confirmation" | "reminder_24h" | "reminder_2h";

export interface Database {
  public: {
    Tables: {
      salons: {
        Row: {
          id: string;
          created_at: string;
          owner_id: string;
          slug: string;
          name: string;
          phone: string;
          address: string;
          district: string;
          juice_phone: string | null;
          juice_account_name: string | null;
          currency: string;
          is_active: boolean;
          logo_url: string | null;
          brand_color: string;
          booking_title: string | null;
          cancellation_policy: string | null;
          deposit_deadline_minutes: number;
          timezone: string;
        };
        Insert: {
          id?: string;
          created_at?: string;
          owner_id: string;
          slug: string;
          name: string;
          phone: string;
          address: string;
          district: string;
          juice_phone?: string | null;
          juice_account_name?: string | null;
          currency?: string;
          is_active?: boolean;
          logo_url?: string | null;
          brand_color?: string;
          booking_title?: string | null;
          cancellation_policy?: string | null;
          deposit_deadline_minutes?: number;
          timezone?: string;
        };
        Update: {
          id?: string;
          created_at?: string;
          owner_id?: string;
          slug?: string;
          name?: string;
          phone?: string;
          address?: string;
          district?: string;
          juice_phone?: string | null;
          juice_account_name?: string | null;
          currency?: string;
          is_active?: boolean;
          logo_url?: string | null;
          brand_color?: string;
          booking_title?: string | null;
          cancellation_policy?: string | null;
          deposit_deadline_minutes?: number;
          timezone?: string;
        };
        Relationships: [
          {
            foreignKeyName: "salons_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      staff: {
        Row: {
          id: string;
          salon_id: string;
          name: string;
          phone: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          name: string;
          phone?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          name?: string;
          phone?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "staff_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
            referencedColumns: ["id"];
          },
        ];
      };
      services: {
        Row: {
          id: string;
          salon_id: string;
          name: string;
          description: string | null;
          duration_minutes: number;
          price_mur: number;
          deposit_required_mur: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          name: string;
          description?: string | null;
          duration_minutes: number;
          price_mur: number;
          deposit_required_mur?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          name?: string;
          description?: string | null;
          duration_minutes?: number;
          price_mur?: number;
          deposit_required_mur?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "services_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
            referencedColumns: ["id"];
          },
        ];
      };
      working_hours: {
        Row: {
          id: string;
          salon_id: string;
          staff_id: string | null;
          day_of_week: number;
          start_time: string;
          end_time: string;
          is_closed: boolean;
        };
        Insert: {
          id?: string;
          salon_id: string;
          staff_id?: string | null;
          day_of_week: number;
          start_time: string;
          end_time: string;
          is_closed?: boolean;
        };
        Update: {
          id?: string;
          salon_id?: string;
          staff_id?: string | null;
          day_of_week?: number;
          start_time?: string;
          end_time?: string;
          is_closed?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "working_hours_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "working_hours_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
        ];
      };
      bookings: {
        Row: {
          id: string;
          salon_id: string;
          staff_id: string;
          service_id: string;
          customer_name: string;
          customer_phone: string;
          start_time: string;
          end_time: string;
          booking_range: string;
          status: BookingStatus;
          payment_status: PaymentStatus;
          juice_reference: string | null;
          juice_proof_url: string | null;
          notes: string | null;
          created_at: string;
          expires_at: string | null;
          payment_verified_at: string | null;
          payment_rejection_reason: string | null;
          cancellation_token_hash: string | null;
          customer_id: string | null;
          deposit_required_mur: number;
          cancellation_reason: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
        };
        Insert: {
          id?: string;
          salon_id: string;
          staff_id: string;
          service_id: string;
          customer_name: string;
          customer_phone: string;
          start_time: string;
          end_time: string;
          status?: BookingStatus;
          payment_status?: PaymentStatus;
          juice_reference?: string | null;
          juice_proof_url?: string | null;
          notes?: string | null;
          created_at?: string;
          expires_at?: string | null;
          payment_verified_at?: string | null;
          payment_rejection_reason?: string | null;
          cancellation_token_hash?: string | null;
          customer_id?: string | null;
          deposit_required_mur?: number;
          cancellation_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
        };
        Update: {
          id?: string;
          salon_id?: string;
          staff_id?: string;
          service_id?: string;
          customer_name?: string;
          customer_phone?: string;
          start_time?: string;
          end_time?: string;
          status?: BookingStatus;
          payment_status?: PaymentStatus;
          juice_reference?: string | null;
          juice_proof_url?: string | null;
          notes?: string | null;
          created_at?: string;
          expires_at?: string | null;
          payment_verified_at?: string | null;
          payment_rejection_reason?: string | null;
          cancellation_token_hash?: string | null;
          customer_id?: string | null;
          deposit_required_mur?: number;
          cancellation_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "bookings_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id"];
          },
        ];
      };
      customers: {
        Row: { id: string; salon_id: string; name: string; phone: string; phone_normalized: string; notes: string | null; marketing_consent: boolean; created_at: string; updated_at: string; no_show_count: number; trust_tier: string };
        Insert: { id?: string; salon_id: string; name: string; phone: string; phone_normalized: string; notes?: string | null; marketing_consent?: boolean; created_at?: string; updated_at?: string; no_show_count?: number; trust_tier?: string };
        Update: { id?: string; salon_id?: string; name?: string; phone?: string; phone_normalized?: string; notes?: string | null; marketing_consent?: boolean; created_at?: string; updated_at?: string; no_show_count?: number; trust_tier?: string };
        Relationships: [];
      };
      staff_services: {
        Row: { staff_id: string; service_id: string; created_at: string };
        Insert: { staff_id: string; service_id: string; created_at?: string };
        Update: { staff_id?: string; service_id?: string; created_at?: string };
        Relationships: [];
      };
      salon_closures: {
        Row: { id: string; salon_id: string; staff_id: string | null; starts_at: string; ends_at: string; reason: string | null; created_at: string };
        Insert: { id?: string; salon_id: string; staff_id?: string | null; starts_at: string; ends_at: string; reason?: string | null; created_at?: string };
        Update: { id?: string; salon_id?: string; staff_id?: string | null; starts_at?: string; ends_at?: string; reason?: string | null; created_at?: string };
        Relationships: [];
      };
      booking_events: {
        Row: { id: string; booking_id: string; salon_id: string; actor_id: string | null; event_type: string; from_status: BookingStatus | null; to_status: BookingStatus | null; from_payment_status: PaymentStatus | null; to_payment_status: PaymentStatus | null; metadata: Json; created_at: string };
        Insert: { id?: string; booking_id: string; salon_id: string; actor_id?: string | null; event_type: string; from_status?: BookingStatus | null; to_status?: BookingStatus | null; from_payment_status?: PaymentStatus | null; to_payment_status?: PaymentStatus | null; metadata?: Json; created_at?: string };
        Update: { id?: string; booking_id?: string; salon_id?: string; actor_id?: string | null; event_type?: string; from_status?: BookingStatus | null; to_status?: BookingStatus | null; from_payment_status?: PaymentStatus | null; to_payment_status?: PaymentStatus | null; metadata?: Json; created_at?: string };
        Relationships: [];
      };
      salon_subscriptions: {
        Row: { id: string; salon_id: string; plan: string; status: string; provider: string | null; provider_customer_id: string | null; provider_subscription_id: string | null; trial_ends_at: string | null; current_period_ends_at: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; salon_id: string; plan?: string; status?: string; provider?: string | null; provider_customer_id?: string | null; provider_subscription_id?: string | null; trial_ends_at?: string | null; current_period_ends_at?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; salon_id?: string; plan?: string; status?: string; provider?: string | null; provider_customer_id?: string | null; provider_subscription_id?: string | null; trial_ends_at?: string | null; current_period_ends_at?: string | null; created_at?: string; updated_at?: string };
        Relationships: [];
      };
      deposit_rules: {
        Row: { id: string; salon_id: string; day_of_week: number | null; starts_at: string | null; ends_at: string | null; amount_mur: number; applies_to_first_visit: boolean; applies_to_blacklisted: boolean; priority: number; is_active: boolean; created_at: string };
        Insert: { id?: string; salon_id: string; day_of_week?: number | null; starts_at?: string | null; ends_at?: string | null; amount_mur: number; applies_to_first_visit?: boolean; applies_to_blacklisted?: boolean; priority?: number; is_active?: boolean; created_at?: string };
        Update: { id?: string; salon_id?: string; day_of_week?: number | null; starts_at?: string | null; ends_at?: string | null; amount_mur?: number; applies_to_first_visit?: boolean; applies_to_blacklisted?: boolean; priority?: number; is_active?: boolean; created_at?: string };
        Relationships: [];
      };
      notification_queue: {
        Row: {
          id: string;
          booking_id: string;
          salon_id: string;
          recipient_phone: string;
          notification_type: NotificationType;
          scheduled_for: string;
          status: NotificationStatus;
          sent_at: string | null;
          meta_message_id: string | null;
          error_payload: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          booking_id: string;
          salon_id: string;
          recipient_phone: string;
          notification_type: NotificationType;
          scheduled_for: string;
          status?: NotificationStatus;
          sent_at?: string | null;
          meta_message_id?: string | null;
          error_payload?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          booking_id?: string;
          salon_id?: string;
          recipient_phone?: string;
          notification_type?: NotificationType;
          scheduled_for?: string;
          status?: NotificationStatus;
          sent_at?: string | null;
          meta_message_id?: string | null;
          error_payload?: Json | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notification_queue_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notification_queue_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      is_salon_owner: {
        Args: { p_salon_id: string };
        Returns: boolean;
      };
      salon_is_publicly_active: {
        Args: { p_salon_id: string };
        Returns: boolean;
      };
    };
    Enums: {
      booking_status: BookingStatus;
      payment_status: PaymentStatus;
      notification_status: NotificationStatus;
      notification_type: NotificationType;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];

export type Enums<T extends keyof Database["public"]["Enums"]> =
  Database["public"]["Enums"][T];

export type Salon = Tables<"salons">;
export type Staff = Tables<"staff">;
export type Service = Tables<"services">;
export type WorkingHour = Tables<"working_hours">;
export type Booking = Tables<"bookings">;
export type NotificationQueueItem = Tables<"notification_queue">;
