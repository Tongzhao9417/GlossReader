# Fix annotations not rendering when the window is occluded (rAF freeze)

## Goal

Fix the user-reported bug "annotations are gone after closing and reopening a PDF":
persisted gloss annotations load correctly but never render when the (re)open happens
while the app window is hidden/occluded, because all annotation rendering is gated on
`requestAnimationFrame`, which macOS WKWebView freezes for non-visible windows.

## Background

Root-caused 2026-07-31 by inspecting the packaged app's WebKit localStorage and by
instrumenting the real WKWebView dev shell (probe posts to a local HTTP sink):

1. **No data is lost.** The packaged app's store holds annotations for 11 documents;
   the document the user tested today accumulated 34 entries across three 1.1.5
   launches (seeds `ms8odt9m`/`ms8oeg3c`/`ms8p9sqo`), including the 7 "disappeared"
   ones. Save, load, and the 1.1.5 id scheme all work.
2. **Reproduced rendering failure.** With the window `visibilityState: hidden`
   (occluded/unfocused), a document open/reopen logs `loaded-annotations count: 7`,
   `viewer-ready`, and 30+ `scheduleRenderActiveAnnotations` calls — but zero
   `requestAnimationFrame` callbacks fire (`rafTicks: 0`), so nothing is rendered.
   The moment the window becomes visible, the pending frame fires and all 7 render.
   The same flow always renders in Chromium and Playwright-WebKit browser tests,
   which is why the bug never reproduced in browser-based testing.
3. **Mechanism.** `scheduleRenderActiveAnnotations` (src/App.tsx) funnels every
   render through one rAF; even its 50/150/300 ms retry timers are only registered
   *inside* the rAF callback. WKWebView deliberately suspends rAF for occluded
   windows (power saving; see tauri-apps/tauri#15471), while plain timers keep
   firing (verified: the probe's `setInterval` ran throughout). New glosses render
   because creation happens with the window focused; loads at (re)open time race
   window visibility and can silently produce a blank document. macOS 26 Tahoe
   (the user's OS) also reworked WKWebView's rAF pipeline, making resume timing
   less trustworthy.

## Requirements

- R1: Annotation render scheduling must not depend on rAF alone. Race the rAF
  against a `setTimeout` fallback (~50 ms): whichever fires first performs the
  render (plus the existing 50/150/300 ms retry cascade) and cancels the other, so
  renders complete even while the window is hidden.
- R2: On `document.visibilitychange` → `visible`, schedule a render as belt and
  braces so any state missed while hidden is repainted.
- R3: No behavior change for the visible-window path beyond the added fallback
  (same render pipeline, same retry cascade, no duplicate render storms — the
  fallback must be cancelled once the rAF path runs, and vice versa).

## Acceptance Criteria

- [x] `npx tsc --noEmit` passes.
- [x] Instrumented WKWebView dev-shell repro (open/reopen with
      `visibilityState: hidden`): stored annotations render into the hidden
      document (gloss count > 0) without the window ever gaining focus.
      Verified: gloss/highlight count 7 while `vis: hidden` with rAF frozen
      (`rafTicks` stuck at 84) for both first open and close-tab → reopen.
- [x] Visible-window open still renders stored annotations (Chromium check).
- [x] Close-tab → reopen same file mid-session renders stored annotations
      (verified in WKWebView both visible and hidden).

## Out of Scope

- De-duplicating the ~25 repeated "taxonomies" glosses the user created while
  retrying (manual cleanup; deletion works).
- The separate latent race where an in-flight gloss resolving after its tab is
  closed can overwrite the stored list for that document (worth its own task).
- Version bump / release (tag-driven, handled separately).
