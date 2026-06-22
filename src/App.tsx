import {
  type ChangeEvent,
  type DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type EmbedPdfContainer,
  PDFViewer,
  type PluginRegistry,
  ScrollStrategy,
  SpreadMode,
  ZoomMode,
  type ZoomLevel,
  type PDFViewerConfig,
} from "@embedpdf/react-pdf-viewer";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { listen } from "@tauri-apps/api/event";
import { openPdfFiles, readPdfFile, type OpenPdfResult } from "./lib/tauriCommands";
import { type Settings as SettingsType, loadSettings, saveSettings } from "./lib/settings";
import {
  DEFAULT_FIND_SHORTCUT,
  DEFAULT_GLOSS_SHORTCUT,
  DEFAULT_HIGHLIGHT_SHORTCUT,
  DEFAULT_ROTATE_CCW_SHORTCUT,
  DEFAULT_ROTATE_CW_SHORTCUT,
  DEFAULT_SQUIGGLY_SHORTCUT,
  DEFAULT_STRIKEOUT_SHORTCUT,
  DEFAULT_UNDERLINE_SHORTCUT,
  DEFAULT_ZOOM_IN_SHORTCUT,
  DEFAULT_ZOOM_OUT_SHORTCUT,
  formatKeyboardShortcutLabel,
  isKeyboardShortcut,
  normalizeKeyboardShortcut,
} from "./lib/keyboardShortcuts";
import { fetchGloss, fetchTranslation } from "./lib/aiService";
import { getWordForms } from "./lib/inflection";
import {
  checkForUpdate,
  downloadAndInstallUpdate,
  isUpdaterEndpointMissing,
  restartApp,
  type Update,
} from "./lib/updater";
import {
  type AnnotationStyle,
  type AnnotationLayoutProvider,
  type GlossAnnotation,
  type GlossAnnotationAnchor,
  type PdfRectLike,
  type SideTranslationOverlay,
  clearAnnotations,
  createGlossAnnotationId,
  getAnnotationRenderScale,
  injectAnnotationStyles,
  renderAnnotations,
} from "./lib/glossAnnotations";
import Settings from "./components/Settings";
import UpdateDialog, { type UpdateDialogState } from "./components/UpdateDialog";
import "./App.css";

const SELECTION_COLOR = "#CCDEF7";
const SELECTION_CONTEXT_MENU_WIDTH = 160;
const SELECTION_CONTEXT_MENU_HEIGHT = 80;
const ANNOTATION_CONTEXT_MENU_WIDTH = 236;
const ANNOTATION_CONTEXT_MENU_HEIGHT = 292;
const SELECTION_CONTEXT_SNAPSHOT_MAX_AGE = 1500;
const SELECTION_CONTEXT_SNAPSHOT_MAX_DISTANCE = 12;
const DEFAULT_PDF_INTERACTION_MODE = "pointerMode";
const PDF_FIND_COMMAND_ID = "panel:toggle-search";
const KNOWN_PDF_FIND_SHORTCUTS = ["Ctrl+F", "Meta+F", "Ctrl+D", "Meta+D"];

// EmbedPDF reader commands exposed as remappable shortcuts, with their built-in
// default bindings (used to locate the command and clear the originals).
const READER_SHORTCUT_COMMANDS = [
  {
    settingKey: "zoomIn",
    commandId: "zoom:in",
    fallback: DEFAULT_ZOOM_IN_SHORTCUT,
    knownDefaults: ["Ctrl+=", "Meta+=", "Ctrl+NumpadAdd", "Meta+NumpadAdd"],
  },
  {
    settingKey: "zoomOut",
    commandId: "zoom:out",
    fallback: DEFAULT_ZOOM_OUT_SHORTCUT,
    knownDefaults: ["Ctrl+-", "Meta+-", "Ctrl+NumpadSubtract", "Meta+NumpadSubtract"],
  },
  {
    settingKey: "rotateClockwise",
    commandId: "rotate:clockwise",
    fallback: DEFAULT_ROTATE_CW_SHORTCUT,
    knownDefaults: ["Ctrl+]", "Meta+]"],
  },
  {
    settingKey: "rotateCounterclockwise",
    commandId: "rotate:counter-clockwise",
    fallback: DEFAULT_ROTATE_CCW_SHORTCUT,
    knownDefaults: ["Ctrl+[", "Meta+["],
  },
] as const satisfies ReadonlyArray<{
  settingKey: keyof SettingsType["shortcuts"];
  commandId: string;
  fallback: string;
  knownDefaults: string[];
}>;

// EmbedPDF text-markup annotation commands. These have NO built-in shortcuts
// (toolbar-only), so knownDefaults is empty — patching just adds a fresh
// binding. Each command annotates the current text selection (no-op if none).
const ANNOTATION_SHORTCUT_COMMANDS = [
  {
    settingKey: "highlight",
    commandId: "annotation:add-highlight",
    fallback: DEFAULT_HIGHLIGHT_SHORTCUT,
    knownDefaults: [],
  },
  {
    settingKey: "underline",
    commandId: "annotation:add-underline",
    fallback: DEFAULT_UNDERLINE_SHORTCUT,
    knownDefaults: [],
  },
  {
    settingKey: "strikeout",
    commandId: "annotation:add-strikeout",
    fallback: DEFAULT_STRIKEOUT_SHORTCUT,
    knownDefaults: [],
  },
  {
    settingKey: "squiggly",
    commandId: "annotation:add-squiggly",
    fallback: DEFAULT_SQUIGGLY_SHORTCUT,
    knownDefaults: [],
  },
] as const satisfies ReadonlyArray<{
  settingKey: keyof SettingsType["shortcuts"];
  commandId: string;
  fallback: string;
  knownDefaults: string[];
}>;

function toZoomLevel(value: string): ZoomLevel {
  switch (value) {
    case "fit-width":
      return ZoomMode.FitWidth;
    case "fit-page":
      return ZoomMode.FitPage;
    case "automatic":
      return ZoomMode.Automatic;
    default: {
      const numeric = Number(value);
      return Number.isFinite(numeric) && numeric > 0 ? numeric : ZoomMode.FitWidth;
    }
  }
}

function toScrollStrategy(value: string): ScrollStrategy {
  return value === "horizontal"
    ? ScrollStrategy.Horizontal
    : ScrollStrategy.Vertical;
}

function toSpreadMode(value: string): SpreadMode {
  switch (value) {
    case "odd":
      return SpreadMode.Odd;
    case "even":
      return SpreadMode.Even;
    default:
      return SpreadMode.None;
  }
}
const GLOSS_ANNOTATIONS_STORAGE_KEY = "glossreader-gloss-annotations";
const TRANSLATIONS_STORAGE_KEY = "glossreader-side-translations";
const INLINE_GLOSS_MAX_WORDS = 5;
const INLINE_GLOSS_MAX_CHARS = 48;
const RECENT_SELECTION_REQUEST_MAX_AGE = 5000;
// MatchFlag.MatchWholeWord (2). Omitting MatchCase (1) keeps matching
// case-insensitive so "Power" at a sentence start still matches "power".
const MATCH_WHOLE_WORD = 2;
// Safety cap so glossing a very frequent word can't flood the page with overlays.
const MAX_AUTO_GLOSS_OCCURRENCES = 200;

interface OpenDocument {
  id: string;
  name: string;
  url: string;
  filePath?: string;
}

interface RecentDocument {
  id: string;
  name: string;
  filePath?: string;
}

interface SelectionRange {
  start: {
    page: number;
    index: number;
  };
  end: {
    page: number;
    index: number;
  };
}

interface PdfTask<T> {
  wait: (
    onResolve: (result: T) => void,
    onReject?: (error: unknown) => void,
  ) => void;
}

interface PdfSearchResultLike {
  pageIndex: number;
  charIndex: number;
  charCount: number;
  rects: PdfRectLike[];
}

interface PdfSearchAllPagesResultLike {
  results: PdfSearchResultLike[];
  total: number;
}

interface SelectionPluginLike {
  __glossReaderWordBoundaryPatch?: boolean;
  __glossReaderContextMenuClearPatch?: boolean;
  coreState: {
    core: {
      activeDocumentId: string | null;
      documents: Record<string, { document?: unknown } | undefined>;
    };
  };
  engine: {
    getTextSlices: (
      doc: unknown,
      slices: Array<{
        pageIndex: number;
        charIndex: number;
        charCount: number;
      }>,
    ) => {
      wait: (
        onResolve: (texts: string[]) => void,
        onReject?: (error: unknown) => void,
      ) => void;
    };
    searchAllPages?: (
      doc: unknown,
      keyword: string,
      options?: { flags?: number[] },
    ) => {
      wait: (
        onResolve: (result: PdfSearchAllPagesResultLike) => void,
        onReject?: (error: unknown) => void,
      ) => void;
    };
  };
  getDocumentState: (documentId: string) => {
    selection: SelectionRange | null;
  };
  selectWord: (
    documentId: string,
    page: number,
    charIndex: number,
    modeId: string,
  ) => void;
  clearSelection: (documentId: string, modeId?: string) => void;
  applyInstantSelection: (
    documentId: string,
    page: number,
    from: number,
    to: number,
    modeId: string,
  ) => void;
}

interface SelectionCapabilityLike {
  getState: () => {
    selection: SelectionRange | null;
  };
  getBoundingRectForPage: (page: number) => PdfRectLike | null;
  getHighlightRectsForPage: (page: number) => PdfRectLike[];
  getSelectedText: () => PdfTask<string[]>;
  clear: () => void;
  onSelectionChange?: (
    listener: (event: { selection: SelectionRange | null }) => void,
  ) => () => void;
}

interface SelectionPluginWithCapability {
  provides?: () => SelectionCapabilityLike;
}

interface ScrollCapabilityLike extends AnnotationLayoutProvider {
  onScroll?: (listener: () => void) => () => void;
  onLayoutChange?: (listener: () => void) => () => void;
  onLayoutReady?: (listener: () => void) => () => void;
}

interface ViewportCapabilityLike {
  onViewportChange?: (listener: () => void) => () => void;
  onViewportResize?: (listener: () => void) => () => void;
  onScrollChange?: (listener: () => void) => () => void;
}

interface ZoomCapabilityLike {
  onZoomChange?: (listener: () => void) => () => void;
  onStateChange?: (listener: () => void) => () => void;
}

interface PluginWithCapability<T> {
  provides?: () => T;
}

type CommandSource = "keyboard" | "ui" | "api";

interface PdfCommandLike {
  id: string;
  shortcuts?: string | string[];
  [key: string]: unknown;
}

interface ResolvedPdfCommandLike {
  disabled: boolean;
  visible: boolean;
}

interface CommandsCapabilityLike {
  resolve: (
    commandId: string,
    documentId?: string,
  ) => ResolvedPdfCommandLike;
  execute: (
    commandId: string,
    documentId?: string,
    source?: CommandSource,
  ) => void;
  getCommandByShortcut: (shortcut: string) => PdfCommandLike | null;
  getAllShortcuts: () => Map<string, string>;
  registerCommand: (command: PdfCommandLike) => void;
  unregisterCommand: (commandId: string) => void;
}

interface CommandsPluginLike extends PluginWithCapability<CommandsCapabilityLike> {
  commands?: Map<string, PdfCommandLike>;
  shortcutMap?: Map<string, string>;
}

type AnnotationContextTarget = {
  kind: "gloss" | "translation";
  id: string;
};

type ContextMenuState =
  | {
      type: "selection";
      x: number;
      y: number;
      canCopy: boolean;
      request?: SelectedGlossRequest;
    }
  | {
      type: "annotation";
      x: number;
      y: number;
      target: AnnotationContextTarget;
    };

interface SelectedGlossRequest {
  text: string;
  anchor: GlossAnnotationAnchor;
}

interface SelectionContextSnapshot {
  createdAt: number;
  pointerX: number;
  pointerY: number;
  insideSelection: boolean;
  request?: SelectedGlossRequest;
  pendingRequest?: Promise<SelectedGlossRequest | null>;
}

interface PdfSource {
  name: string;
  data: ArrayBuffer;
  filePath?: string;
}

const WORD_CHARACTER_PATTERN = /[\p{L}\p{N}]/u;
const PARAGRAPH_BREAK_TOKEN = "\u0000GLOSSREADER_PARAGRAPH_BREAK\u0000";
let suppressPdfSelectionClearUntil = 0;
let suppressPdfSelectionClearForPointerDown = false;
const QUICK_FONT_SIZE_OPTIONS = [
  "8px",
  "10px",
  "12px",
  "14px",
  "16px",
  "18px",
  "20px",
  "22px",
];
const QUICK_OPACITY_OPTIONS = [
  { label: "30%", value: "30" },
  { label: "50%", value: "50" },
  { label: "70%", value: "70" },
  { label: "100%", value: "100" },
];
const QUICK_COLOR_OPTIONS = [
  { label: "灰色", value: "gray", color: "#888888" },
  { label: "红色", value: "red", color: "#c0392b" },
  { label: "蓝色", value: "blue", color: "#2980b9" },
  { label: "绿色", value: "green", color: "#2e7d32" },
  { label: "紫色", value: "purple", color: "#7b3fb3" },
  { label: "黑色", value: "black", color: "#1f2328" },
];

function getFileNameFromPath(filePath: string) {
  return filePath.split(/[\\/]/).pop() || filePath;
}

function isPdfPath(filePath: string) {
  return filePath.toLowerCase().endsWith(".pdf");
}

function isPdfFile(file: File) {
  return file.type === "application/pdf" || isPdfPath(file.name);
}

function pdfResultToSource(result: OpenPdfResult): PdfSource {
  return {
    name: getFileNameFromPath(result.filePath),
    data: result.data,
    filePath: result.filePath,
  };
}

function getDocumentAnnotationKey(openDocument: OpenDocument) {
  return openDocument.filePath ?? openDocument.id;
}

function readStoredAnnotationMap() {
  try {
    const raw = localStorage.getItem(GLOSS_ANNOTATIONS_STORAGE_KEY);
    if (!raw) return {};

    return JSON.parse(raw) as Record<string, GlossAnnotation[]>;
  } catch {
    return {};
  }
}

function normalizeStoredAnnotation(annotation: GlossAnnotation) {
  return {
    ...annotation,
    sourceText: annotation.sourceText ?? annotation.definition,
    anchor: {
      ...annotation.anchor,
      rects: annotation.anchor.rects?.length
        ? annotation.anchor.rects
        : [annotation.anchor.rect],
    },
  };
}

function loadStoredAnnotations(openDocument: OpenDocument) {
  const annotations =
    readStoredAnnotationMap()[getDocumentAnnotationKey(openDocument)] ?? [];

  return annotations.map(normalizeStoredAnnotation);
}

function saveStoredAnnotations(
  openDocument: OpenDocument,
  annotations: GlossAnnotation[],
) {
  const stored = readStoredAnnotationMap();
  const key = getDocumentAnnotationKey(openDocument);

  if (annotations.length) {
    stored[key] = annotations;
  } else {
    delete stored[key];
  }

  localStorage.setItem(GLOSS_ANNOTATIONS_STORAGE_KEY, JSON.stringify(stored));
}

function readStoredTranslationMap() {
  try {
    const raw = localStorage.getItem(TRANSLATIONS_STORAGE_KEY);
    if (!raw) return {};

    return JSON.parse(raw) as Record<string, SideTranslationOverlay[]>;
  } catch {
    return {};
  }
}

function normalizeStoredTranslation(
  translation: SideTranslationOverlay,
): SideTranslationOverlay | null {
  if (!translation.anchor?.rect) return null;

  return {
    ...translation,
    loading: false,
  };
}

function loadStoredTranslations(openDocument: OpenDocument) {
  const translations =
    readStoredTranslationMap()[getDocumentAnnotationKey(openDocument)] ?? [];

  return translations
    .map(normalizeStoredTranslation)
    .filter((translation): translation is SideTranslationOverlay =>
      Boolean(translation),
    );
}

function saveStoredTranslations(
  openDocument: OpenDocument,
  translations: SideTranslationOverlay[],
) {
  const stored = readStoredTranslationMap();
  const key = getDocumentAnnotationKey(openDocument);
  const stableTranslations = translations.map((translation) => ({
    ...translation,
    loading: false,
  }));

  if (stableTranslations.length) {
    stored[key] = stableTranslations;
  } else {
    delete stored[key];
  }

  localStorage.setItem(TRANSLATIONS_STORAGE_KEY, JSON.stringify(stored));
}

function isWordCharacter(char: string) {
  return WORD_CHARACTER_PATTERN.test(char);
}

function createTranslationId() {
  return `translation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getWordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function shouldUseSideTranslation(text: string) {
  const normalizedText = text.trim();
  if (!normalizedText) return false;

  return (
    normalizedText.length > INLINE_GLOSS_MAX_CHARS ||
    getWordCount(normalizedText) > INLINE_GLOSS_MAX_WORDS ||
    /[.!?。！？]\s*$/.test(normalizedText)
  );
}

function normalizeCopiedPdfText(textParts: string[]) {
  return textParts
    .join("\n\n")
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/\u00ad/g, "")
    .replace(/[ \t\f\v]+\n/g, "\n")
    .replace(/\n[ \t\f\v]+/g, "\n")
    .replace(/(\p{L})-\n(?=\p{L})/gu, "$1")
    .replace(/\n{2,}/g, PARAGRAPH_BREAK_TOKEN)
    .replace(/\n/g, " ")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\s+([,.;:!?%])/g, "$1")
    .replace(/([([{])\s+/g, "$1")
    .split(PARAGRAPH_BREAK_TOKEN)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .join("\n\n");
}

function copyTextWithFallback(text: string) {
  const textArea = window.document.createElement("textarea");
  const activeElement = window.document.activeElement;

  textArea.value = text;
  textArea.readOnly = true;
  textArea.style.position = "fixed";
  textArea.style.top = "0";
  textArea.style.left = "-9999px";
  textArea.style.opacity = "0";

  window.document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    const copied = window.document.execCommand("copy");
    if (!copied) throw new Error("Fallback copy command failed");
  } finally {
    textArea.remove();
    if (activeElement instanceof HTMLElement) activeElement.focus();
  }
}

async function writeTextToClipboard(text: string) {
  let clipboardError: unknown = null;

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (error) {
      clipboardError = error;
    }
  }

  try {
    copyTextWithFallback(text);
  } catch (fallbackError) {
    throw clipboardError ?? fallbackError;
  }
}

function rangeEquals(left: SelectionRange | null, right: SelectionRange) {
  return (
    left?.start.page === right.start.page &&
    left.start.index === right.start.index &&
    left.end.page === right.end.page &&
    left.end.index === right.end.index
  );
}

function getWordTrimOffsets(text: string) {
  const chars = Array.from(text);
  let startChar = 0;
  let endChar = chars.length;

  while (startChar < endChar && !isWordCharacter(chars[startChar])) {
    startChar += 1;
  }

  while (endChar > startChar && !isWordCharacter(chars[endChar - 1])) {
    endChar -= 1;
  }

  if (startChar >= endChar) return null;

  return {
    start: chars.slice(0, startChar).join("").length,
    end: chars.slice(0, endChar).join("").length,
  };
}

function patchSelectionWordBoundary(registry: PluginRegistry) {
  const selectionPlugin = registry.getPlugin(
    "selection",
  ) as SelectionPluginLike | null;

  if (
    !selectionPlugin ||
    selectionPlugin.__glossReaderWordBoundaryPatch ||
    typeof selectionPlugin.selectWord !== "function" ||
    typeof selectionPlugin.applyInstantSelection !== "function"
  ) {
    return;
  }

  const originalSelectWord = selectionPlugin.selectWord.bind(selectionPlugin);
  selectionPlugin.__glossReaderWordBoundaryPatch = true;

  selectionPlugin.selectWord = (
    documentId: string,
    page: number,
    charIndex: number,
    modeId: string,
  ) => {
    originalSelectWord(documentId, page, charIndex, modeId);

    const selectedRange = selectionPlugin.getDocumentState(documentId).selection;
    if (
      !selectedRange ||
      selectedRange.start.page !== page ||
      selectedRange.end.page !== page
    ) {
      return;
    }

    const charCount = selectedRange.end.index - selectedRange.start.index + 1;
    if (charCount <= 1) return;

    const doc = selectionPlugin.coreState.core.documents[documentId]?.document;
    if (!doc) return;

    const rangeBeforeTextLookup: SelectionRange = {
      start: { ...selectedRange.start },
      end: { ...selectedRange.end },
    };

    selectionPlugin.engine
      .getTextSlices(doc, [
        {
          pageIndex: page,
          charIndex: selectedRange.start.index,
          charCount,
        },
      ])
      .wait((texts) => {
        const selectedText = texts[0];
        if (!selectedText || selectedText.length !== charCount) return;

        const trim = getWordTrimOffsets(selectedText);
        if (!trim || (trim.start === 0 && trim.end === selectedText.length)) {
          return;
        }

        const currentRange =
          selectionPlugin.getDocumentState(documentId).selection;
        if (!rangeEquals(currentRange, rangeBeforeTextLookup)) return;

        const from = rangeBeforeTextLookup.start.index + trim.start;
        const to = rangeBeforeTextLookup.start.index + trim.end - 1;
        if (from > to) return;

        selectionPlugin.applyInstantSelection(documentId, page, from, to, modeId);
      });
  };
}

function suppressPdfSelectionClearForContextPointerDown() {
  suppressPdfSelectionClearUntil = performance.now() + 500;
  suppressPdfSelectionClearForPointerDown = true;
  window.setTimeout(() => {
    suppressPdfSelectionClearForPointerDown = false;
  }, 0);
}

function shouldSuppressPdfSelectionClear() {
  if (
    !suppressPdfSelectionClearForPointerDown ||
    performance.now() > suppressPdfSelectionClearUntil
  ) {
    return false;
  }

  const currentEvent = window.event as MouseEvent | PointerEvent | undefined;
  return (
    !currentEvent ||
    (currentEvent.type === "pointerdown" &&
      isContextMenuPointerEvent(currentEvent))
  );
}

function patchSelectionContextMenuClear(registry: PluginRegistry) {
  const selectionPlugin = registry.getPlugin(
    "selection",
  ) as SelectionPluginLike | null;

  if (
    !selectionPlugin ||
    selectionPlugin.__glossReaderContextMenuClearPatch ||
    typeof selectionPlugin.clearSelection !== "function"
  ) {
    return;
  }

  const originalClearSelection =
    selectionPlugin.clearSelection.bind(selectionPlugin);
  selectionPlugin.__glossReaderContextMenuClearPatch = true;

  selectionPlugin.clearSelection = (documentId: string, modeId?: string) => {
    if (shouldSuppressPdfSelectionClear()) return;
    originalClearSelection(documentId, modeId);
  };
}

function normalizePdfCommandShortcut(shortcut: string) {
  return shortcut.toLowerCase().split("+").sort().join("+");
}

function getConfiguredShortcut(shortcut: string, fallback: string) {
  return normalizeKeyboardShortcut(shortcut) || fallback;
}

function getPdfFindShortcuts(findShortcut: string) {
  return [getConfiguredShortcut(findShortcut, DEFAULT_FIND_SHORTCUT)];
}

const ANNOTATION_PLUGIN_ID = "annotation";
const SELECTION_PLUGIN_ID = "selection";
const MARKUP_TOOL_REVERT_FLAG = "__glossReaderMarkupRevert";

interface AnnotationToolLike {
  id?: string;
}

interface AnnotationDocumentScopeLike {
  getActiveTool?: () => AnnotationToolLike | null;
  setActiveTool?: (toolId: string | null) => void;
}

interface AnnotationCapabilityLike {
  forDocument?: (documentId: string) => AnnotationDocumentScopeLike | undefined;
}

interface SelectionDocumentScopeLike {
  getFormattedSelection?: () => unknown[];
}

interface SelectionScopedCapabilityLike {
  forDocument?: (documentId: string) => SelectionDocumentScopeLike | undefined;
}

interface PdfCommandContextLike {
  registry: PluginRegistry;
  documentId: string;
}

type PdfCommandActionLike = (context: PdfCommandContextLike) => void;

// EmbedPDF's markup commands (highlight/underline/strikeout/squiggly) leave the
// tool ACTIVE after annotating a pre-existing selection, trapping the cursor in
// tool mode. Wrap the action so that when it runs WITH a live text selection (a
// one-shot markup of the selected text), the tool reverts to selection mode
// afterward. When triggered WITHOUT a selection, EmbedPDF's default toggle
// (enter/exit a sticky tool mode) is preserved untouched.
function wrapMarkupCommandAction(
  action: PdfCommandActionLike,
  registry: PluginRegistry,
): PdfCommandActionLike {
  const tagged = action as PdfCommandActionLike & {
    [MARKUP_TOOL_REVERT_FLAG]?: boolean;
  };
  if (tagged[MARKUP_TOOL_REVERT_FLAG]) return tagged;

  const wrapped = ((context: PdfCommandContextLike) => {
    const documentId = context?.documentId;
    const annotation = (
      registry.getPlugin(ANNOTATION_PLUGIN_ID) as
        | PluginWithCapability<AnnotationCapabilityLike>
        | null
        | undefined
    )?.provides?.();
    const selection = (
      registry.getPlugin(SELECTION_PLUGIN_ID) as
        | PluginWithCapability<SelectionScopedCapabilityLike>
        | null
        | undefined
    )?.provides?.();

    const selectionScope = documentId
      ? selection?.forDocument?.(documentId)
      : undefined;
    const hadSelection =
      (selectionScope?.getFormattedSelection?.()?.length ?? 0) > 0;

    action(context);

    // One-shot: marking up text that was already selected should hand control
    // back to text selection, not strand the user in tool mode.
    if (hadSelection && documentId) {
      annotation?.forDocument?.(documentId)?.setActiveTool?.(null);
    }
  }) as PdfCommandActionLike & { [MARKUP_TOOL_REVERT_FLAG]?: boolean };

  wrapped[MARKUP_TOOL_REVERT_FLAG] = true;
  return wrapped;
}

// Remap an EmbedPDF command's keyboard shortcut: re-register the command with
// the new bindings and rewrite the plugin's shortcutMap (clearing the built-in
// defaults and any previously-applied custom binding for this command).
// `wrapAction`, when given, transforms the command's action on re-registration
// (used to adjust markup tool behavior); it must be idempotent.
function patchPdfCommandShortcut(
  registry: PluginRegistry | null,
  commandId: string,
  knownDefaults: readonly string[],
  shortcuts: string[],
  wrapAction?: (
    action: PdfCommandActionLike,
    registry: PluginRegistry,
  ) => PdfCommandActionLike,
) {
  const commandsPlugin = registry?.getPlugin(
    "commands",
  ) as CommandsPluginLike | null;
  const commands = commandsPlugin?.provides?.();

  if (!commandsPlugin || !commands) return;

  const command =
    commandsPlugin.commands?.get(commandId) ??
    [...knownDefaults, ...shortcuts]
      .map((shortcut) => commands.getCommandByShortcut(shortcut))
      .find((candidate) => candidate?.id === commandId);

  if (command) {
    commands.unregisterCommand(commandId);
    const nextCommand: PdfCommandLike = { ...command, shortcuts };
    if (wrapAction && registry && typeof command.action === "function") {
      nextCommand.action = wrapAction(
        command.action as PdfCommandActionLike,
        registry,
      );
    }
    commands.registerCommand(nextCommand);
  }

  const shortcutMap = commandsPlugin.shortcutMap;
  if (!shortcutMap) return;

  // Drop every existing binding pointing at this command so re-binding leaves
  // no stragglers (covers both built-in defaults and prior custom bindings).
  [...shortcutMap.keys()].forEach((key) => {
    if (shortcutMap.get(key) === commandId) shortcutMap.delete(key);
  });

  if (commandsPlugin.commands?.has(commandId) || command) {
    shortcuts.forEach((shortcut) => {
      shortcutMap.set(normalizePdfCommandShortcut(shortcut), commandId);
    });
  }
}

function patchPdfFindShortcut(
  registry: PluginRegistry | null,
  findShortcut: string,
) {
  patchPdfCommandShortcut(
    registry,
    PDF_FIND_COMMAND_ID,
    KNOWN_PDF_FIND_SHORTCUTS,
    getPdfFindShortcuts(findShortcut),
  );
}

function patchPdfReaderShortcuts(
  registry: PluginRegistry | null,
  shortcuts: SettingsType["shortcuts"],
) {
  READER_SHORTCUT_COMMANDS.forEach((entry) => {
    patchPdfCommandShortcut(registry, entry.commandId, entry.knownDefaults, [
      getConfiguredShortcut(shortcuts[entry.settingKey], entry.fallback),
    ]);
  });
  // Markup commands additionally get their action wrapped so a one-shot markup
  // of a pre-existing selection reverts to selection mode (see wrapMarkupCommandAction).
  ANNOTATION_SHORTCUT_COMMANDS.forEach((entry) => {
    patchPdfCommandShortcut(
      registry,
      entry.commandId,
      entry.knownDefaults,
      [getConfiguredShortcut(shortcuts[entry.settingKey], entry.fallback)],
      wrapMarkupCommandAction,
    );
  });
}

function getSelectionCapability(registry: PluginRegistry | null) {
  const selectionPlugin = registry?.getPlugin(
    "selection",
  ) as SelectionPluginWithCapability | null;

  return selectionPlugin?.provides?.() ?? null;
}

function getPluginCapability<T>(
  registry: PluginRegistry | null,
  pluginId: string,
) {
  const plugin = registry?.getPlugin(pluginId) as PluginWithCapability<T> | null;
  return plugin?.provides?.() ?? null;
}

function getScrollCapability(registry: PluginRegistry | null) {
  return getPluginCapability<ScrollCapabilityLike>(registry, "scroll");
}

function getViewportCapability(registry: PluginRegistry | null) {
  return getPluginCapability<ViewportCapabilityLike>(registry, "viewport");
}

function getZoomCapability(registry: PluginRegistry | null) {
  return getPluginCapability<ZoomCapabilityLike>(registry, "zoom");
}

function getCommandsCapability(registry: PluginRegistry | null) {
  return getPluginCapability<CommandsCapabilityLike>(registry, "commands");
}

function hasTextSelection(registry: PluginRegistry | null) {
  try {
    return Boolean(getSelectionCapability(registry)?.getState().selection);
  } catch {
    return false;
  }
}

function copySelectedPdfText(registry: PluginRegistry | null) {
  const selectionCapability = getSelectionCapability(registry);
  if (!selectionCapability) return false;

  try {
    if (!selectionCapability.getState().selection) return false;

    selectionCapability.getSelectedText().wait(
      (textParts) => {
        const text = normalizeCopiedPdfText(textParts);
        if (!text) return;

        void writeTextToClipboard(text).catch((error) => {
          console.error("Failed to write selected text to clipboard:", error);
        });
      },
      (error) => {
        console.error("Failed to read selected PDF text:", error);
      },
    );

    return true;
  } catch (error) {
    console.error("Failed to copy selected PDF text:", error);
    return false;
  }
}

function getSelectedGlossRequest(
  registry: PluginRegistry | null,
): Promise<SelectedGlossRequest> {
  return new Promise((resolve, reject) => {
    const selectionCapability = getSelectionCapability(registry);
    const selection = selectionCapability?.getState().selection;
    if (!selection) {
      reject(new Error("没有选中文本"));
      return;
    }

    if (selection.start.page !== selection.end.page) {
      reject(new Error("暂不支持跨页释义"));
      return;
    }

    const page = selection.start.page;
    const rect = selectionCapability.getBoundingRectForPage(page);
    if (!rect) {
      reject(new Error("无法定位选中的文本"));
      return;
    }
    const rects = selectionCapability.getHighlightRectsForPage(page);

    selectionCapability.getSelectedText().wait(
      (textParts) => {
        const text = normalizeCopiedPdfText(textParts).trim();
        if (!text) {
          reject(new Error("选中的文本为空"));
          return;
        }
        resolve({
          text,
          anchor: {
            page,
            startIndex: selection.start.index,
            endIndex: selection.end.index,
            rect,
            rects: rects.length ? rects : [rect],
          },
        });
      },
      (err) => reject(err),
    );
  });
}

// A gloss fans out across the document only for a single bare word — phrases
// already route to side-translation, and whole-word search is meant for tokens.
function isSingleWordGloss(text: string) {
  return text.length >= 2 && !/\s/.test(text);
}

function unionRect(rects: PdfRectLike[]): PdfRectLike {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const rect of rects) {
    minX = Math.min(minX, rect.origin.x);
    minY = Math.min(minY, rect.origin.y);
    maxX = Math.max(maxX, rect.origin.x + rect.size.width);
    maxY = Math.max(maxY, rect.origin.y + rect.size.height);
  }

  return {
    origin: { x: minX, y: minY },
    size: { width: maxX - minX, height: maxY - minY },
  };
}

function searchResultToAnchor(
  result: PdfSearchResultLike,
): GlossAnnotationAnchor | null {
  const rects = result.rects ?? [];
  if (!rects.length) return null;

  return {
    page: result.pageIndex,
    startIndex: result.charIndex,
    // end.index is the inclusive index of the last matched character, matching
    // the convention used by the selection-derived anchor.
    endIndex: result.charIndex + result.charCount - 1,
    rect: unionRect(rects),
    rects,
  };
}

// Headlessly searches every page for a single keyword (whole-word,
// case-insensitive) using the PDF engine directly, so it never opens the visible
// find panel.
function searchKeyword(
  selectionPlugin: SelectionPluginLike,
  doc: unknown,
  keyword: string,
): Promise<GlossAnnotationAnchor[]> {
  return new Promise((resolve) => {
    try {
      selectionPlugin.engine.searchAllPages!(doc, keyword, {
        flags: [MATCH_WHOLE_WORD],
      }).wait(
        (result) => {
          const anchors: GlossAnnotationAnchor[] = [];
          for (const hit of result.results ?? []) {
            const anchor = searchResultToAnchor(hit);
            if (anchor) anchors.push(anchor);
          }
          resolve(anchors);
        },
        () => resolve([]),
      );
    } catch {
      resolve([]);
    }
  });
}

// Returns one anchor per occurrence of `word` across the document, including its
// singular/plural noun form(s). Other occurrences are deduped by position.
async function findWordOccurrences(
  registry: PluginRegistry | null,
  word: string,
): Promise<GlossAnnotationAnchor[]> {
  const selectionPlugin = registry?.getPlugin(
    "selection",
  ) as SelectionPluginLike | null;

  const documentId = selectionPlugin?.coreState.core.activeDocumentId;
  const doc = documentId
    ? selectionPlugin?.coreState.core.documents[documentId]?.document
    : null;

  if (
    !selectionPlugin ||
    !doc ||
    typeof selectionPlugin.engine.searchAllPages !== "function"
  ) {
    return [];
  }

  const forms = getWordForms(word);
  const perForm = await Promise.all(
    forms.map((form) => searchKeyword(selectionPlugin, doc, form)),
  );

  const merged: GlossAnnotationAnchor[] = [];
  const seen = new Set<string>();
  for (const anchors of perForm) {
    for (const anchor of anchors) {
      const key = `${anchor.page}:${anchor.startIndex}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(anchor);
    }
  }

  return merged;
}

function isEditableEventTarget(event: Event) {
  const target = event.composedPath()[0] ?? event.target;

  return (
    target instanceof HTMLElement &&
    (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT" ||
      target.isContentEditable)
  );
}

function hasSelectionText(selection: Selection | null | undefined) {
  return Boolean(
    selection && !selection.isCollapsed && selection.toString().trim(),
  );
}

function hasNativeTextSelection(container: EmbedPdfContainer | null) {
  const shadowRootWithSelection = container?.shadowRoot as
    | (ShadowRoot & { getSelection?: () => Selection | null })
    | null
    | undefined;

  return (
    hasSelectionText(window.getSelection()) ||
    hasSelectionText(shadowRootWithSelection?.getSelection?.())
  );
}

function isGlossAnnotationPointerTarget(event: Event) {
  return event.composedPath().some((target) => {
    if (!(target instanceof Element)) return false;

    return Boolean(
      target.closest("[data-gloss-id]") ||
        target.closest("[data-translation-id]"),
    );
  });
}

function getAnnotationContextTarget(
  event: Event,
): AnnotationContextTarget | null {
  for (const target of event.composedPath()) {
    if (!(target instanceof Element)) continue;

    const glossElement = target.closest<HTMLElement>("[data-gloss-id]");
    const glossId = glossElement?.dataset.glossId;
    if (glossId) return { kind: "gloss", id: glossId };

    const translationElement =
      target.closest<HTMLElement>("[data-translation-id]");
    const translationId = translationElement?.dataset.translationId;
    if (translationId) return { kind: "translation", id: translationId };
  }

  return null;
}

function clampContextMenuPosition(
  x: number,
  y: number,
  width: number,
  height: number,
) {
  return {
    x: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
    y: Math.max(8, Math.min(y, window.innerHeight - height - 8)),
  };
}

function getAnchorCurrentScale(
  registry: PluginRegistry | null,
  anchor: GlossAnnotationAnchor,
) {
  const layoutProvider = getScrollCapability(registry);
  return getAnnotationRenderScale(
    anchor.rect,
    layoutProvider?.getRectPositionForPage(anchor.page, anchor.rect) ?? null,
  );
}

function normalizeDeltaForScale(
  delta: { x: number; y: number },
  baseScale: number,
  currentScale: number,
) {
  const ratio =
    baseScale > 0 && currentScale > 0 && Number.isFinite(baseScale)
      ? currentScale / baseScale
      : 1;

  return {
    x: delta.x / ratio,
    y: delta.y / ratio,
  };
}

function normalizeSizeForScale(
  size: { width?: number; height?: number; manualHeight?: boolean },
  baseScale: number,
  currentScale: number,
) {
  const ratio =
    baseScale > 0 && currentScale > 0 && Number.isFinite(baseScale)
      ? currentScale / baseScale
      : 1;

  return {
    width: size.width === undefined ? undefined : size.width / ratio,
    height: size.height === undefined ? undefined : size.height / ratio,
    manualHeight: size.manualHeight,
  };
}

function anchorsOverlap(
  left: GlossAnnotationAnchor,
  right: GlossAnnotationAnchor,
) {
  return (
    left.page === right.page &&
    left.startIndex <= right.endIndex &&
    right.startIndex <= left.endIndex
  );
}

function isCopyKeyboardShortcut(event: KeyboardEvent) {
  return (
    event.key.toLowerCase() === "c" &&
    !event.altKey &&
    !event.shiftKey &&
    (event.metaKey || event.ctrlKey)
  );
}

function isFindKeyboardShortcut(event: KeyboardEvent, shortcut: string) {
  return isKeyboardShortcut(
    event,
    getConfiguredShortcut(shortcut, DEFAULT_FIND_SHORTCUT),
  );
}

function isPointInsideSelection(
  container: EmbedPdfContainer | null,
  x: number,
  y: number,
) {
  const selectionRects = container?.shadowRoot?.querySelectorAll<HTMLElement>(
    'div[style*="mix-blend-mode: multiply"][style*="isolation: isolate"] > div',
  );

  if (!selectionRects?.length) return false;

  return Array.from(selectionRects).some((rectElement) => {
    const rect = rectElement.getBoundingClientRect();
    return (
      x >= rect.left &&
      x <= rect.right &&
      y >= rect.top &&
      y <= rect.bottom
    );
  });
}

function getPdfScrollContainer(
  container: EmbedPdfContainer | null,
): HTMLElement | null {
  const root = container?.shadowRoot;
  if (!root) return null;

  const divs = root.querySelectorAll<HTMLElement>("div");
  for (const div of divs) {
    const style = getComputedStyle(div);
    if (
      (style.overflowY === "auto" || style.overflowY === "scroll") &&
      div.scrollHeight > div.clientHeight
    ) {
      return div;
    }
  }

  return null;
}

function getPdfContentWrapper(
  container: EmbedPdfContainer | null,
): HTMLElement | null {
  const scrollContainer = getPdfScrollContainer(container);
  if (!scrollContainer) return null;

  const divs = scrollContainer.querySelectorAll<HTMLElement>("div");
  for (const div of divs) {
    const style = getComputedStyle(div);
    if (
      style.position === "relative" &&
      div.offsetHeight > scrollContainer.clientHeight
    ) {
      return div;
    }
  }

  return null;
}

function isPointInsideSelectionFromLayout(
  registry: PluginRegistry | null,
  container: EmbedPdfContainer | null,
  x: number,
  y: number,
) {
  const selectionCapability = getSelectionCapability(registry);
  const selection = selectionCapability?.getState().selection;
  const layoutProvider = getScrollCapability(registry);
  const contentWrapper = getPdfContentWrapper(container);
  if (!selection || !layoutProvider || !contentWrapper) return false;

  const wrapperRect = contentWrapper.getBoundingClientRect();
  const startPage = Math.min(selection.start.page, selection.end.page);
  const endPage = Math.max(selection.start.page, selection.end.page);
  const tolerance = 4;

  for (let page = startPage; page <= endPage; page += 1) {
    const rects = selectionCapability.getHighlightRectsForPage(page);
    for (const selectionRect of rects) {
      const position = layoutProvider.getRectPositionForPage(
        page,
        selectionRect,
      );
      if (!position) continue;

      const left = wrapperRect.left + position.origin.x;
      const top = wrapperRect.top + position.origin.y;
      const right = left + position.size.width;
      const bottom = top + position.size.height;

      if (
        x >= left - tolerance &&
        x <= right + tolerance &&
        y >= top - tolerance &&
        y <= bottom + tolerance
      ) {
        return true;
      }
    }
  }

  return false;
}

function isPointInsideSelectionAnchor(
  registry: PluginRegistry | null,
  container: EmbedPdfContainer | null,
  anchor: GlossAnnotationAnchor,
  x: number,
  y: number,
) {
  const layoutProvider = getScrollCapability(registry);
  const contentWrapper = getPdfContentWrapper(container);
  if (!layoutProvider || !contentWrapper) return false;

  const wrapperRect = contentWrapper.getBoundingClientRect();
  const rects = anchor.rects.length ? anchor.rects : [anchor.rect];
  const tolerance = 6;

  return rects.some((selectionRect) => {
    const position = layoutProvider.getRectPositionForPage(
      anchor.page,
      selectionRect,
    );
    if (!position) return false;

    const left = wrapperRect.left + position.origin.x;
    const top = wrapperRect.top + position.origin.y;
    const right = left + position.size.width;
    const bottom = top + position.size.height;

    return (
      x >= left - tolerance &&
      x <= right + tolerance &&
      y >= top - tolerance &&
      y <= bottom + tolerance
    );
  });
}

function isContextMenuPointerEvent(event: MouseEvent | PointerEvent) {
  return event.button === 2 || (event.button === 0 && event.ctrlKey);
}

function isPointerInsidePdfSelection(
  registry: PluginRegistry | null,
  container: EmbedPdfContainer | null,
  event: MouseEvent | PointerEvent,
) {
  return (
    hasTextSelection(registry) &&
    (isPointInsideSelection(container, event.clientX, event.clientY) ||
      isPointInsideSelectionFromLayout(
        registry,
        container,
        event.clientX,
        event.clientY,
      ))
  );
}

function createSelectionContextSnapshotFromRequest(
  request: SelectedGlossRequest | null,
  registry: PluginRegistry | null,
  container: EmbedPdfContainer | null,
  event: MouseEvent | PointerEvent,
): SelectionContextSnapshot | null {
  if (!request) return null;
  if (
    !isPointInsideSelectionAnchor(
      registry,
      container,
      request.anchor,
      event.clientX,
      event.clientY,
    )
  ) {
    return null;
  }

  return {
    createdAt: performance.now(),
    pointerX: event.clientX,
    pointerY: event.clientY,
    insideSelection: true,
    request,
    pendingRequest: Promise.resolve(request),
  };
}

function createSelectionContextSnapshot(
  registry: PluginRegistry | null,
  container: EmbedPdfContainer | null,
  event: MouseEvent | PointerEvent,
  fallbackRequest?: SelectedGlossRequest | null,
): SelectionContextSnapshot | null {
  const insideSelection = isPointerInsidePdfSelection(registry, container, event);
  if (!insideSelection) {
    return createSelectionContextSnapshotFromRequest(
      fallbackRequest ?? null,
      registry,
      container,
      event,
    );
  }

  const snapshot: SelectionContextSnapshot = {
    createdAt: performance.now(),
    pointerX: event.clientX,
    pointerY: event.clientY,
    insideSelection,
  };

  snapshot.pendingRequest = getSelectedGlossRequest(registry)
    .then((request) => {
      snapshot.request = request;
      return request;
    })
    .catch(() => null);

  return snapshot;
}

function restorePdfSelectionFromRequest(
  registry: PluginRegistry | null,
  request: SelectedGlossRequest,
) {
  try {
    const selectionPlugin = registry?.getPlugin("selection") as
      | SelectionPluginLike
      | null;
    const documentId = selectionPlugin?.coreState.core.activeDocumentId;
    if (!selectionPlugin || !documentId) return false;

    const selectionRange: SelectionRange = {
      start: {
        page: request.anchor.page,
        index: request.anchor.startIndex,
      },
      end: {
        page: request.anchor.page,
        index: request.anchor.endIndex,
      },
    };

    if (
      rangeEquals(
        selectionPlugin.getDocumentState(documentId).selection,
        selectionRange,
      )
    ) {
      return true;
    }

    selectionPlugin.applyInstantSelection(
      documentId,
      request.anchor.page,
      request.anchor.startIndex,
      request.anchor.endIndex,
      DEFAULT_PDF_INTERACTION_MODE,
    );
    return true;
  } catch (error) {
    console.error("Failed to restore PDF selection:", error);
    return false;
  }
}

function getMatchingSelectionContextSnapshot(
  snapshot: SelectionContextSnapshot | null,
  event: MouseEvent,
) {
  if (!snapshot?.insideSelection) return null;

  const age = performance.now() - snapshot.createdAt;
  const dx = Math.abs(event.clientX - snapshot.pointerX);
  const dy = Math.abs(event.clientY - snapshot.pointerY);

  if (
    age > SELECTION_CONTEXT_SNAPSHOT_MAX_AGE ||
    dx > SELECTION_CONTEXT_SNAPSHOT_MAX_DISTANCE ||
    dy > SELECTION_CONTEXT_SNAPSHOT_MAX_DISTANCE
  ) {
    return null;
  }

  return snapshot;
}

function resolveSelectionContextRequest(
  snapshot: SelectionContextSnapshot | null,
  registry: PluginRegistry | null,
) {
  if (snapshot?.request) return Promise.resolve(snapshot.request);
  if (snapshot?.pendingRequest) return snapshot.pendingRequest;

  return getSelectedGlossRequest(registry).catch(() => null);
}

function isRecentSelectionRequest(createdAt: number) {
  return performance.now() - createdAt <= RECENT_SELECTION_REQUEST_MAX_AGE;
}

function applySelectionColorOverride(container: EmbedPdfContainer | null) {
  const root = container?.shadowRoot;
  if (!root) return;

  let style = root.querySelector<HTMLStyleElement>(
    "style[data-glossreader-selection-color]",
  );

  if (!style) {
    style = document.createElement("style");
    style.dataset.glossreaderSelectionColor = "";
    root.appendChild(style);
  }

  style.textContent = `
div[style*="mix-blend-mode: multiply"][style*="isolation: isolate"] > div {
  background: ${SELECTION_COLOR} !important;
}
`;
}

function App() {
  const [documents, setDocuments] = useState<OpenDocument[]>([]);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [recentDocuments, setRecentDocuments] = useState<RecentDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [draggingPdf, setDraggingPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [settings, setSettings] = useState<SettingsType>(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [updateDialog, setUpdateDialog] = useState<UpdateDialogState | null>(
    null,
  );
  const [viewerReadyRevision, setViewerReadyRevision] = useState(0);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [selectedTranslationId, setSelectedTranslationId] = useState<string | null>(null);
  const [annotationRevision, setAnnotationRevision] = useState(0);
  const [translationRevision, setTranslationRevision] = useState(0);
  const documentCounterRef = useRef(0);
  const objectUrlsRef = useRef<Set<string>>(new Set());
  const annotationsRef = useRef<Map<string, GlossAnnotation[]>>(new Map());
  const translationsRef = useRef<Map<string, SideTranslationOverlay[]>>(new Map());
  const renderAnnotationFrameRef = useRef<number | null>(null);
  const renderAnnotationTimeoutsRef = useRef<number[]>([]);
  const registryRef = useRef<PluginRegistry | null>(null);
  const embedPdfContainerRef = useRef<EmbedPdfContainer | null>(null);
  const selectionContextSnapshotRef =
    useRef<SelectionContextSnapshot | null>(null);
  const lastSelectionRequestRef = useRef<SelectedGlossRequest | null>(null);
  const lastSelectionRequestAtRef = useRef(0);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingUpdateRef = useRef<Update | null>(null);

  const activeDocument = useMemo(
    () =>
      documents.find((openDocument) => openDocument.id === activeDocumentId) ??
      null,
    [activeDocumentId, documents],
  );

  const reader = settings.reader;

  const viewerConfig = useMemo<PDFViewerConfig>(
    () => ({
      src: activeDocument?.url,
      wasmUrl: "/embedpdf/pdfium.wasm",
      worker: false,
      fontFallback: null,
      fonts: {
        ui: null,
        signature: null,
      },
      theme: { preference: reader.theme as "light" | "dark" | "system" },
      tabBar: "never",
      zoom: {
        defaultZoomLevel: toZoomLevel(reader.defaultZoom),
      },
      scroll: {
        defaultStrategy: toScrollStrategy(reader.scrollDirection),
        defaultPageGap: reader.pageGap,
      },
      spread: {
        defaultSpreadMode: toSpreadMode(reader.spreadMode),
      },
    }),
    [activeDocument, reader],
  );

  // Bumping the PDFViewer key on a reader-setting change remounts the viewer so
  // the new defaults take effect on the current document. The Settings overlay
  // covers the viewer while it reloads, so the remount is effectively invisible.
  const readerConfigKey = useMemo(
    () =>
      [
        reader.defaultZoom,
        reader.scrollDirection,
        reader.spreadMode,
        reader.pageGap,
        reader.theme,
      ].join("|"),
    [reader],
  );

  const updateActiveDocumentAnnotations = useCallback(
    (updater: (annotations: GlossAnnotation[]) => GlossAnnotation[]) => {
      if (!activeDocument) return [];

      const currentAnnotations =
        annotationsRef.current.get(activeDocument.id) ?? [];
      const nextAnnotations = updater(currentAnnotations);
      annotationsRef.current.set(activeDocument.id, nextAnnotations);
      saveStoredAnnotations(activeDocument, nextAnnotations);
      setAnnotationRevision((revision) => revision + 1);

      return nextAnnotations;
    },
    [activeDocument],
  );

  const updateActiveDocumentTranslations = useCallback(
    (updater: (translations: SideTranslationOverlay[]) => SideTranslationOverlay[]) => {
      if (!activeDocument) return [];

      const currentTranslations =
        translationsRef.current.get(activeDocument.id) ?? [];
      const nextTranslations = updater(currentTranslations);
      translationsRef.current.set(activeDocument.id, nextTranslations);
      saveStoredTranslations(activeDocument, nextTranslations);
      setTranslationRevision((revision) => revision + 1);

      return nextTranslations;
    },
    [activeDocument],
  );

  const renderActiveAnnotations = useCallback(() => {
    if (!activeDocument) return;

    let annotations = annotationsRef.current.get(activeDocument.id) ?? [];
    let translations = translationsRef.current.get(activeDocument.id) ?? [];
    const layoutProvider = getScrollCapability(registryRef.current);

    if (layoutProvider) {
      let changedAnnotations = false;
      let changedTranslations = false;

      annotations = annotations.map((annotation) => {
        if (annotation.scale) return annotation;

        changedAnnotations = true;
        return {
          ...annotation,
          scale: getAnnotationRenderScale(
            annotation.anchor.rect,
            layoutProvider.getRectPositionForPage(
              annotation.anchor.page,
              annotation.anchor.rect,
            ),
          ),
        };
      });

      translations = translations.map((translation) => {
        if (translation.scale) return translation;

        changedTranslations = true;
        return {
          ...translation,
          scale: getAnnotationRenderScale(
            translation.anchor.rect,
            layoutProvider.getRectPositionForPage(
              translation.anchor.page,
              translation.anchor.rect,
            ),
          ),
        };
      });

      if (changedAnnotations) {
        annotationsRef.current.set(activeDocument.id, annotations);
        saveStoredAnnotations(activeDocument, annotations);
      }

      if (changedTranslations) {
        translationsRef.current.set(activeDocument.id, translations);
        saveStoredTranslations(activeDocument, translations);
      }
    }

    renderAnnotations(
      embedPdfContainerRef.current,
      annotations,
      translations,
      settings,
      layoutProvider,
      {
        selectedId: selectedAnnotationId,
        onSelect: (id) => {
          setSelectedAnnotationId(id);
          setSelectedTranslationId(null);
        },
        onEdit: (id, definition) => {
          updateActiveDocumentAnnotations((currentAnnotations) => {
            const groupId = currentAnnotations.find(
              (annotation) => annotation.id === id,
            )?.groupId;
            return currentAnnotations.map((annotation) =>
              annotation.id === id ||
              (!!groupId && annotation.groupId === groupId)
                ? { ...annotation, definition }
                : annotation,
            );
          });
          window.requestAnimationFrame(renderActiveAnnotations);
        },
        onMove: (id, delta, currentScale) => {
          updateActiveDocumentAnnotations((currentAnnotations) =>
            currentAnnotations.map((annotation) => {
              if (annotation.id !== id) return annotation;

              const baseScale = annotation.scale ?? currentScale;
              const normalizedDelta = normalizeDeltaForScale(
                delta,
                baseScale,
                currentScale,
              );

              return {
                ...annotation,
                scale: baseScale,
                offset: {
                  x: (annotation.offset?.x ?? 0) + normalizedDelta.x,
                  y: (annotation.offset?.y ?? 0) + normalizedDelta.y,
                },
              };
            }),
          );
          window.requestAnimationFrame(renderActiveAnnotations);
        },
        selectedTranslationId,
        onSelectTranslation: (id) => {
          setSelectedTranslationId(id);
          setSelectedAnnotationId(null);
        },
        onEditTranslation: (id, translation) => {
          updateActiveDocumentTranslations((currentTranslations) =>
            currentTranslations.map((item) =>
              item.id === id
                ? {
                    ...item,
                    translation,
                    loading: false,
                    error: undefined,
                  }
                : item,
            ),
          );
          window.requestAnimationFrame(renderActiveAnnotations);
        },
        onMoveTranslation: (id, delta, currentScale) => {
          updateActiveDocumentTranslations((currentTranslations) =>
            currentTranslations.map((translation) => {
              if (translation.id !== id) return translation;

              const baseScale = translation.scale ?? currentScale;
              const normalizedDelta = normalizeDeltaForScale(
                delta,
                baseScale,
                currentScale,
              );

              return {
                ...translation,
                scale: baseScale,
                offset: {
                  x: (translation.offset?.x ?? 0) + normalizedDelta.x,
                  y: (translation.offset?.y ?? 0) + normalizedDelta.y,
                },
              };
            }),
          );
          window.requestAnimationFrame(renderActiveAnnotations);
        },
        onResizeTranslation: (id, size, currentScale) => {
          updateActiveDocumentTranslations((currentTranslations) =>
            currentTranslations.map((translation) => {
              if (translation.id !== id) return translation;

              const baseScale = translation.scale ?? currentScale;
              const normalizedSize = normalizeSizeForScale(
                size,
                baseScale,
                currentScale,
              );

              return {
                ...translation,
                scale: baseScale,
                size: {
                  ...translation.size,
                  ...normalizedSize,
                },
              };
            }),
          );
          window.requestAnimationFrame(renderActiveAnnotations);
        },
      },
    );
  }, [
    activeDocument,
    selectedAnnotationId,
    selectedTranslationId,
    settings,
    updateActiveDocumentAnnotations,
    updateActiveDocumentTranslations,
  ]);

  const scheduleRenderActiveAnnotations = useCallback(() => {
    if (renderAnnotationFrameRef.current !== null) {
      window.cancelAnimationFrame(renderAnnotationFrameRef.current);
    }

    for (const timeoutId of renderAnnotationTimeoutsRef.current) {
      window.clearTimeout(timeoutId);
    }
    renderAnnotationTimeoutsRef.current = [];

    const render = () => {
      renderActiveAnnotations();
    };

    renderAnnotationFrameRef.current = window.requestAnimationFrame(() => {
      renderAnnotationFrameRef.current = null;
      render();
      renderAnnotationTimeoutsRef.current = [50, 150, 300].map((delay) =>
        window.setTimeout(render, delay),
      );
    });
  }, [renderActiveAnnotations]);

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current.clear();
      if (renderAnnotationFrameRef.current !== null) {
        window.cancelAnimationFrame(renderAnnotationFrameRef.current);
      }
      for (const timeoutId of renderAnnotationTimeoutsRef.current) {
        window.clearTimeout(timeoutId);
      }
      renderAnnotationTimeoutsRef.current = [];
    };
  }, []);

  const prevActiveDocumentIdRef = useRef<string | null>(null);
  useEffect(() => {
    const prevId = prevActiveDocumentIdRef.current;
    const nextId = activeDocument?.id ?? null;
    prevActiveDocumentIdRef.current = nextId;

    if (prevId === nextId) return;

    clearAnnotations(embedPdfContainerRef.current);
    selectionContextSnapshotRef.current = null;
    lastSelectionRequestRef.current = null;
    lastSelectionRequestAtRef.current = 0;
    setContextMenu(null);
    setSelectedAnnotationId(null);
    setSelectedTranslationId(null);

    // Do NOT clear embedPdfContainerRef here when a document is active.
    // onInit runs synchronously during the child PDFViewer's mount effect,
    // which fires BEFORE this parent effect, so nulling the container ref
    // here would clobber the freshly-initialised viewer and leave annotation
    // rendering with no shadow root to target. The ref is owned by
    // onInit/onReady and only needs clearing once no document remains.
    registryRef.current = null;
    if (!activeDocument) {
      embedPdfContainerRef.current = null;
    }

    if (activeDocument && !annotationsRef.current.has(activeDocument.id)) {
      annotationsRef.current.set(
        activeDocument.id,
        loadStoredAnnotations(activeDocument),
      );
    }

    if (activeDocument && !translationsRef.current.has(activeDocument.id)) {
      translationsRef.current.set(
        activeDocument.id,
        loadStoredTranslations(activeDocument),
      );
      setTranslationRevision((revision) => revision + 1);
    }
  }, [activeDocument]);

  useEffect(() => {
    if (!activeDocument || viewerReadyRevision === 0) return;

    const selectionCapability = getSelectionCapability(registryRef.current);
    if (!selectionCapability?.onSelectionChange) return;

    let disposed = false;
    let cacheRevision = 0;
    const cacheCurrentSelection = () => {
      let selection: SelectionRange | null = null;
      try {
        selection = selectionCapability.getState().selection;
      } catch {
        return;
      }
      if (!selection) return;

      const revision = ++cacheRevision;
      const readRequest = () => {
        if (disposed || revision !== cacheRevision) return;

        void getSelectedGlossRequest(registryRef.current)
          .then((request) => {
            if (disposed || revision !== cacheRevision) return;
            lastSelectionRequestRef.current = request;
            lastSelectionRequestAtRef.current = performance.now();
          })
          .catch(() => {
            // The selection plugin can finish rect/text slices a tick after the event.
          });
      };

      readRequest();
      window.setTimeout(readRequest, 50);
    };

    cacheCurrentSelection();
    const unsubscribe = selectionCapability.onSelectionChange((event) => {
      if (event.selection) {
        cacheCurrentSelection();
      }
    });

    return () => {
      disposed = true;
      cacheRevision += 1;
      unsubscribe();
    };
  }, [activeDocument, viewerReadyRevision]);

  useEffect(() => {
    if (!activeDocument || viewerReadyRevision === 0) return;
    scheduleRenderActiveAnnotations();
  }, [
    activeDocument,
    annotationRevision,
    scheduleRenderActiveAnnotations,
    settings.display.annotationColor,
    settings.display.annotationFontSize,
    settings.display.annotationOpacity,
    settings.display.translationColor,
    settings.display.translationFontSize,
    settings.display.translationOpacity,
    selectedAnnotationId,
    selectedTranslationId,
    translationRevision,
    viewerReadyRevision,
  ]);

  useEffect(() => {
    if (!activeDocument || viewerReadyRevision === 0) return;

    const registry = registryRef.current;
    const unsubscribers: Array<() => void> = [];
    const schedule = () => scheduleRenderActiveAnnotations();
    const subscribe = (hook?: (listener: () => void) => () => void) => {
      if (!hook) return;

      try {
        const unsubscribe = hook(schedule);
        if (typeof unsubscribe === "function") {
          unsubscribers.push(unsubscribe);
        }
      } catch (err) {
        console.error("Failed to subscribe to PDF layout event:", err);
      }
    };

    const scrollCapability = getScrollCapability(registry);
    const viewportCapability = getViewportCapability(registry);
    const zoomCapability = getZoomCapability(registry);

    subscribe(scrollCapability?.onScroll);
    subscribe(scrollCapability?.onLayoutChange);
    subscribe(scrollCapability?.onLayoutReady);
    subscribe(viewportCapability?.onViewportChange);
    subscribe(viewportCapability?.onViewportResize);
    subscribe(viewportCapability?.onScrollChange);
    subscribe(zoomCapability?.onZoomChange);
    subscribe(zoomCapability?.onStateChange);

    window.addEventListener("resize", schedule);
    window.document.addEventListener("scroll", schedule, true);

    const resizeObserver = new ResizeObserver(schedule);
    const container = embedPdfContainerRef.current;
    if (container instanceof Element) {
      resizeObserver.observe(container);
    }

    schedule();

    return () => {
      for (const unsubscribe of unsubscribers) {
        unsubscribe();
      }
      window.removeEventListener("resize", schedule);
      window.document.removeEventListener("scroll", schedule, true);
      resizeObserver.disconnect();
    };
  }, [activeDocument, scheduleRenderActiveAnnotations, viewerReadyRevision]);

  useEffect(() => {
    const clearSelectedAnnotation = (event: PointerEvent) => {
      if (
        (!selectedAnnotationId && !selectedTranslationId) ||
        isGlossAnnotationPointerTarget(event)
      ) {
        return;
      }

      setSelectedAnnotationId(null);
      setSelectedTranslationId(null);
    };

    window.document.addEventListener("pointerdown", clearSelectedAnnotation, true);

    return () => {
      window.document.removeEventListener(
        "pointerdown",
        clearSelectedAnnotation,
        true,
      );
    };
  }, [selectedAnnotationId, selectedTranslationId]);

  useEffect(() => {
    const stopContextMenuPointerDown = (event: MouseEvent | PointerEvent) => {
      if (!isContextMenuPointerEvent(event)) return;

      if (event.type === "pointerdown") {
        suppressPdfSelectionClearForContextPointerDown();
      }

      const nextSnapshot = createSelectionContextSnapshot(
        registryRef.current,
        embedPdfContainerRef.current,
        event,
        isRecentSelectionRequest(lastSelectionRequestAtRef.current)
          ? lastSelectionRequestRef.current
          : null,
      );
      if (nextSnapshot) {
        selectionContextSnapshotRef.current = nextSnapshot;
      } else if (
        event.type !== "mousedown" ||
        !getMatchingSelectionContextSnapshot(
          selectionContextSnapshotRef.current,
          event,
        )
      ) {
        selectionContextSnapshotRef.current = null;
      }

      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const selectionCapability = getSelectionCapability(registryRef.current);
      const annotationTarget = getAnnotationContextTarget(event);
      const selectionSnapshot =
        getMatchingSelectionContextSnapshot(
          selectionContextSnapshotRef.current,
          event,
        ) ??
        createSelectionContextSnapshotFromRequest(
          isRecentSelectionRequest(lastSelectionRequestAtRef.current)
            ? lastSelectionRequestRef.current
            : null,
          registryRef.current,
          embedPdfContainerRef.current,
          event,
        );

      if (annotationTarget) {
        selectionContextSnapshotRef.current = null;
        selectionCapability?.clear();
        if (annotationTarget.kind === "gloss") {
          setSelectedAnnotationId(annotationTarget.id);
          setSelectedTranslationId(null);
        } else {
          setSelectedTranslationId(annotationTarget.id);
          setSelectedAnnotationId(null);
        }

        setContextMenu({
          type: "annotation",
          ...clampContextMenuPosition(
            event.clientX,
            event.clientY,
            ANNOTATION_CONTEXT_MENU_WIDTH,
            ANNOTATION_CONTEXT_MENU_HEIGHT,
          ),
          target: annotationTarget,
        });
        return;
      }

      const hasSelection = hasTextSelection(registryRef.current);
      const clickedInsideSelection =
        Boolean(selectionSnapshot) ||
        hasSelection ||
        isPointerInsidePdfSelection(
          registryRef.current,
          embedPdfContainerRef.current,
          event,
        );

      if (!hasSelection && selectionSnapshot?.request) {
        restorePdfSelectionFromRequest(
          registryRef.current,
          selectionSnapshot.request,
        );
      }

      const menuPosition = clampContextMenuPosition(
        event.clientX,
        event.clientY,
        SELECTION_CONTEXT_MENU_WIDTH,
        SELECTION_CONTEXT_MENU_HEIGHT,
      );

      setContextMenu({
        type: "selection",
        ...menuPosition,
        canCopy: clickedInsideSelection,
        request: selectionSnapshot?.request,
      });

      if (!clickedInsideSelection) {
        selectionContextSnapshotRef.current = null;
        return;
      }

      void resolveSelectionContextRequest(
        selectionSnapshot,
        registryRef.current,
      )
        .then((request) => {
          setContextMenu((currentMenu) => {
            if (
              currentMenu?.type !== "selection" ||
              currentMenu.x !== menuPosition.x ||
              currentMenu.y !== menuPosition.y
            ) {
              return currentMenu;
            }

            if (!request) {
              return { ...currentMenu, canCopy: false, request: undefined };
            }
            lastSelectionRequestRef.current = request;
            lastSelectionRequestAtRef.current = performance.now();
            if (!hasTextSelection(registryRef.current)) {
              restorePdfSelectionFromRequest(registryRef.current, request);
            }

            return {
              ...currentMenu,
              canCopy: true,
              request,
            };
          });
        })
        .catch(() => {
          setContextMenu((currentMenu) => {
            if (
              currentMenu?.type !== "selection" ||
              currentMenu.x !== menuPosition.x ||
              currentMenu.y !== menuPosition.y
            ) {
              return currentMenu;
            }

            return { ...currentMenu, canCopy: false, request: undefined };
          });
        });
    };

    const handleCopyShortcut = (event: KeyboardEvent) => {
      if (
        !isCopyKeyboardShortcut(event) ||
        isEditableEventTarget(event) ||
        hasNativeTextSelection(embedPdfContainerRef.current) ||
        !hasTextSelection(registryRef.current)
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      copySelectedPdfText(registryRef.current);
    };

    window.addEventListener(
      "pointerdown",
      stopContextMenuPointerDown,
      true,
    );
    window.addEventListener(
      "mousedown",
      stopContextMenuPointerDown,
      true,
    );
    window.document.addEventListener("keydown", handleCopyShortcut, true);
    window.addEventListener("contextmenu", handleContextMenu, true);

    return () => {
      window.removeEventListener(
        "pointerdown",
        stopContextMenuPointerDown,
        true,
      );
      window.removeEventListener(
        "mousedown",
        stopContextMenuPointerDown,
        true,
      );
      window.document.removeEventListener("keydown", handleCopyShortcut, true);
      window.removeEventListener("contextmenu", handleContextMenu, true);
    };
  }, []);

  useEffect(() => {
    if (!contextMenu) return;

    const closeContextMenu = (event: PointerEvent) => {
      if (
        contextMenuRef.current &&
        event.target instanceof Node &&
        contextMenuRef.current.contains(event.target)
      ) {
        return;
      }

      selectionContextSnapshotRef.current = null;
      setContextMenu(null);
    };

    const closeContextMenuFromScroll = () => {
      selectionContextSnapshotRef.current = null;
      setContextMenu(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        selectionContextSnapshotRef.current = null;
        setContextMenu(null);
      }
    };

    window.document.addEventListener("pointerdown", closeContextMenu);
    window.document.addEventListener("scroll", closeContextMenuFromScroll, true);
    window.document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.document.removeEventListener("pointerdown", closeContextMenu);
      window.document.removeEventListener(
        "scroll",
        closeContextMenuFromScroll,
        true,
      );
      window.document.removeEventListener("keydown", handleKeyDown);
    };
  }, [contextMenu]);

  const addRecentDocument = useCallback((recentDocument: RecentDocument) => {
    setRecentDocuments((currentDocuments) => [
      recentDocument,
      ...currentDocuments.filter(
        (documentItem) => documentItem.id !== recentDocument.id,
      ),
    ].slice(0, 12));
  }, []);

  const addPdfSources = useCallback(
    (sources: PdfSource[]) => {
      if (!sources.length) return;

      const nextDocuments = [...documents];
      let nextActiveDocumentId = activeDocumentId;

      sources.forEach((source) => {
        const existingDocument = source.filePath
          ? nextDocuments.find(
              (documentItem) => documentItem.filePath === source.filePath,
            )
          : null;

        if (existingDocument) {
          const filePath = source.filePath ?? existingDocument.filePath;
          if (!filePath) return;

          nextActiveDocumentId = existingDocument.id;
          addRecentDocument({
            id: filePath,
            name: existingDocument.name,
            filePath,
          });
          return;
        }

        documentCounterRef.current += 1;
        const id = `local-${documentCounterRef.current}`;
        const url = URL.createObjectURL(
          new Blob([source.data], { type: "application/pdf" }),
        );

        objectUrlsRef.current.add(url);

        const openDocument: OpenDocument = {
          id,
          name: source.name,
          url,
          filePath: source.filePath,
        };

        nextDocuments.push(openDocument);
        nextActiveDocumentId = id;
        addRecentDocument({
          id: source.filePath ?? id,
          name: source.name,
          filePath: source.filePath,
        });
      });

      setDocuments(nextDocuments);
      setActiveDocumentId(nextActiveDocumentId);
    },
    [activeDocumentId, addRecentDocument, documents],
  );

  const openPdfPaths = useCallback(
    async (filePaths: string[]) => {
      const pdfPaths = filePaths.filter(isPdfPath);
      if (!pdfPaths.length) return;

      try {
        setError(null);
        setLoading(true);
        const results = await Promise.all(pdfPaths.map(readPdfFile));
        addPdfSources(results.map(pdfResultToSource));
      } catch (err) {
        console.error("Failed to open dropped files:", err);
        setError((err as Error).message || "Failed to open PDF");
      } finally {
        setLoading(false);
      }
    },
    [addPdfSources],
  );

  const openBrowserPdfFiles = useCallback(
    async (files: File[]) => {
      const pdfFiles = files.filter(isPdfFile);
      if (!pdfFiles.length) return;

      try {
        setError(null);
        setLoading(true);
        const sources = await Promise.all(
          pdfFiles.map(async (file) => ({
            name: file.name,
            data: await file.arrayBuffer(),
          })),
        );
        addPdfSources(sources);
      } catch (err) {
        console.error("Failed to open local files:", err);
        setError((err as Error).message || "Failed to open PDF");
      } finally {
        setLoading(false);
      }
    },
    [addPdfSources],
  );

  useEffect(() => {
    if (!isTauri()) return;

    let disposed = false;
    let unlisten: (() => void) | null = null;

    getCurrentWebview()
      .onDragDropEvent((event) => {
        const { payload } = event;

        if (payload.type === "enter" || payload.type === "over") {
          setDraggingPdf(true);
          return;
        }

        setDraggingPdf(false);

        if (payload.type === "drop") {
          void openPdfPaths(payload.paths);
        }
      })
      .then((cleanup) => {
        if (disposed) cleanup();
        else unlisten = cleanup;
      })
      .catch((err) => {
        console.error("Failed to listen for file drop events:", err);
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [openPdfPaths]);

  // Open PDFs handed to the app by the OS (Finder "Open With", Zotero, etc.).
  useEffect(() => {
    if (!isTauri()) return;

    let disposed = false;
    let unlisten: (() => void) | null = null;

    // Warm opens (app already running) arrive as backend events.
    listen<string[]>("open-files", (event) => {
      void openPdfPaths(event.payload);
    })
      .then((cleanup) => {
        if (disposed) cleanup();
        else unlisten = cleanup;
      })
      .catch((err) => {
        console.error("Failed to listen for open-file events:", err);
      });

    // Cold-start files (the app was launched to open them) were queued by the
    // backend before the webview was ready; drain that queue now.
    void invoke<string[]>("take_pending_files")
      .then((paths) => {
        if (!disposed && paths.length) void openPdfPaths(paths);
      })
      .catch((err) => {
        console.error("Failed to read pending files:", err);
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [openPdfPaths]);

  const runUpdateCheck = useCallback(async (options: { silent: boolean }) => {
    if (!isTauri()) {
      if (!options.silent) {
        setUpdateDialog({ phase: "error", error: "请在应用中检测更新。" });
      }
      return;
    }

    if (!options.silent) setUpdateDialog({ phase: "checking" });

    try {
      const update = await checkForUpdate();
      if (!update) {
        pendingUpdateRef.current = null;
        if (options.silent) setUpdateDialog(null);
        else setUpdateDialog({ phase: "uptodate" });
        return;
      }

      pendingUpdateRef.current = update;
      setUpdateDialog({
        phase: "available",
        version: update.version,
        currentVersion: update.currentVersion,
        notes: update.body ?? "",
      });
    } catch (error) {
      if (options.silent) {
        console.warn(error instanceof Error ? error.message : String(error));
        return;
      }
      const message = isUpdaterEndpointMissing(error)
        ? "暂时没有可用的更新。"
        : `检测更新失败：${
            error instanceof Error ? error.message : String(error)
          }`;
      setUpdateDialog({ phase: "error", error: message });
    }
  }, []);

  const handleStartUpdateDownload = useCallback(async () => {
    const update = pendingUpdateRef.current;
    if (!update) return;

    setUpdateDialog((current) => ({
      phase: "downloading",
      version: update.version,
      currentVersion: update.currentVersion,
      notes: current?.notes,
      progress: undefined,
    }));

    try {
      await downloadAndInstallUpdate(update, (progress) => {
        setUpdateDialog((current) =>
          current
            ? { ...current, phase: "downloading", progress: progress.percent }
            : current,
        );
      });
      setUpdateDialog({
        phase: "ready",
        version: update.version,
        currentVersion: update.currentVersion,
      });
    } catch (error) {
      setUpdateDialog({
        phase: "error",
        error: `更新失败：${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    }
  }, []);

  const handleRestartForUpdate = useCallback(async () => {
    try {
      await restartApp();
    } catch (error) {
      setUpdateDialog({
        phase: "error",
        error: `重启失败：${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    }
  }, []);

  const dismissUpdateDialog = useCallback(() => setUpdateDialog(null), []);

  // Silent check on launch: only surface a dialog when an update is available.
  useEffect(() => {
    if (!isTauri() || import.meta.env.DEV) return;
    void runUpdateCheck({ silent: true });
  }, [runUpdateCheck]);

  const handleViewerInit = useCallback((container: EmbedPdfContainer) => {
    embedPdfContainerRef.current = container;
    applySelectionColorOverride(container);
    injectAnnotationStyles(container);
  }, []);

  const handleViewerReady = useCallback((registry: PluginRegistry) => {
    registryRef.current = registry;
    patchSelectionWordBoundary(registry);
    patchSelectionContextMenuClear(registry);
    patchPdfFindShortcut(registry, settings.shortcuts.find);
    patchPdfReaderShortcuts(registry, settings.shortcuts);
    setViewerReadyRevision((revision) => revision + 1);
    scheduleRenderActiveAnnotations();
  }, [scheduleRenderActiveAnnotations, settings.shortcuts]);

  useEffect(() => {
    if (viewerReadyRevision === 0) return;
    patchPdfFindShortcut(registryRef.current, settings.shortcuts.find);
    patchPdfReaderShortcuts(registryRef.current, settings.shortcuts);
  }, [settings.shortcuts, viewerReadyRevision]);

  const handleCopySelection = useCallback(() => {
    if (contextMenu?.type !== "selection" || !contextMenu.canCopy) return;

    if (contextMenu.request?.text) {
      void writeTextToClipboard(contextMenu.request.text).catch((error) => {
        console.error("Failed to write selected text to clipboard:", error);
      });
    } else {
      copySelectedPdfText(registryRef.current);
    }
    selectionContextSnapshotRef.current = null;
    setContextMenu(null);
  }, [contextMenu]);

  const handleDeleteContextAnnotation = useCallback(() => {
    if (contextMenu?.type !== "annotation") return;

    const { target } = contextMenu;
    if (target.kind === "gloss") {
      updateActiveDocumentAnnotations((currentAnnotations) =>
        currentAnnotations.filter((annotation) => annotation.id !== target.id),
      );
      setSelectedAnnotationId((currentId) =>
        currentId === target.id ? null : currentId,
      );
    } else {
      updateActiveDocumentTranslations((currentTranslations) =>
        currentTranslations.filter((translation) => translation.id !== target.id),
      );
      setSelectedTranslationId((currentId) =>
        currentId === target.id ? null : currentId,
      );
    }

    selectionContextSnapshotRef.current = null;
    setContextMenu(null);
    window.requestAnimationFrame(renderActiveAnnotations);
  }, [
    contextMenu,
    renderActiveAnnotations,
    updateActiveDocumentAnnotations,
    updateActiveDocumentTranslations,
  ]);

  const handleCollapseGlossGroup = useCallback(() => {
    if (
      !activeDocument ||
      contextMenu?.type !== "annotation" ||
      contextMenu.target.kind !== "gloss"
    ) {
      return;
    }

    const targetId = contextMenu.target.id;
    const annotations = annotationsRef.current.get(activeDocument.id) ?? [];
    const groupId = annotations.find((item) => item.id === targetId)?.groupId;

    selectionContextSnapshotRef.current = null;
    setContextMenu(null);
    if (!groupId) return;

    // Keep the clicked occurrence (detached into a standalone gloss) and drop
    // every other member of the group.
    updateActiveDocumentAnnotations((currentAnnotations) =>
      currentAnnotations
        .filter((item) => item.id === targetId || item.groupId !== groupId)
        .map((item) =>
          item.id === targetId ? { ...item, groupId: undefined } : item,
        ),
    );
    setSelectedAnnotationId(targetId);
    window.requestAnimationFrame(renderActiveAnnotations);
  }, [
    activeDocument,
    contextMenu,
    renderActiveAnnotations,
    updateActiveDocumentAnnotations,
  ]);

  const handleReloadContextAnnotation = useCallback(() => {
    if (!activeDocument || contextMenu?.type !== "annotation") return;

    const { target } = contextMenu;
    selectionContextSnapshotRef.current = null;
    setContextMenu(null);

    if (target.kind === "gloss") {
      const annotations = annotationsRef.current.get(activeDocument.id) ?? [];
      const annotation = annotations.find((item) => item.id === target.id);
      if (!annotation?.sourceText) return;

      const groupId = annotation.groupId;
      const inGroup = (item: GlossAnnotation) =>
        item.id === target.id || (!!groupId && item.groupId === groupId);

      updateActiveDocumentAnnotations((currentAnnotations) =>
        currentAnnotations.map((item) =>
          inGroup(item) ? { ...item, definition: "..." } : item,
        ),
      );
      window.requestAnimationFrame(renderActiveAnnotations);

      void fetchGloss(annotation.sourceText, "", settings)
        .then((result) => {
          updateActiveDocumentAnnotations((currentAnnotations) =>
            currentAnnotations.map((item) =>
              inGroup(item)
                ? { ...item, definition: result.definition }
                : item,
            ),
          );
          window.requestAnimationFrame(renderActiveAnnotations);
        })
        .catch(() => {
          updateActiveDocumentAnnotations((currentAnnotations) =>
            currentAnnotations.map((item) =>
              inGroup(item) ? { ...item, definition: "✗" } : item,
            ),
          );
          window.requestAnimationFrame(renderActiveAnnotations);
        });
      return;
    }

    const translations = translationsRef.current.get(activeDocument.id) ?? [];
    const translation = translations.find((item) => item.id === target.id);
    if (!translation?.sourceText) return;

    updateActiveDocumentTranslations((currentTranslations) =>
      currentTranslations.map((item) =>
        item.id === target.id
          ? {
              ...item,
              translation: "",
              loading: true,
              error: undefined,
            }
          : item,
      ),
    );
    window.requestAnimationFrame(renderActiveAnnotations);

    void fetchTranslation(translation.sourceText, settings)
      .then((result) => {
        updateActiveDocumentTranslations((currentTranslations) =>
          currentTranslations.map((item) =>
            item.id === target.id
              ? {
                  ...item,
                  translation: result.translation,
                  loading: false,
                  error: undefined,
                }
              : item,
          ),
        );
        window.requestAnimationFrame(renderActiveAnnotations);
      })
      .catch(() => {
        updateActiveDocumentTranslations((currentTranslations) =>
          currentTranslations.map((item) =>
            item.id === target.id
              ? {
                  ...item,
                  translation: "",
                  loading: false,
                  error: "翻译失败",
                }
              : item,
          ),
        );
        window.requestAnimationFrame(renderActiveAnnotations);
      });
  }, [
    activeDocument,
    contextMenu,
    renderActiveAnnotations,
    settings,
    updateActiveDocumentAnnotations,
    updateActiveDocumentTranslations,
  ]);

  const handleUpdateContextAnnotationStyle = useCallback(
    (field: keyof AnnotationStyle, value: string) => {
      if (contextMenu?.type !== "annotation") return;

      const { target } = contextMenu;
      if (target.kind === "gloss") {
        updateActiveDocumentAnnotations((currentAnnotations) =>
          currentAnnotations.map((annotation) =>
            annotation.id === target.id
              ? {
                  ...annotation,
                  style: {
                    ...annotation.style,
                    [field]: value,
                  },
                }
              : annotation,
          ),
        );
      } else {
        updateActiveDocumentTranslations((currentTranslations) =>
          currentTranslations.map((translation) =>
            translation.id === target.id
              ? {
                  ...translation,
                  style: {
                    ...translation.style,
                    [field]: value,
                  },
                }
              : translation,
          ),
        );
      }

      window.requestAnimationFrame(renderActiveAnnotations);
    },
    [
      contextMenu,
      renderActiveAnnotations,
      updateActiveDocumentAnnotations,
      updateActiveDocumentTranslations,
    ],
  );

  const handleOpenFiles = useCallback(async () => {
    if (!isTauri()) {
      fileInputRef.current?.click();
      return;
    }

    try {
      setError(null);
      setLoading(true);
      const results = await openPdfFiles();
      addPdfSources(results.map(pdfResultToSource));
    } catch (err) {
      console.error("Failed to open file:", err);
      setError((err as Error).message || "Failed to open PDF");
    } finally {
      setLoading(false);
    }
  }, [addPdfSources]);

  const handleBrowserFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.currentTarget.files ?? []);
      event.currentTarget.value = "";
      void openBrowserPdfFiles(files);
    },
    [openBrowserPdfFiles],
  );

  const handleAppDragEnter = useCallback((event: DragEvent) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    setDraggingPdf(true);
  }, []);

  const handleAppDragOver = useCallback((event: DragEvent) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDraggingPdf(true);
  }, []);

  const handleAppDragLeave = useCallback((event: DragEvent) => {
    if (
      event.relatedTarget instanceof Node &&
      event.currentTarget.contains(event.relatedTarget)
    ) {
      return;
    }

    setDraggingPdf(false);
  }, []);

  const handleAppDrop = useCallback(
    (event: DragEvent) => {
      if (!event.dataTransfer.files.length) return;

      event.preventDefault();
      setDraggingPdf(false);
      void openBrowserPdfFiles(Array.from(event.dataTransfer.files));
    },
    [openBrowserPdfFiles],
  );

  const handleSelectDocument = useCallback((documentId: string) => {
    setActiveDocumentId(documentId);
  }, []);

  const handleShowHomeTab = useCallback(() => {
    setActiveDocumentId(null);
    setError(null);
  }, []);

  const handleCloseHomeTab = useCallback(() => {
    setActiveDocumentId(documents[documents.length - 1]?.id ?? null);
  }, [documents]);

  const handleCloseDocument = useCallback(
    (documentId: string) => {
      const closeIndex = documents.findIndex(
        (documentItem) => documentItem.id === documentId,
      );
      if (closeIndex === -1) return;

      const closingDocument = documents[closeIndex];
      URL.revokeObjectURL(closingDocument.url);
      objectUrlsRef.current.delete(closingDocument.url);
      annotationsRef.current.delete(closingDocument.id);
      translationsRef.current.delete(closingDocument.id);

      const nextDocuments = documents.filter(
        (documentItem) => documentItem.id !== documentId,
      );

      setDocuments(nextDocuments);

      if (activeDocumentId === documentId) {
        setActiveDocumentId(
          nextDocuments[Math.min(closeIndex, nextDocuments.length - 1)]?.id ??
            null,
        );
      }
    },
    [activeDocumentId, documents],
  );

  const handleOpenRecent = useCallback(
    (recentDocument: RecentDocument) => {
      const openDocument = documents.find((documentItem) =>
        recentDocument.filePath
          ? documentItem.filePath === recentDocument.filePath
          : documentItem.id === recentDocument.id,
      );

      if (openDocument) {
        setActiveDocumentId(openDocument.id);
        return;
      }

      if (recentDocument.filePath) {
        void openPdfPaths([recentDocument.filePath]);
      }
    },
    [documents, openPdfPaths],
  );

  const handleClearRecents = useCallback(() => {
    setRecentDocuments([]);
  }, []);

  const handleSettingsChange = useCallback((newSettings: SettingsType) => {
    setSettings(newSettings);
    saveSettings(newSettings);
  }, []);

  const handleGlossWord = useCallback(
    async (selectionRequest?: SelectedGlossRequest) => {
      selectionContextSnapshotRef.current = null;
      setContextMenu(null);
      if (!activeDocument) return;

      let request: SelectedGlossRequest;
      if (selectionRequest) {
        request = selectionRequest;
      } else {
        try {
          request = await getSelectedGlossRequest(registryRef.current);
        } catch {
          const cachedRequest = lastSelectionRequestRef.current;
          if (
            !cachedRequest ||
            !isRecentSelectionRequest(lastSelectionRequestAtRef.current)
          ) {
            return;
          }
          request = cachedRequest;
        }
      }

      lastSelectionRequestRef.current = request;
      lastSelectionRequestAtRef.current = performance.now();

      const selectedText = request.text.replace(/\s+/g, " ").trim();
      if (!selectedText) return;
      const renderScale = getAnchorCurrentScale(registryRef.current, request.anchor);

      if (shouldUseSideTranslation(selectedText)) {
        const translationId = createTranslationId();
        const pendingTranslation: SideTranslationOverlay = {
          id: translationId,
          sourceText: selectedText,
          translation: "",
          loading: true,
          createdAt: Date.now(),
          anchor: request.anchor,
          scale: renderScale,
        };

        updateActiveDocumentTranslations((currentTranslations) => [
          pendingTranslation,
          ...currentTranslations,
        ]);

        try {
          const result = await fetchTranslation(selectedText, settings);
          updateActiveDocumentTranslations((currentTranslations) =>
            currentTranslations.map((translation) =>
              translation.id === translationId
                ? {
                    ...translation,
                    translation: result.translation,
                    loading: false,
                    error: undefined,
                  }
                : translation,
            ),
          );
        } catch {
          updateActiveDocumentTranslations((currentTranslations) =>
            currentTranslations.map((translation) =>
              translation.id === translationId
                ? {
                    ...translation,
                    translation: "",
                    loading: false,
                    error: "翻译失败",
                  }
                : translation,
            ),
          );
        }
        return;
      }

      const willFanOut =
        settings.glossing.autoGlossAllOccurrences &&
        isSingleWordGloss(selectedText);
      const groupId = willFanOut ? createGlossAnnotationId() : undefined;

      const annotationId = createGlossAnnotationId();
      const pendingAnnotation: GlossAnnotation = {
        id: annotationId,
        groupId,
        sourceText: selectedText,
        definition: "...",
        anchor: request.anchor,
        scale: renderScale,
      };

      updateActiveDocumentAnnotations((currentAnnotations) => [
        ...currentAnnotations.filter(
          (annotation) => !anchorsOverlap(annotation.anchor, request.anchor),
        ),
        pendingAnnotation,
      ]);
      scheduleRenderActiveAnnotations();

      try {
        const result = await fetchGloss(selectedText, "", settings);
        const annotations = annotationsRef.current.get(activeDocument.id);
        const annotation = annotations?.find((item) => item.id === annotationId);
        if (!annotations || !annotation) return;

        updateActiveDocumentAnnotations((currentAnnotations) =>
          currentAnnotations.map((item) =>
            item.id === annotationId
              ? { ...item, definition: result.definition }
              : item,
          ),
        );
        scheduleRenderActiveAnnotations();

        if (willFanOut && groupId) {
          const occurrences = await findWordOccurrences(
            registryRef.current,
            selectedText,
          );
          const others = occurrences
            .filter((anchor) => !anchorsOverlap(anchor, request.anchor))
            .slice(0, MAX_AUTO_GLOSS_OCCURRENCES);

          const stillPresent = annotationsRef.current
            .get(activeDocument.id)
            ?.some((item) => item.id === annotationId);

          if (others.length && stillPresent) {
            updateActiveDocumentAnnotations((currentAnnotations) => {
              // Drop any prior annotation sitting on a spot we're about to fill
              // (e.g. a stale group from re-glossing the same word); the seed
              // annotation is always kept.
              const deduped = currentAnnotations.filter(
                (item) =>
                  item.id === annotationId ||
                  !others.some((anchor) => anchorsOverlap(item.anchor, anchor)),
              );
              const additions: GlossAnnotation[] = others.map((anchor) => ({
                id: createGlossAnnotationId(),
                groupId,
                sourceText: selectedText,
                definition: result.definition,
                anchor,
                scale: getAnchorCurrentScale(registryRef.current, anchor),
              }));
              return [...deduped, ...additions];
            });
            scheduleRenderActiveAnnotations();
          }
        }
      } catch {
        const annotations = annotationsRef.current.get(activeDocument.id);
        const annotation = annotations?.find((item) => item.id === annotationId);
        if (!annotations || !annotation) return;

        updateActiveDocumentAnnotations((currentAnnotations) =>
          currentAnnotations.map((item) =>
            item.id === annotationId ? { ...item, definition: "✗" } : item,
          ),
        );
        scheduleRenderActiveAnnotations();
      }
    },
    [
      activeDocument,
      scheduleRenderActiveAnnotations,
      settings,
      updateActiveDocumentAnnotations,
      updateActiveDocumentTranslations,
    ],
  );

  const handleGlossFromContextMenu = useCallback(() => {
    if (contextMenu?.type !== "selection") return;
    void handleGlossWord(contextMenu.request);
  }, [contextMenu, handleGlossWord]);

  useEffect(() => {
    const handleGlossShortcut = (event: KeyboardEvent) => {
      const hasSelectionForGloss =
        hasTextSelection(registryRef.current) ||
        hasNativeTextSelection(embedPdfContainerRef.current) ||
        (Boolean(lastSelectionRequestRef.current) &&
          isRecentSelectionRequest(lastSelectionRequestAtRef.current));

      if (
        !isKeyboardShortcut(
          event,
          getConfiguredShortcut(settings.shortcuts.gloss, DEFAULT_GLOSS_SHORTCUT),
        ) ||
        isEditableEventTarget(event) ||
        !hasSelectionForGloss
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      void handleGlossWord();
    };

    window.addEventListener("keydown", handleGlossShortcut, true);

    return () => {
      window.removeEventListener("keydown", handleGlossShortcut, true);
    };
  }, [handleGlossWord, settings.shortcuts.gloss]);

  useEffect(() => {
    const handleFindShortcut = (event: KeyboardEvent) => {
      if (
        isEditableEventTarget(event) ||
        !isFindKeyboardShortcut(event, settings.shortcuts.find)
      ) {
        return;
      }

      const commands = getCommandsCapability(registryRef.current);
      if (!commands) return;

      try {
        const command = commands.resolve(PDF_FIND_COMMAND_ID);
        if (command.disabled || !command.visible) return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        commands.execute(PDF_FIND_COMMAND_ID, undefined, "keyboard");
      } catch {
        return;
      }
    };

    window.addEventListener("keydown", handleFindShortcut, true);

    return () => {
      window.removeEventListener("keydown", handleFindShortcut, true);
    };
  }, [settings.shortcuts.find]);

  const annotationContextStyle = (() => {
    if (contextMenu?.type !== "annotation" || !activeDocument) return null;

    const { target } = contextMenu;
    if (target.kind === "gloss") {
      const annotation = (
        annotationsRef.current.get(activeDocument.id) ?? []
      ).find((item) => item.id === target.id);

      return {
        fontSize:
          annotation?.style?.fontSize ?? settings.display.translationFontSize,
        color: annotation?.style?.color ?? settings.display.translationColor,
        opacity:
          annotation?.style?.opacity ?? settings.display.translationOpacity,
      };
    }

    const translation = (
      translationsRef.current.get(activeDocument.id) ?? []
    ).find((item) => item.id === target.id);

    return {
      fontSize:
        translation?.style?.fontSize ?? settings.display.translationFontSize,
      color: translation?.style?.color ?? settings.display.translationColor,
      opacity:
        translation?.style?.opacity ?? settings.display.translationOpacity,
    };
  })();

  // True when the right-clicked gloss belongs to a multi-occurrence group, so we
  // can offer "取消整篇标注（仅留此处）".
  const canCollapseGlossGroup = (() => {
    if (
      contextMenu?.type !== "annotation" ||
      contextMenu.target.kind !== "gloss" ||
      !activeDocument
    ) {
      return false;
    }

    const annotations = annotationsRef.current.get(activeDocument.id) ?? [];
    const groupId = annotations.find(
      (item) => item.id === contextMenu.target.id,
    )?.groupId;
    if (!groupId) return false;

    return annotations.filter((item) => item.groupId === groupId).length > 1;
  })();

  return (
    <div
      className={`app${draggingPdf ? " is-dragging-pdf" : ""}`}
      onDragEnter={handleAppDragEnter}
      onDragLeave={handleAppDragLeave}
      onDragOver={handleAppDragOver}
      onDrop={handleAppDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="app-file-input"
        onChange={handleBrowserFileChange}
      />

      {documents.length > 0 && (
        <div className="app-tabbar">
          <div className="app-tabs" role="tablist" aria-label="Open PDFs">
            {documents.map((openDocument) => (
              <div
                key={openDocument.id}
                className={`app-tab${
                  openDocument.id === activeDocument?.id ? " is-active" : ""
                }`}
              >
                <button
                  className="app-tab-select"
                  type="button"
                  role="tab"
                  aria-selected={openDocument.id === activeDocument?.id}
                  title={openDocument.name}
                  onClick={() => handleSelectDocument(openDocument.id)}
                >
                  <span className="app-tab-title">{openDocument.name}</span>
                </button>
                <button
                  className="app-tab-close"
                  type="button"
                  aria-label={`Close ${openDocument.name}`}
                  onClick={() => handleCloseDocument(openDocument.id)}
                >
                  x
                </button>
              </div>
            ))}

            {!activeDocument && (
              <div className="app-tab is-active">
                <button
                  className="app-tab-select"
                  type="button"
                  role="tab"
                  aria-selected="true"
                  title="New Tab"
                  onClick={handleShowHomeTab}
                >
                  <span className="app-tab-title">New Tab</span>
                </button>
                <button
                  className="app-tab-close"
                  type="button"
                  aria-label="Close New Tab"
                  onClick={handleCloseHomeTab}
                >
                  x
                </button>
              </div>
            )}
          </div>

          <button
            className="app-tab-add"
            type="button"
            aria-label="New Tab"
            title="New Tab"
            disabled={loading}
            onClick={handleShowHomeTab}
          >
            +
          </button>

          {loading && <span className="app-tab-status">Opening...</span>}
          {error && <span className="app-error-inline">{error}</span>}

          <button
            className="app-settings-btn"
            type="button"
            aria-label="Settings"
            title="Settings"
            onClick={() => setShowSettings(true)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        </div>
      )}

      <div className="app-viewer">
        {activeDocument ? (
          <PDFViewer
            key={`${activeDocument.id}:${readerConfigKey}`}
            config={viewerConfig}
            style={{ width: "100%", height: "100%" }}
            onInit={handleViewerInit}
            onReady={handleViewerReady}
          />
        ) : (
          <main className="app-home">
            <section className="home-content" aria-label="Open PDF document">
              <h1>Open PDF Document</h1>

              <button
                className="home-drop-zone"
                type="button"
                disabled={loading}
                onClick={handleOpenFiles}
              >
                <span className="home-document-icon" aria-hidden="true">
                  <span className="home-document-icon-page is-left" />
                  <span className="home-document-icon-page is-right" />
                  <span className="home-document-icon-page is-front">
                    <span />
                    <span />
                    <span />
                    <span />
                  </span>
                </span>
                <span className="home-select-button">
                  {loading ? "Opening..." : "Select File"}
                </span>
                <span className="home-drop-label">or drop files here</span>
              </button>

              {error && <p className="home-error">{error}</p>}

              <div className="home-recents-header">
                <h2>Recents</h2>
                {recentDocuments.length > 0 && (
                  <button
                    className="home-clear-recents"
                    type="button"
                    onClick={handleClearRecents}
                  >
                    Clear Recents
                  </button>
                )}
              </div>

              {recentDocuments.length > 0 ? (
                <div className="home-recents-grid">
                  {recentDocuments.map((recentDocument) => (
                    <button
                      key={recentDocument.id}
                      className="home-recent-card"
                      type="button"
                      title={recentDocument.name}
                      onClick={() => handleOpenRecent(recentDocument)}
                    >
                      <span className="home-recent-preview" aria-hidden="true">
                        <span className="home-recent-preview-title" />
                        <span className="home-recent-preview-line is-wide" />
                        <span className="home-recent-preview-line" />
                        <span className="home-recent-preview-line is-short" />
                        <span className="home-recent-preview-columns">
                          <span />
                          <span />
                        </span>
                      </span>
                      <span className="home-recent-name">
                        {recentDocument.name}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="home-recents-empty">No recent PDFs</p>
              )}
            </section>
          </main>
        )}
      </div>

      {documents.length === 0 && (
        <button
          className="app-settings-btn is-home"
          type="button"
          aria-label="Settings"
          title="Settings"
          onClick={() => setShowSettings(true)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
      )}

      {showSettings && (
        <Settings
          settings={settings}
          onSettingsChange={handleSettingsChange}
          onClose={() => setShowSettings(false)}
          onCheckForUpdate={() => void runUpdateCheck({ silent: false })}
        />
      )}

      {updateDialog && (
        <UpdateDialog
          {...updateDialog}
          onStartDownload={() => void handleStartUpdateDownload()}
          onRestart={() => void handleRestartForUpdate()}
          onClose={dismissUpdateDialog}
        />
      )}

      {contextMenu?.type === "selection" && (
        <div
          ref={contextMenuRef}
          className="app-context-menu"
          role="menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="app-context-menu-item"
            disabled={!contextMenu.canCopy}
            onClick={handleCopySelection}
            role="menuitem"
            type="button"
          >
            Copy
          </button>
          <button
            className="app-context-menu-item"
            disabled={!contextMenu.canCopy}
            onClick={handleGlossFromContextMenu}
            role="menuitem"
            type="button"
          >
            释义
            <span className="app-context-menu-shortcut">
              {formatKeyboardShortcutLabel(settings.shortcuts.gloss)}
            </span>
          </button>
        </div>
      )}

      {contextMenu?.type === "annotation" && annotationContextStyle && (
        <div
          ref={contextMenuRef}
          className="app-context-menu is-annotation-menu"
          role="menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="app-context-menu-item"
            onClick={handleReloadContextAnnotation}
            role="menuitem"
            type="button"
          >
            {contextMenu.target.kind === "translation"
              ? "重新获取翻译"
              : "重新获取释义"}
          </button>

          <div className="app-context-menu-section">
            <label className="app-context-menu-label" htmlFor="annotation-font-size">
              字号
            </label>
            <select
              id="annotation-font-size"
              className="app-context-menu-select"
              value={annotationContextStyle.fontSize}
              onChange={(event) =>
                handleUpdateContextAnnotationStyle(
                  "fontSize",
                  event.currentTarget.value,
                )
              }
            >
              {QUICK_FONT_SIZE_OPTIONS.map((fontSize) => (
                <option key={fontSize} value={fontSize}>
                  {fontSize}
                </option>
              ))}
            </select>
          </div>

          <div className="app-context-menu-section">
            <span className="app-context-menu-label">颜色</span>
            <div className="app-context-menu-colors">
              {QUICK_COLOR_OPTIONS.map((color) => (
                <button
                  key={color.value}
                  className={`app-context-color-button${
                    annotationContextStyle.color === color.value
                      ? " is-active"
                      : ""
                  }`}
                  type="button"
                  title={color.label}
                  aria-label={color.label}
                  onClick={() =>
                    handleUpdateContextAnnotationStyle("color", color.value)
                  }
                >
                  <span style={{ background: color.color }} />
                </button>
              ))}
            </div>
          </div>

          <div className="app-context-menu-section">
            <label className="app-context-menu-label" htmlFor="annotation-opacity">
              透明度
            </label>
            <select
              id="annotation-opacity"
              className="app-context-menu-select"
              value={annotationContextStyle.opacity}
              onChange={(event) =>
                handleUpdateContextAnnotationStyle(
                  "opacity",
                  event.currentTarget.value,
                )
              }
            >
              {QUICK_OPACITY_OPTIONS.map((opacity) => (
                <option key={opacity.value} value={opacity.value}>
                  {opacity.label}
                </option>
              ))}
            </select>
          </div>

          {canCollapseGlossGroup && (
            <button
              className="app-context-menu-item"
              onClick={handleCollapseGlossGroup}
              role="menuitem"
              type="button"
            >
              取消整篇标注（仅留此处）
            </button>
          )}

          <button
            className="app-context-menu-item is-destructive"
            onClick={handleDeleteContextAnnotation}
            role="menuitem"
            type="button"
          >
            删除
          </button>
        </div>
      )}

    </div>
  );
}

export default App;
