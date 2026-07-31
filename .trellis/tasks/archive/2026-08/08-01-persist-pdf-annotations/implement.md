# Implementation plan

## Ordered checklist

1. [x] Rust: add `write_file_binary` command (raw body + percent-encoded path
       header, atomic temp-file + rename, temp cleanup on failure); register in
       `generate_handler!`. Validate with `cargo check` + `cargo clippy`.
2. [x] `src/lib/tauriCommands.ts`: add `writePdfFile(filePath, data)` using
       `invoke` with a raw `Uint8Array` body and the path header.
3. [x] ~~package.json explicit deps~~ — dropped: followed the codebase's
       existing structural `*CapabilityLike` pattern in App.tsx instead of
       importing plugin types, so no new dependencies were needed.
4. [x] New `src/lib/annotationAutosave.ts`: controller with dirty/debounce/
       flush/re-entrancy logic per design.md (live capabilities passed at
       construction; plain timers, never rAF).
5. [x] App.tsx wiring: capability types + getters, controller lifecycle effect
       keyed to viewer readiness, blur/visibilitychange-hidden flush,
       `handleCloseDocument` awaits `flushNow(2500)`, errors to `setError`.
6. [x] `npx tsc --noEmit`.
7. [x] Runtime verification in the WKWebView dev shell (temp `__annotTest`
       hook + HTTP-sink probe, all reverted): create → file rewritten with
       /Highlight → relaunch shows it; clear → relaunch shows none; read-only
       dir → surfaced error, original sha intact; gloss overlay unaffected.
8. [x] Temp instrumentation removed (`git status` clean except intended files).
9. [x] `.trellis/spec/frontend/annotation-persistence.md` updated (autosave
       section + atomic-write invariant 5).
10. [x] CHANGELOG entry under [1.1.6]; commit; archive task.

## Validation commands

- `npx tsc --noEmit`
- `cd src-tauri && cargo check && cargo clippy`
- Harness run per step 7 (manual script, logged to /tmp sink)

## Rollback

- Single revert of the feature commit; no data migration involved. Annotated
  files keep standard PDF annots.
