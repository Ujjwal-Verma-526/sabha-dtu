export type UserRole = "student" | "club_admin" | "super_admin";
export type ClubMemberRole = "member" | "coordinator" | "admin";
export type ClubMemberStatus = "pending" | "approved" | "rejected";
export type EventStatus = "draft" | "published" | "cancelled" | "completed";

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          name: string;
          roll_number: string | null;
          branch: string | null;
          batch_year: number | null;
          avatar_url: string | null;
          role: UserRole;
          created_at: string;
          updated_at: string;
        };
        // Rows are created only by the handle_new_auth_user trigger — this
        // shape exists for type completeness, not because the client ever
        // calls .insert() on this table.
        Insert: {
          id: string;
          email: string;
          name: string;
          roll_number?: string | null;
          branch?: string | null;
          batch_year?: number | null;
          avatar_url?: string | null;
        };
        Update: Partial<{
          name: string;
          roll_number: string | null;
          branch: string | null;
          batch_year: number | null;
          avatar_url: string | null;
        }>;
        Relationships: [];
      };
      clubs: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          logo_url: string | null;
          category: string | null;
          instagram_handle: string | null;
          verified: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          name: string;
          slug: string;
          description?: string | null;
          logo_url?: string | null;
          category?: string | null;
          instagram_handle?: string | null;
          created_by: string;
          verified?: boolean;
        };
        Update: Partial<{
          name: string;
          slug: string;
          description: string | null;
          logo_url: string | null;
          category: string | null;
          instagram_handle: string | null;
          verified: boolean;
        }>;
        Relationships: [];
      };
      club_members: {
        Row: {
          id: string;
          club_id: string;
          user_id: string;
          role: ClubMemberRole;
          status: ClubMemberStatus;
          joined_at: string;
        };
        Insert: {
          club_id: string;
          user_id: string;
          role?: ClubMemberRole;
          status?: ClubMemberStatus;
        };
        Update: Partial<{
          role: ClubMemberRole;
          status: ClubMemberStatus;
        }>;
        Relationships: [];
      };
      events: {
        Row: {
          id: string;
          club_id: string;
          title: string;
          slug: string;
          description: string | null;
          banner_url: string | null;
          venue: string | null;
          start_at: string;
          end_at: string;
          registration_deadline: string | null;
          capacity: number | null;
          status: EventStatus;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          club_id: string;
          title: string;
          slug: string;
          description?: string | null;
          banner_url?: string | null;
          venue?: string | null;
          start_at: string;
          end_at: string;
          registration_deadline?: string | null;
          capacity?: number | null;
          status?: EventStatus;
          created_by: string;
        };
        Update: Partial<{
          title: string;
          slug: string;
          description: string | null;
          banner_url: string | null;
          venue: string | null;
          start_at: string;
          end_at: string;
          registration_deadline: string | null;
          capacity: number | null;
          status: EventStatus;
        }>;
        Relationships: [];
      };
      event_registrations: {
        Row: {
          id: string;
          event_id: string;
          user_id: string;
          ticket_code: string;
          checked_in_at: string | null;
          registered_at: string;
        };
        Insert: {
          event_id: string;
          user_id: string;
        };
        Update: Partial<{
          checked_in_at: string | null;
        }>;
        Relationships: [];
      };
      // One secret QR token per registration. Readable only by the
      // registrant (RLS); anon/authenticated have no INSERT/UPDATE/DELETE
      // privilege — rows come from the issue_registration_ticket trigger.
      // See supabase/migrations/20260829000001_registration_tickets.sql.
      registration_tickets: {
        Row: {
          registration_id: string;
          token: string;
          created_at: string;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_club_member_profiles: {
        Args: { target_club: string };
        Returns: {
          membership_id: string;
          user_id: string;
          name: string;
          avatar_url: string | null;
          role: ClubMemberRole;
          status: ClubMemberStatus;
          joined_at: string;
        }[];
      };
      get_event_registration_count: {
        Args: { target_event: string };
        Returns: number;
      };
      // The caller's own registrations with event details. Never includes
      // the ticket token — read that from registration_tickets.
      get_my_registrations: {
        Args: Record<PropertyKey, never>;
        Returns: {
          registration_id: string;
          ticket_code: string;
          checked_in_at: string | null;
          registered_at: string;
          event_id: string;
          event_title: string;
          event_slug: string;
          event_venue: string | null;
          event_start_at: string;
          event_end_at: string;
          event_status: EventStatus;
          club_name: string;
          club_slug: string;
        }[];
      };
    };
  };
}
