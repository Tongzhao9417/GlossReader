# Changelog

All notable changes to GlossReader are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2026-06-21

### Fixed

- **Gloss did nothing in the packaged app.** Clicking "释义" (or triggering its
  shortcut) in a release build produced no annotation, even though the
  definition was fetched successfully. The EmbedPDF container reference was
  being cleared by a parent effect that ran immediately after the viewer's
  synchronous `onInit` callback (child effects run before parent effects on
  mount), leaving annotation rendering with no shadow root to draw into. The
  container reference is now only released when no document is open, so glosses
  render correctly in the packaged macOS/Windows/Linux builds.
- **Selection could be lost when glossing from the right-click menu.** Choosing
  "释义" from the context menu now passes the selection captured when the menu
  opened, instead of re-reading a selection the viewer may have already cleared.

### Added

- **Configurable keyboard shortcuts.** A new "快捷键" tab in Settings lets you
  rebind the gloss and find shortcuts, with a warning when the two collide.

[1.0.1]: https://github.com/Tongzhao9417/GlossReader/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/Tongzhao9417/GlossReader/releases/tag/v1.0.0
