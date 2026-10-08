import QRCode from "qrcode";

// Server-side only: import this from Server Components, never from a
// "use client" file, so the qrcode library and tokens stay off the client
// bundle.

// Matches registration_tickets_token_format in
// supabase/migrations/20260829000001_registration_tickets.sql.
const TICKET_TOKEN_PATTERN = /^[0-9A-F]{32}$/;

// The QR encodes the token and nothing else: no URL, no personal data.
export async function renderTicketQrSvg(token: string): Promise<string> {
  if (!TICKET_TOKEN_PATTERN.test(token)) {
    throw new Error("Refusing to render a QR for a malformed ticket token");
  }

  return QRCode.toString(token, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 2,
    // Dark-on-light is what door scanners expect; these are --ink and
    // --surface from globals.css (the library needs literal hex values).
    color: { dark: "#15161a", light: "#ffffff" },
  });
}
