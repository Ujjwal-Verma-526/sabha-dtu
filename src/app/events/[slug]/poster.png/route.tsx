import { ImageResponse } from "next/og";
import { categoryKey, categoryLabel, categoryPosterColors } from "@/lib/categories";
import { eventWhenWhere } from "@/lib/event-share";
import { getPublicEventForShare } from "@/lib/public-event";

// The link-preview image for an event without a banner (the event page's Open
// Graph / Twitter image points here; an event with a banner uses the banner).
// 1200x630, the auto-poster's category colour, in the default font Next ships
// with ImageResponse (Geist, regular weight only).

const WIDTH = 1200;
const HEIGHT = 630;
const SAFFRON = "#ff9933";

const DOT_PITCH = 30;
const DOT_SIZE = 6;
const DOT_COLUMNS = Array.from({ length: WIDTH / DOT_PITCH }, (_, i) => i);
const DOT_ROWS = Array.from({ length: 9 }, (_, i) => i);

/** "#1a5fb4" → "rgba(26, 95, 180, 0.5)" */
function withAlpha(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
 * Drops what the image's font can't draw (other scripts, emoji), which would
 * show as empty boxes. Latin letters, digits, punctuation and symbols stay.
 */
function drawable(text: string): string {
  return text
    .replace(/[\p{Extended_Pictographic}‍️]/gu, "")
    .replace(/[^\p{Script=Latin}\p{N}\p{P}\p{Zs}\p{Sc}\p{Sm}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function clamp(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function titleSize(title: string): number {
  if (title.length <= 24) return 108;
  if (title.length <= 48) return 88;
  return 68;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const event = await getPublicEventForShare(slug);
  if (!event) {
    return new Response("Event not found", { status: 404 });
  }

  const category = categoryKey(event.category);
  const { bg, fg } = categoryPosterColors(category);
  const club = drawable(event.clubName ?? "") || "A DTU society";
  const title = clamp(drawable(event.title) || "Event on Sabha", 90);
  const whenWhere = clamp(drawable(eventWhenWhere(event)), 90);

  const image = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          backgroundColor: bg,
          color: fg,
        }}
      >
        {/* a dot grid across the top that fades out well above the text, so the text sits on the solid colour */}
        {DOT_ROWS.map((row) => (
          <div
            key={row}
            style={{
              position: "absolute",
              top: DOT_PITCH * row + DOT_PITCH / 2 - DOT_SIZE / 2,
              left: 0,
              width: WIDTH,
              height: DOT_SIZE,
              display: "flex",
              justifyContent: "space-between",
              padding: `0 ${DOT_PITCH / 2 - DOT_SIZE / 2}px`,
            }}
          >
            {DOT_COLUMNS.map((column) => (
              <div
                key={column}
                style={{
                  width: DOT_SIZE,
                  height: DOT_SIZE,
                  borderRadius: DOT_SIZE,
                  backgroundColor: withAlpha(fg, 0.3 * (1 - row / DOT_ROWS.length)),
                }}
              />
            ))}
          </div>
        ))}

        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: WIDTH,
            height: HEIGHT,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "56px 72px 60px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", fontSize: 40 }}>
              <div
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 8,
                  // saffron vanishes on the marigold poster
                  backgroundColor: category === "entrepreneurship" ? fg : SAFFRON,
                  marginRight: 14,
                }}
              />
              Sabha
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 26,
                letterSpacing: 2,
                textTransform: "uppercase",
                border: `2px solid ${fg}`,
                borderRadius: 999,
                padding: "8px 22px",
              }}
            >
              {categoryLabel(category)}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 28, letterSpacing: 4, textTransform: "uppercase" }}>
              {club}
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 14,
                fontSize: titleSize(title),
                lineHeight: 1.02,
                letterSpacing: -2,
                lineClamp: 3,
              }}
            >
              {title}
            </div>
            <div style={{ display: "flex", marginTop: 34, fontSize: 34 }}>{whenWhere}</div>
          </div>
        </div>
      </div>
    ),
    { width: WIDTH, height: HEIGHT },
  );

  // Crawlers ask repeatedly; a changed title or time shows up within the hour.
  image.headers.set("Cache-Control", "public, max-age=300, s-maxage=3600");
  return image;
}
