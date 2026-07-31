# Persist annotation tool defaults (color, opacity) across restarts

## Goal

Color/opacity (and other style defaults) picked in the Annotate toolbars reset
to factory values on every launch — e.g. highlight set to green at 60% comes
back yellow at 100%. Persist per-tool defaults so they survive restarts.

## Background

Toolbar pickers dispatch the annotation plugin's `SET_TOOL_DEFAULTS`, which
merges a patch into `tool.defaults` (in-memory redux-style state only) and
emits `onToolsChange({ tools })`. The global annotation capability exposes
`getTools()`, `setToolDefaults(toolId, patch)`, and `onToolsChange` — all
that's needed to snapshot and restore. Verified in the v2.14.4 dist.

## Requirements

- R1: On every viewer mount, capture the pristine tool defaults as a baseline,
  then apply the persisted per-tool patches via `setToolDefaults`.
- R2: On `onToolsChange`, store per tool only the fields that differ from the
  pristine baseline (localStorage key
  `glossreader-annotation-tool-defaults`, map `toolId → patch`). Diff-based
  storage keeps future EmbedPDF default improvements for untouched fields.
- R3: Only JSON-serializable values are persisted; non-serializable fields are
  ignored, never crash the listener.
- R4: Works for all built-in annotation tools (highlight, underline, strikeout,
  squiggly, ink, shapes, free text…); runtime-added custom tools without a
  baseline are skipped.
- R5: No interference with the native-annotation autosave pipeline or gloss
  persistence.

## Acceptance Criteria

- [x] `npx tsc --noEmit` passes.
- [x] Harness (WKWebView dev shell): change highlight defaults to
      `#00ff00` / 0.6 → localStorage holds only the diff
      (`{"highlight":{"color":"#00ff00","opacity":0.6}}`) → relaunch →
      `getTools()` reports the highlight tool restored to green/0.6 while
      strokeColor/blendMode etc. keep factory values.
- [x] Resetting color/opacity back to factory (#FFCD45 / 1) empties the
      stored map (`{}`).

## Out of Scope

- Persisting user-added color presets (swatch list).
- Syncing tool defaults into the app Settings dialog.
