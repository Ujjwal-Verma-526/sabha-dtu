// The QR ticket token format, shared by the server (rendering QRs) and the
// door scanner (rejecting non-ticket QRs before calling the server).
// Matches registration_tickets_token_format in
// supabase/migrations/20260829000001_registration_tickets.sql; the
// normalization matches check_in_by_token in 20260830000001_door_checkin.sql.

export const TICKET_TOKEN_PATTERN = /^[0-9A-F]{32}$/;

/** Trims whitespace/newlines (scanners add them) and uppercases. */
export function normalizeTicketToken(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isTicketToken(raw: string): boolean {
  return TICKET_TOKEN_PATTERN.test(normalizeTicketToken(raw));
}
