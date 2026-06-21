# GlossReader

A desktop academic PDF reader with AI-powered inline annotations. Like medieval scribes glossing manuscripts, GlossReader renders word definitions directly above unfamiliar terms using ruby text — domain-aware, so "power" becomes "统计检验力" in a psychology paper but "权力" in political science.

Built with Tauri v2 + React 19. ~10MB bundle, native performance.

## Features

- **PDF rendering** — PDFium WASM engine via EmbedPDF, handles complex academic layouts (two-column, equations, tables)
- **AI glossing** — Select a word or phrase, get a context-aware definition rendered inline as ruby text
- **Sentence translation** — Select a sentence, get a side-panel translation
- **Domain-aware definitions** — Supports psychology, cognitive neuroscience, CS, medicine, economics, statistics (auto-detect or manual)
- **Multi-provider AI** — Anthropic Claude, OpenAI, DeepSeek, or local Ollama
- **Multi-tab viewer** — Open multiple PDFs with tab switching
- **Annotation persistence** — Glosses saved to localStorage, survive across sessions
- **Customizable display** — Font size, color, opacity for both glosses and translations
- **Custom prompts** — Override the default prompt templates for glossing and translation
- **Auto-update** — Built-in updater via GitHub Releases
- **Multiple target languages** — Chinese, English, Japanese

## Install

Download the latest release for your platform from [GitHub Releases](https://github.com/Tongzhao9417/GlossReader/releases).

| Platform | Format |
|---|---|
| macOS | `.dmg` |
| Windows | `.msi` / `.exe` |
| Linux | `.deb` / `.AppImage` |

## Usage

1. Open a PDF — drag-and-drop onto the window, or click "Select File"
2. Go to Settings (gear icon) and configure your AI provider + API key
3. Select a word in the PDF — right-click and choose "Gloss" to get an inline definition
4. Select a sentence — right-click and choose "Translate" for a side-panel translation
5. Glosses persist across sessions; right-click an annotation to edit or remove it

### Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl + C` | Copy selected text |

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://www.rust-lang.org/tools/install) toolchain
- [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/)

### Setup

```bash
# Install dependencies (also copies pdfium.wasm to public/embedpdf/)
npm install

# Run in dev mode (frontend hot reload + Tauri backend)
npm run tauri dev

# Frontend only (without Tauri shell, for UI iteration)
npm run dev
```

### Build

```bash
# Production build
npm run tauri build

# Type checks
npx tsc --noEmit
cd src-tauri && cargo clippy
```

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Tauri v2 (Rust) |
| PDF rendering | EmbedPDF / PDFium WASM |
| Frontend | React 19, TypeScript, Vite 7 |
| AI | OpenAI-compatible API (Claude, GPT, DeepSeek, Ollama) |

## License

MIT
