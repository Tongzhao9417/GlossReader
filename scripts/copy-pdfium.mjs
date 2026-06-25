import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

// 1) PDFium WASM engine.
const wasmSource = "node_modules/@embedpdf/snippet/dist/pdfium.wasm";
const wasmTarget = "public/embedpdf/pdfium.wasm";
mkdirSync(dirname(wasmTarget), { recursive: true });
copyFileSync(wasmSource, wasmTarget);

// 2) Simplified Chinese fallback fonts (@embedpdf/fonts-sc).
// PDFium-WASM ships no CJK fonts and cannot read system fonts, so PDFs that do
// not embed their Chinese fonts (e.g. CNKI exports) render blank without these.
// The file list is taken from the package's own manifest so it can never drift
// from what the package actually ships.
const { fonts: scFonts } = await import("@embedpdf/fonts-sc");
const scPkgRoot = join(dirname(require.resolve("@embedpdf/fonts-sc")), "..");
const scSourceDir = join(scPkgRoot, "fonts");
const scTargetDir = "public/embedpdf/fonts/sc";
mkdirSync(scTargetDir, { recursive: true });
for (const { file } of scFonts) {
  copyFileSync(join(scSourceDir, file), join(scTargetDir, file));
}

console.log(
  `Copied pdfium.wasm and ${scFonts.length} Simplified Chinese font(s) to public/embedpdf/`,
);
