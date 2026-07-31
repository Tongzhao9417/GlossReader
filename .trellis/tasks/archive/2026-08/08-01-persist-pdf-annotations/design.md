# Design: persist native PDF annotations by saving into the file

## Architecture

One new frontend module plus one new Rust command; App.tsx wires lifecycle.

```
annotation events ──▶ dirty flag + debounce (1s)
                             │
                             ▼
              annotationScope.commit()  (Task; flushes pending → PDFium doc)
                             │ .wait
                             ▼
              exportCapability.saveAsCopy()  (Task → ArrayBuffer)
                             │ .wait
                             ▼
        sanity check (%PDF- header, length > 1KB)
                             │
                             ▼
   invoke("write_file_binary")  raw body = bytes, path in header
                             │
                             ▼
      Rust: write <path>.glossreader-tmp → fs::rename over <path>
```

## Frontend (`src/lib/annotationAutosave.ts` + App.tsx wiring)

- Capability access mirrors existing helpers in App.tsx:
  `registry.getPlugin("annotation")?.provides()` and
  `registry.getPlugin("export")?.provides()`. Types imported from
  `@embedpdf/plugin-annotation` / `@embedpdf/plugin-export` (present in
  node_modules as dependencies of `@embedpdf/react-pdf-viewer`; add them to
  package.json as explicit dependencies pinned to the same version so the
  imports are not relying on transitive resolution).
- A per-document autosave controller created when the viewer is ready
  (`viewerReadyRevision` effect) for documents with `filePath`:
  - Subscribes `onAnnotationEvent`; any mutating event (`create`, `update`,
    `delete`, `purge`, move/resize variants) marks dirty and (re)starts a 1s
    debounce timer. Use `setTimeout`, not rAF (occlusion-safe per
    `.trellis/spec/frontend/annotation-persistence.md` invariant 4).
  - Flush sequence: `commit().wait` → `saveAsCopy().wait` → header/length check
    → `writePdfFile(filePath, bytes)`. Failures set the existing `error` state
    (localized message) and leave the dirty flag set so the next event retries.
  - Re-entrancy: a flush in flight sets `saving = true`; events during a flush
    re-mark dirty; on completion, if dirty again → re-debounce.
  - `flushNow(timeoutMs)` returns a promise used by close paths; resolves early
    on timeout (close proceeds; changes stay only in the closed doc — accepted
    residual risk, noted in PRD R4).
- Close/teardown wiring:
  - `handleCloseDocument`: if the closing document's controller is dirty or
    saving, `await flushNow(2500)` before removing the document (button handler
    becomes async; double-click close is idempotent because the controller is
    removed after the first flush).
  - Tab switch does NOT unmount-destroy the engine per document (PDFViewer is
    keyed by document id — switching unmounts). So flush on controller teardown
    as well: the viewer-ready effect's cleanup triggers `flushNow` best-effort
    (fire, don't await — unmount cannot wait) right before capability handles
    die. To shrink that race, also flush on `window blur` and on
    `visibilitychange → hidden` when dirty.
- Browser-mode documents (no `filePath`): controller never created (R5).

## Rust (`src-tauri/src/lib.rs`)

```rust
#[tauri::command]
fn write_file_binary(request: tauri::ipc::Request) -> Result<(), String>
```

- Path arrives percent-encoded in a `x-glossreader-path` header (ASCII-safe for
  CJK paths); body is `InvokeBody::Raw(bytes)` — mirrors the zero-copy design of
  `read_file_binary`'s `Response`.
- Validate: non-empty bytes, header decodes, target's parent dir exists.
- Atomic write: `<path>.glossreader-tmp` in the same directory (same volume →
  atomic `fs::rename` on APFS; OneDrive folder is a normal APFS dir), then
  rename over the original; remove the temp file on any failure.
- Frontend wrapper `writePdfFile(filePath, data)` added to `tauriCommands.ts`.

## Failure modes considered

- Bad export buffer → header/length check refuses to write (R3).
- Unwritable directory/file → command error → UI error surface, original intact.
- Quit immediately after annotating → up to ~1s of changes lost (debounce
  window). Accepted for now; blur/hidden flush shrinks it. Documented in PRD.
- Concurrent external modification → last writer wins (out of scope).
- OneDrive dataless placeholder → `fs::read` already materializes files on
  open; writes go to a materialized file.

## Compatibility / rollout

- No storage schema change; gloss/translation pipelines untouched (R8).
- No settings added; behavior is always-on for path-backed documents.
- Rollback = revert the commit; files already annotated keep their annotations
  (they are standard PDF annots readable everywhere).
