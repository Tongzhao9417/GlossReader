# Persist native PDF annotations by saving into the file

## Goal

Highlights, underlines, ink strokes, shapes, and other marks made with the
Annotate/Shapes toolbars vanish when the document is closed: GlossReader never
persists them anywhere. Save them into the PDF file itself so they survive
reopen, are visible in Zotero / Preview / any reader, and travel with the file
when it is copied or relinked.

## Background

- User report 2026-07-31/08-01: "我对某一段话进行了highlight，在打开之后就没有了."
  Confirmed by code inspection: `App.tsx` never touches the EmbedPDF annotation
  plugin. Marks live only in the in-memory PDFium document; reopening reloads
  the original bytes from disk.
- This is distinct from AI gloss annotations / side translations, which already
  persist via localStorage (see `.trellis/spec/frontend/annotation-persistence.md`).
- API groundwork verified in `@embedpdf` v2.14.4 dists:
  - annotation plugin (`id: "annotation"`): `onAnnotationEvent`, `onStateChange`,
    per-document `commit()` (flushes pending changes into the PDFium doc,
    Task-based, no-op when clean), state carries `hasPendingChanges`.
  - export plugin (`id: "export"`): `saveAsCopy()` → Task resolving to the full
    PDF buffer including committed annotations.
  - The Rust side only has `read_file_binary`; a write command must be added.

## Requirements

- R1: After the user creates, edits, moves, or deletes a native annotation in a
  document opened from a file path, the file on disk is updated automatically
  (debounced ~1s after the last change; no manual save button).
- R2: Writing is atomic: write to a temp file in the same directory, then rename
  over the original. A failed save must never truncate or corrupt the original.
- R3: The buffer is sanity-checked before replacing the file (starts with
  `%PDF-`, non-trivial length) so a bad export cannot clobber a good file.
- R4: Closing a tab (or switching away such that the viewer unmounts) with
  unsaved annotation changes flushes the save first, guarded by a timeout so a
  stuck save cannot block closing indefinitely.
- R5: Documents without a file path (browser-mode file input) are skipped
  silently — no save attempted, no error surfaced.
- R6: Save failures (read-only file, missing path, engine error) surface a
  visible, dismissible error in the UI (reuse the existing error surface), and
  the app keeps working; the next annotation change retries.
- R7: Reopening the saved file shows the annotations natively (rendered by
  PDFium) and they remain editable/deletable through the existing UI.
- R8: Gloss annotations and side translations are unaffected (separate DOM
  overlay pipeline; no behavior change).

## Acceptance Criteria

- [x] `npx tsc --noEmit` passes; `cargo check` (and clippy on touched code) passes.
- [x] Runtime harness (WKWebView dev shell): create a highlight programmatically
      → within ~2s the file on disk changes (size/mtime) and still starts with
      `%PDF-` → relaunch → the annotation plugin reports the highlight present
      on its page, and it renders. (Verified: count 99→100, file rewritten,
      relaunch count 100.)
- [x] Deleting the highlight and waiting for the debounced save → relaunch →
      annotation gone from the file. (Verified via deleteAllAnnotations:
      relaunch count 0, /Highlight marker gone.)
- [x] Original file remains intact when the write target directory is made
      unwritable (error surfaced 保存批注到文件失败：Permission denied; sha of
      the original unchanged; no temp litter).
- [x] Gloss annotations on the same document still load and render after a
      native-annotation save cycle (gloss overlay count stable at 1 through
      create+save).

## Out of Scope

- Persisting form field values, signatures, or redaction applies (separate flows).
- Conflict handling when another program modifies the PDF while it is open in
  GlossReader (last writer wins).
- A backup/versioning scheme for annotated PDFs (OneDrive versioning covers it).
- An explicit manual "Save" UI affordance.
- Migrating previously lost annotations (nothing was ever persisted).
