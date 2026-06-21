import { copyFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const source = "node_modules/@embedpdf/snippet/dist/pdfium.wasm";
const target = "public/embedpdf/pdfium.wasm";

mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
