# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GlossReader is a desktop academic PDF reader with AI-powered inline annotations. It renders glosses (word definitions) above unfamiliar words using HTML `<ruby>` text, similar to how medieval scribes annotated manuscripts. Definitions are domain-aware — the same English word gets different Chinese translations depending on the paper's field (e.g., "power" → "统计检验力" in psychology vs "权力" in political science).

## Tech Stack

- **Desktop shell**: Tauri v2 (Rust backend, ~10MB bundle)
- **PDF rendering**: EmbedPDF (`@embedpdf/react-pdf-viewer` v2.14.4) — PDFium WASM engine with React bindings and plugin system
- **Frontend**: React 19 + TypeScript, Vite 7
- **AI**: Claude API for domain-aware definitions; optional Ollama for offline fallback (not yet implemented)
- **Storage**: SQLite via Tauri for vocabulary, definition cache, paper metadata (not yet implemented)

## Build & Dev Commands

```bash
# Install dependencies (also copies pdfium.wasm to public/embedpdf/ via postinstall)
npm install

# Dev server (frontend hot reload + Tauri backend)
npm run tauri dev

# Build production app
npm run tauri build

# Frontend only (without Tauri shell, for UI dev)
npm run dev

# TypeScript type check
npx tsc --noEmit

# Rust backend checks
cd src-tauri && cargo check
cd src-tauri && cargo clippy
```

## Architecture

Two-layer design:

1. **Frontend (React + EmbedPDF)**: Multi-tab PDF viewer with PDFium WASM rendering. Plugin-based text selection with custom word boundary logic. ShadowRoot CSS injection for selection styling.

2. **Backend (Tauri/Rust)**: Provides `read_file_binary` command for loading PDFs from disk via `tauri::ipc::Response` (zero-copy binary transfer). File dialog via `tauri-plugin-dialog`.

### File Structure

```
src/
├── App.tsx              — Main component (~1000 lines). Tab management, PDF viewer,
│                          selection, context menu, file opening, keyboard shortcuts.
├── App.css              — All styling (tabs, home screen, context menu, drag-drop)
├── main.tsx             — React DOM entry point
└── lib/
    └── tauriCommands.ts — Typed wrappers for Tauri dialog and IPC commands

src-tauri/src/
├── main.rs              — Tauri app entry point
└── lib.rs               — read_file_binary command + plugin registration

public/embedpdf/
└── pdfium.wasm          — PDFium WASM binary (~4.4MB, copied by postinstall)
```

### EmbedPDF Integration

The PDF viewer uses `@embedpdf/react-pdf-viewer` with this configuration:
- **Rendering**: PDFium via WASM (`/embedpdf/pdfium.wasm`), no Web Worker
- **Zoom**: Fit-width by default (`ZoomMode.FitWidth`)
- **Theme**: Light, no tab bar (custom tab UI), 12px page gap
- **Selection**: Plugin registry provides `SelectionCapability` for text extraction
- **Word boundaries**: Custom patching via `selectWord()` override — trims non-word characters using `\p{L}\p{N}` Unicode patterns

### Data Flow: Opening a PDF

```
User drag-drops PDF / clicks "Select File"
  → openPdfFiles() [Tauri dialog] OR File input [browser]
  → readPdfFile(filePath) → ArrayBuffer via IPC
  → pdfResultToSource() → { name, data, filePath }
  → addPdfSources() → Create Blob URL
  → setDocuments([...docs, { id, name, url, filePath }])
  → PDFViewer renders with Blob URL as src
  → onReady → registry stored, word boundary patch applied
```

### Data Flow: Text Selection & Copy

```
User right-clicks on PDF content
  → contextmenu handler detects if click inside selection box (shadowRoot query)
  → Context menu shows with canCopy flag
  → "Copy" clicked → getSelectedText() via SelectionCapability
  → normalizeCopiedPdfText(): fix soft hyphens, line breaks, whitespace
  → navigator.clipboard.writeText()
```

## Key Design Decisions

- **EmbedPDF over PDF.js**: React-native integration with plugin-based APIs (selection, zoom). PDFium WASM provides better rendering fidelity for complex academic PDFs.
- **Blob URLs for PDF sources**: PDFs loaded into memory are wrapped in Blob URLs and revoked on close, preventing memory leaks.
- **Custom word boundary patching**: Intercepts EmbedPDF's `selectWord()` to trim non-letter/non-number characters before applying selection.
- **ShadowRoot CSS injection**: EmbedPDF renders inside Shadow DOM; selection color override (`#CCDEF7`) injected via `adoptedStyleSheets`.
- **No Web Worker for WASM**: `worker: false` — PDFium runs on main thread for simplicity.
- **Custom Rust command for file reading** (not `tauri-plugin-fs`): avoids scope configuration for arbitrary file paths.
- **Single-component architecture**: All logic in App.tsx for now — appropriate for current complexity; will decompose when AI/annotation features are added.

## Features Implemented

- Multi-tab PDF viewer with tab switching/closing
- File opening via Tauri native dialog + browser drag-drop
- Fit-width PDF rendering with PDFium WASM
- Text selection with Unicode-aware word boundaries
- Right-click context menu with copy
- Text copy normalization (soft hyphens, line breaks, whitespace)
- Recent documents (max 12, persisted in state)
- Home screen with drop zone + recent documents grid
- Keyboard shortcuts (Cmd+C for copy)
- Error handling and loading states

## Keyboard Shortcuts

- Cmd+C / Ctrl+C: Copy selected text from PDF

## Development Phases (from ROADMAP.md)

Phase 1 (MVP) complete — multi-tab PDF viewing with text selection and copy. Next: Phase 2 (Claude API integration, domain detection, ruby text annotations). See ROADMAP.md for details.

## Language Convention

- UI text and glosses: **Chinese** (target audience reads English papers, wants Chinese definitions)
- Code, comments, commit messages: **English**
- ROADMAP.md: Chinese (product spec)
