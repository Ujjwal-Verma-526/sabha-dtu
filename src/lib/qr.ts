import QRCode from "qrcode";
import { TICKET_TOKEN_PATTERN } from "@/lib/ticket-token";

// Server-side only: import this from Server Components, never from a
// "use client" file, so the qrcode library and tokens stay off the client
// bundle.

// The QR encodes the token and nothing else: no URL, no personal data.
export async function renderTicketQrSvg(token: string): Promise<string> {
  if (!TICKET_TOKEN_PATTERN.test(token)) {
    throw new Error("Refusing to render a QR for a malformed ticket token");
  }

  return QRCode.toString(token, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 2,
    // Pure black on white, the most contrast a door camera can get. The
    // ticket card is white in both themes (.theme-light in globals.css).
    color: { dark: "#000000", light: "#ffffff" },
  });
}
