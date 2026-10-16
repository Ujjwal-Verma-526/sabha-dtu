// One-off: builds the Sabha app icon from the "सभा" mark.
//   node scripts/build-logo-icons.mjs
// Outputs (committed): src/app/icon.svg (the Devanagari outlined to a path, so
// no <text> and no font dependency), src/app/apple-icon.png (180, full-bleed
// because iOS rounds it itself) and src/app/favicon.ico (16/32/48).
// Dev dependencies only: opentype.js (outlining) and sharp (rasterising); the
// Mukta font is the committed src/assets/fonts file. Colours are read from globals.css so
// they can't drift from the tokens. Geometry matches src/components/ui/Logo.tsx.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import opentype from "opentype.js";
import sharp from "sharp";

const root = new URL("../", import.meta.url);
const at = (p) => fileURLToPath(new URL(p, root));

const css = readFileSync(at("src/app/globals.css"), "utf8");
const lightTokens = css.slice(
  css.indexOf("\n:root"),
  css.indexOf("@media (prefers-color-scheme: dark)"),
);
const token = (name) => {
  const m = lightTokens.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`token --${name} not found in globals.css`);
  return m[1];
};
const ACCENT = token("primary");
const SAFFRON = token("saffron");

const buf = readFileSync(at("src/assets/fonts/Mukta-ExtraBold-devanagari.woff"));
const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

// "स" at font-size 66, centred on x=45 (text-anchor middle), baseline y=76.
const GLYPH = "स";
const FONT_SIZE = 66;
const width = font.getAdvanceWidth(GLYPH, FONT_SIZE);
const path = font.getPath(GLYPH, 45 - width / 2, 76, FONT_SIZE).toPathData(2);
if (!path || path.length < 20) throw new Error("glyph outline is empty");

const svg = (radius) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">` +
  `<rect width="100" height="100" rx="${radius}" fill="${ACCENT}"/>` +
  `<path d="${path}" fill="#ffffff"/>` +
  `<rect x="74" y="40" width="8" height="30" rx="4" fill="${SAFFRON}"/>` +
  `</svg>\n`;

const iconSvg = svg(22);
if (/<text/i.test(iconSvg)) throw new Error("icon.svg must not contain <text>");
writeFileSync(at("src/app/icon.svg"), iconSvg);

const png = (markup, size) =>
  sharp(Buffer.from(markup), { density: (72 * size) / 100 })
    .resize(size, size)
    .png()
    .toBuffer();

writeFileSync(at("src/app/apple-icon.png"), await png(svg(0), 180));

// ICO container around PNG images (supported everywhere that matters).
const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map((s) => png(iconSvg, s)));
const header = Buffer.alloc(6);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = 6 + 16 * sizes.length;
const entries = images.map((img, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(sizes[i], 0);
  e.writeUInt8(sizes[i], 1);
  e.writeUInt16LE(1, 4); // colour planes
  e.writeUInt16LE(32, 6); // bits per pixel
  e.writeUInt32LE(img.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += img.length;
  return e;
});
writeFileSync(at("src/app/favicon.ico"), Buffer.concat([header, ...entries, ...images]));

console.log(`icon.svg path ${path.length} chars; accent ${ACCENT}, saffron ${SAFFRON}`);
