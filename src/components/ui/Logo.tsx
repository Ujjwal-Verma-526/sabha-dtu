import { Mukta } from "next/font/google";
import { cn } from "@/lib/utils";

// The one place the Sabha mark is drawn: "सभा" in the accent colour, a saffron
// danda, then "sabha" in ink. Saffron appears only on the danda. Every size is
// in em, so the whole lockup scales from a single font size (the Devanagari's).
// The app icon, favicons and link-preview poster repeat this geometry
// (scripts/build-logo-icons.mjs, src/app/events/[slug]/poster.png/route.tsx);
// change them together.

// Self-hosted by next/font; only the Devanagari subset, only this weight.
const mukta = Mukta({
  subsets: ["devanagari"],
  weight: "800",
  display: "swap",
});

type LogoProps = {
  /** "full" has the divider (landing, larger placements); "compact" doesn't (header, footer). */
  variant?: "full" | "compact";
  /** Devanagari font size in px. */
  size?: number;
  className?: string;
};

const DEFAULT_SIZE = { full: 56, compact: 26 } as const;

export function Logo({ variant = "compact", size, className }: LogoProps) {
  const fontSize = size ?? DEFAULT_SIZE[variant];

  return (
    <span
      role="img"
      aria-label="Sabha"
      className={cn("inline-flex items-end leading-none select-none", className)}
      style={{ fontSize }}
    >
      <span
        aria-hidden="true"
        lang="hi"
        className={cn(mukta.className, "text-primary")}
        style={{ fontWeight: 800, lineHeight: 1 }}
      >
        सभा
      </span>
      {/* the danda: ~0.1em wide, 0.52em tall, riding the lower third */}
      <span
        aria-hidden="true"
        className="bg-saffron"
        style={{
          width: "0.098em",
          height: "0.518em",
          borderRadius: "0.054em",
          marginLeft: "0.09em",
          marginBottom: "0.196em",
        }}
      />
      {variant === "full" && (
        <span
          aria-hidden="true"
          className="self-center bg-line"
          style={{ width: 2, height: "0.7em", marginInline: "0.22em" }}
        />
      )}
      <span
        aria-hidden="true"
        className="text-ink"
        style={{
          fontFamily: "var(--font-bricolage), sans-serif",
          fontWeight: 800,
          letterSpacing: "-0.045em",
          fontSize: "0.57em",
          lineHeight: 1,
          marginLeft: variant === "full" ? 0 : "0.35em",
          marginBottom: "0.2em",
        }}
      >
        sabha
      </span>
    </span>
  );
}
