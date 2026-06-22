# Changelog

All notable changes to GlossReader are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-06-22

### Added

- **More AI providers.** Added Google Gemini, MiniMax, Kimi (Moonshot),
  小米 MiMo, OpenRouter, and 火山引擎 (方舟) alongside the existing Anthropic,
  OpenAI, DeepSeek, and Ollama options. Each provider ships with suggested
  models, and the model field is editable so you can enter any custom model ID
  (useful for OpenRouter slugs and 火山引擎 endpoint IDs).
- **Reader settings.** A new "阅读器" tab in Settings surfaces EmbedPDF's viewer
  options: default zoom (适合宽度 / 适合页面 / 自动 / 50–200%), scroll direction
  (垂直 / 水平), page layout (单页 / 双页), page gap, and theme
  (浅色 / 深色 / 跟随系统).
- **Remappable reader shortcuts.** Zoom in/out and rotate clockwise /
  counter-clockwise can now be rebound from the "快捷键" tab.
- **Annotation shortcuts.** New bindings for the text-markup tools — 高亮
  (highlight), 下划线 (underline), 删除线 (strikeout), and 波浪线 (squiggly) —
  that annotate the current text selection. Triggering a tool while text is
  already selected applies the markup once and returns you to text selection;
  activating a tool with nothing selected keeps it on until you toggle it off.
- **Open PDFs with GlossReader (macOS).** GlossReader now registers as a PDF
  handler, so it appears under Finder's "打开方式" / "Open With" and can be set
  as the default PDF app (for example, opening a paper from Zotero), launching
  straight into the document.

### Changed

- **Less intrusive updates.** Instead of silently downloading and relaunching,
  GlossReader now shows a dialog with the new version and its release notes,
  a download progress bar, and a confirm-to-restart step — so you decide when
  an update installs.

### Fixed

- **Counter-clockwise rotation shortcut.** Corrected an incorrect command id
  that prevented the rotate-counter-clockwise binding from taking effect.

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

[1.1.0]: https://github.com/Tongzhao9417/GlossReader/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/Tongzhao9417/GlossReader/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/Tongzhao9417/GlossReader/releases/tag/v1.0.0
