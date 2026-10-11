// Copies the ZXing reader wasm (used by the door scanner's QR fallback, see
// src/components/checkin/CameraScanner.tsx) from node_modules into
// public/vendor/zxing/<version>/, so it is served from our own origin
// instead of the library's default CDN. Runs on predev and prebuild.
// The version folder keeps a browser from using a cached wasm after an
// upgrade. public/vendor/zxing/ is gitignored.

import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgDir = join(root, "node_modules", "zxing-wasm");
const source = join(pkgDir, "dist", "reader", "zxing_reader.wasm");

if (!existsSync(source)) {
  console.error(`copy-zxing-wasm: ${source} not found. Run npm install first.`);
  process.exit(1);
}

const { version } = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
const targetDir = join(root, "public", "vendor", "zxing", version);
mkdirSync(targetDir, { recursive: true });
copyFileSync(source, join(targetDir, "zxing_reader.wasm"));
console.log(`copy-zxing-wasm: zxing_reader.wasm ${version} -> public/vendor/zxing/${version}/`);
