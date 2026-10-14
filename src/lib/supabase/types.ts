export type UserRole = "student" | "club_admin" | "super_admin";
export type ClubMemberRole = "member" | "coordinator" | "admin";
export type ClubMemberStatus = "pending" | "approved" | "rejected";
export type EventStatus = "draft" | "published" | "cancelled" | "completed";
export type CheckInMethod = "scan" | "manual";

// Every outcome the door check-in RPCs can return. The first four come from
// check_in_by_token / manual_check_in, the gate outcomes from check_in_gate
// (all three RPCs), the last two from undo_check_in.
// See supabase/migrations/20260830000001_door_checkin.sql.
export type CheckInOutcome =
  | "checked_in"
  | "already_checked_in"
  | "wrong_event"
  | "invalid_token"
  | "not_authorized"
  | "event_cancelled"
  | "event_not_published"
  | "event_ended"
  | "too_early"
  | "undone"
  | "not_checked_in";

// One row from check_in_by_token / manual_check_in / undo_check_in.
// registration_id and attendee_name are only filled for checked_in,
// already_checked_in and undone; checked_in_at only for the first two.
export type CheckInResult = {
  outcome: CheckInOutcome;
  registration_id: string | null;
  attendee_name: string | null;
  checked_in_at: string | null;
};

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
          category: string;
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
          category?: string;
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
          category: string;
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
          // Null for check-ins made before 20260830000001, and when the
          // checker's account was deleted.
          checked_in_by: string | null;
          check_in_method: CheckInMethod | null;
          registered_at: string;
        };
        Insert: {
          event_id: string;
          user_id: string;
        };
        // Check-in changes only through check_in_by_token / manual_check_in /
        // undo_check_in (a trigger refuses direct writes), and nothing else
        // on a registration is edited from the app.
        Update: Record<string, never>;
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
      // Door check-in. Each returns exactly one row; see CheckInResult.
      check_in_by_token: {
        Args: { p_event_id: string; p_token: string };
        Returns: CheckInResult[];
      };
      manual_check_in: {
        Args: { p_registration_id: string };
        Returns: CheckInResult[];
      };
      undo_check_in: {
        Args: { p_registration_id: string };
        Returns: CheckInResult[];
      };
      // Names and check-in state for one event; empty unless the caller
      // manages that event's club or is a super_admin. No token, email or
      // user id.
      get_event_check_in_list: {
        Args: { p_event_id: string };
        Returns: {
          registration_id: string;
          name: string;
          checked_in_at: string | null;
          check_in_method: CheckInMethod | null;
        }[];
      };
    };
  };
}
