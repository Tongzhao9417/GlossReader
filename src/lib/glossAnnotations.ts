import type { EmbedPdfContainer } from "@embedpdf/react-pdf-viewer";
import type { Settings } from "./settings";

const ANNOTATION_STYLE_ATTR = "data-glossreader-annotations";

const COLOR_MAP: Record<string, string> = {
  gray: "#888888",
  red: "#c0392b",
  blue: "#2980b9",
  green: "#2e7d32",
  purple: "#7b3fb3",
  black: "#1f2328",
};

let annotationCounter = 0;

export interface PdfRectLike {
  origin: {
    x: number;
    y: number;
  };
  size: {
    width: number;
    height: number;
  };
}

export interface GlossAnnotationAnchor {
  page: number;
  startIndex: number;
  endIndex: number;
  rect: PdfRectLike;
  rects: PdfRectLike[];
}

export interface AnnotationStyle {
  fontSize?: string;
  color?: string;
  opacity?: string;
}

export interface TranslationBoxSize {
  width?: number;
  height?: number;
  manualHeight?: boolean;
}

export interface GlossAnnotation {
  id: string;
  sourceText: string;
  definition: string;
  /**
   * Links every occurrence of the same word that was glossed together via
   * "gloss all occurrences". Standalone/legacy glosses leave this undefined.
   */
  groupId?: string;
  anchor: GlossAnnotationAnchor;
  scale?: number;
  offset?: {
    x: number;
    y: number;
  };
  style?: AnnotationStyle;
}

export interface SideTranslationOverlay {
  id: string;
  sourceText: string;
  translation: string;
  loading: boolean;
  error?: string;
  createdAt: number;
  anchor: GlossAnnotationAnchor;
  scale?: number;
  offset?: {
    x: number;
    y: number;
  };
  size?: TranslationBoxSize;
  style?: AnnotationStyle;
}

export interface AnnotationLayoutProvider {
  getRectPositionForPage: (
    page: number,
    rect: PdfRectLike,
  ) => PdfRectLike | null;
}

export interface AnnotationRenderOptions {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onEdit: (id: string, definition: string) => void;
  onMove: (id: string, delta: { x: number; y: number }, scale: number) => void;
  selectedTranslationId: string | null;
  onSelectTranslation: (id: string) => void;
  onEditTranslation: (id: string, translation: string) => void;
  onMoveTranslation: (
    id: string,
    delta: { x: number; y: number },
    scale: number,
  ) => void;
  onResizeTranslation: (
    id: string,
    size: TranslationBoxSize,
    scale: number,
  ) => void;
}

const ANNOTATION_EVENT_NAMES = [
  "pointerdown",
  "mousedown",
  "mouseup",
  "click",
  "dblclick",
] as const;

function stopAnnotationEventPropagation(event: Event) {
  event.stopPropagation();
}

function getScrollContainer(
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

function getContentWrapper(
  container: EmbedPdfContainer | null,
): HTMLElement | null {
  const scrollContainer = getScrollContainer(container);
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

export function injectAnnotationStyles(
  container: EmbedPdfContainer | null,
): void {
  const root = container?.shadowRoot;
  if (!root) return;

  if (root.querySelector(`style[${ANNOTATION_STYLE_ATTR}]`)) return;

  const style = document.createElement("style");
  style.setAttribute(ANNOTATION_STYLE_ATTR, "");
  style.textContent = `
[data-gloss-id] {
  position: absolute;
  pointer-events: auto;
  user-select: none;
  -webkit-user-select: none;
  white-space: nowrap;
  text-align: center;
  line-height: 1.15;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-weight: 650;
  transform: translateX(-50%);
  cursor: grab;
}

[data-gloss-id].is-selected {
  padding: 1px 3px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.9);
  outline: 1px solid rgba(47, 116, 208, 0.42);
}

[data-gloss-id].is-editing {
  outline-color: rgba(47, 116, 208, 0.78);
  cursor: text;
  user-select: text;
  -webkit-user-select: text;
}

[data-gloss-text] {
  display: inline-block;
  min-width: 8px;
}

[data-gloss-text][contenteditable="true"] {
  outline: none;
}

[data-gloss-highlight-id] {
  position: absolute;
  pointer-events: none;
  background: rgba(255, 230, 92, 0.42);
  border-radius: 2px;
  mix-blend-mode: multiply;
  z-index: 4;
}

[data-translation-id] {
  position: absolute;
  width: 260px;
  min-width: 140px;
  padding: 1px 4px 2px;
  color: #d72d2d;
  background: rgba(255, 255, 255, 0.72);
  border-radius: 4px;
  box-sizing: border-box;
  font: 17px/1.15 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-weight: 650;
  white-space: normal;
  word-break: break-word;
  pointer-events: auto;
  cursor: grab;
  overflow: auto;
  z-index: 6;
}

[data-translation-id].is-selected {
  outline: 1px solid rgba(215, 45, 45, 0.45);
  background: rgba(255, 255, 255, 0.9);
}

[data-translation-id].is-editing {
  outline-color: rgba(215, 45, 45, 0.78);
  cursor: text;
  user-select: text;
  -webkit-user-select: text;
}

[data-translation-text] {
  display: block;
  min-height: 1em;
}

[data-translation-text][contenteditable="true"] {
  outline: none;
}

[data-translation-highlight-id] {
  position: absolute;
  pointer-events: none;
  background: rgba(255, 184, 28, 0.52);
  border-radius: 2px;
  mix-blend-mode: multiply;
  z-index: 4;
}

[data-translation-resize-handle] {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 14px;
  height: 14px;
  cursor: nwse-resize;
  opacity: 0;
}

[data-translation-id]:hover [data-translation-resize-handle],
[data-translation-id].is-selected [data-translation-resize-handle] {
  opacity: 1;
}

[data-translation-resize-handle]::before {
  content: "";
  right: 0;
  bottom: 0;
  position: absolute;
  width: 9px;
  height: 9px;
  border-right: 2px solid rgba(90, 90, 90, 0.45);
  border-bottom: 2px solid rgba(90, 90, 90, 0.45);
}
`;
  root.appendChild(style);
}

export function createGlossAnnotationId() {
  return `gloss-${++annotationCounter}`;
}

export function getAnnotationRenderScale(
  sourceRect: PdfRectLike,
  renderedRect: PdfRectLike | null,
) {
  if (!renderedRect) return 1;

  const widthScale =
    sourceRect.size.width > 0
      ? renderedRect.size.width / sourceRect.size.width
      : 0;
  const heightScale =
    sourceRect.size.height > 0
      ? renderedRect.size.height / sourceRect.size.height
      : 0;

  const scale = widthScale || heightScale || 1;
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

function getScaleRatio(baseScale: number | undefined, currentScale: number) {
  if (!baseScale || !Number.isFinite(baseScale) || baseScale <= 0) return 1;

  const ratio = currentScale / baseScale;
  return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

function scaleCssPx(value: string, ratio: number, min: number, max: number) {
  const px = parseFloat(value);
  return `${clamp((Number.isFinite(px) ? px : min) * ratio, min, max)}px`;
}

function scaleOffset(
  offset: { x: number; y: number } | undefined,
  ratio: number,
) {
  return {
    x: (offset?.x ?? 0) * ratio,
    y: (offset?.y ?? 0) * ratio,
  };
}

function parseOpacity(value: string | undefined, fallback: number) {
  const parsed = parseInt(value ?? "", 10);
  return (Number.isFinite(parsed) && parsed > 0 ? parsed : fallback) / 100;
}

function resolveVisualStyle(
  style: AnnotationStyle | undefined,
  defaults: {
    fontSize: string;
    color: string;
    opacity: string;
  },
  fallbackColor: string,
  fallbackOpacity: number,
) {
  const colorName = style?.color ?? defaults.color;

  return {
    color: COLOR_MAP[colorName] ?? fallbackColor,
    fontSize: style?.fontSize || defaults.fontSize,
    opacity: parseOpacity(style?.opacity ?? defaults.opacity, fallbackOpacity),
  };
}

function createAnnotationElement(
  annotation: GlossAnnotation,
  settings: Settings,
  position: PdfRectLike,
  currentScale: number,
  options: AnnotationRenderOptions,
): HTMLElement {
  const scaleRatio = getScaleRatio(annotation.scale, currentScale);
  const style = resolveVisualStyle(
    annotation.style,
    {
      fontSize: settings.display.translationFontSize || "18px",
      color: settings.display.translationColor || "red",
      opacity: settings.display.translationOpacity || "100",
    },
    COLOR_MAP.red,
    100,
  );
  const fontSize = scaleCssPx(style.fontSize || "18px", scaleRatio, 6, 64);
  const fontSizePx = parseFloat(fontSize) || 10;
  const offset = scaleOffset(annotation.offset, scaleRatio);

  const el = document.createElement("div");
  el.setAttribute("data-gloss-id", annotation.id);
  if (options.selectedId === annotation.id) {
    el.classList.add("is-selected");
  }
  el.style.left = `${
    position.origin.x + position.size.width / 2 + offset.x
  }px`;
  el.style.top = `${
    position.origin.y - fontSizePx - 4 * scaleRatio + offset.y
  }px`;
  el.style.fontSize = fontSize;
  el.style.color = style.color;
  el.style.opacity = String(style.opacity);
  el.style.zIndex = "5";

  const text = document.createElement("span");
  text.setAttribute("data-gloss-text", "");
  text.textContent = annotation.definition;
  el.appendChild(text);

  for (const eventName of ANNOTATION_EVENT_NAMES) {
    el.addEventListener(eventName, stopAnnotationEventPropagation);
  }

  el.addEventListener("pointerdown", (event) => {
    if (
      event.button !== 0 ||
      event.ctrlKey ||
      el.classList.contains("is-editing")
    ) {
      options.onSelect(annotation.id);
      return;
    }

    beginDraggingAnnotation(event, el, annotation, options, currentScale);
  });
  el.addEventListener("dblclick", (event) => {
    event.preventDefault();
    beginEditingAnnotation(el, text, annotation, options);
  });

  return el;
}

function createHighlightElement(
  annotation: GlossAnnotation,
  rect: PdfRectLike,
): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("data-gloss-highlight-id", annotation.id);
  el.style.left = `${rect.origin.x}px`;
  el.style.top = `${rect.origin.y}px`;
  el.style.width = `${rect.size.width}px`;
  el.style.height = `${rect.size.height}px`;
  return el;
}

function createTranslationHighlightElement(
  translation: SideTranslationOverlay,
  rect: PdfRectLike,
): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("data-translation-highlight-id", translation.id);
  el.style.left = `${rect.origin.x}px`;
  el.style.top = `${rect.origin.y}px`;
  el.style.width = `${rect.size.width}px`;
  el.style.height = `${rect.size.height}px`;
  return el;
}

function createTranslationElement(
  translation: SideTranslationOverlay,
  position: PdfRectLike,
  settings: Settings,
  currentScale: number,
  options: AnnotationRenderOptions,
): HTMLElement {
  const scaleRatio = getScaleRatio(translation.scale, currentScale);
  const style = resolveVisualStyle(
    translation.style,
    {
      fontSize: settings.display.translationFontSize || "18px",
      color: settings.display.translationColor || "red",
      opacity: settings.display.translationOpacity || "100",
    },
    COLOR_MAP.red,
    100,
  );
  const fontSize = scaleCssPx(style.fontSize || "18px", scaleRatio, 6, 72);
  const offset = scaleOffset(translation.offset, scaleRatio);

  const el = document.createElement("div");
  el.setAttribute("data-translation-id", translation.id);
  if (options.selectedTranslationId === translation.id) {
    el.classList.add("is-selected");
  }

  el.style.left = `${
    position.origin.x + position.size.width + 24 * scaleRatio + offset.x
  }px`;
  el.style.top = `${position.origin.y - 4 * scaleRatio + offset.y}px`;
  el.style.width = `${(translation.size?.width ?? 260) * scaleRatio}px`;
  if (translation.size?.manualHeight && translation.size.height) {
    el.style.height = `${translation.size.height * scaleRatio}px`;
  }
  el.style.color = style.color;
  el.style.fontSize = fontSize;
  el.style.opacity = String(style.opacity);

  const text = document.createElement("span");
  text.setAttribute("data-translation-text", "");
  text.textContent = translation.loading
    ? "翻译中..."
    : translation.error || translation.translation;
  el.appendChild(text);

  const resizeHandle = document.createElement("span");
  resizeHandle.setAttribute("data-translation-resize-handle", "");
  resizeHandle.title = "调整大小";
  resizeHandle.addEventListener("pointerdown", (event) => {
    beginResizingTranslation(event, el, translation, options, currentScale);
  });
  el.appendChild(resizeHandle);

  for (const eventName of ANNOTATION_EVENT_NAMES) {
    el.addEventListener(eventName, stopAnnotationEventPropagation);
  }

  el.addEventListener("pointerdown", (event) => {
    if (
      event.button !== 0 ||
      event.ctrlKey ||
      el.classList.contains("is-editing") ||
      (event.target instanceof Element &&
        event.target.closest("[data-translation-resize-handle]"))
    ) {
      options.onSelectTranslation(translation.id);
      return;
    }

    beginDraggingTranslation(event, el, translation, options, currentScale);
  });
  el.addEventListener("dblclick", (event) => {
    event.preventDefault();
    beginEditingTranslation(el, text, translation, options);
  });

  return el;
}

function beginEditingAnnotation(
  annotationElement: HTMLElement,
  textElement: HTMLElement,
  annotation: GlossAnnotation,
  options: AnnotationRenderOptions,
) {
  annotationElement.classList.add("is-editing");
  textElement.setAttribute("contenteditable", "true");
  textElement.focus();

  const selection = annotationElement.ownerDocument.getSelection();
  if (selection) {
    const range = annotationElement.ownerDocument.createRange();
    range.selectNodeContents(textElement);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  let canceled = false;
  const finish = () => {
    textElement.removeEventListener("blur", finish);
    textElement.removeEventListener("keydown", handleKeyDown);
    textElement.removeAttribute("contenteditable");
    annotationElement.classList.remove("is-editing");

    if (canceled) {
      textElement.textContent = annotation.definition;
      return;
    }

    const nextDefinition = (textElement.textContent ?? "").trim();
    if (nextDefinition && nextDefinition !== annotation.definition) {
      options.onEdit(annotation.id, nextDefinition);
    } else {
      textElement.textContent = annotation.definition;
    }
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      canceled = true;
      textElement.blur();
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (event.key === "Enter") {
      textElement.blur();
      event.preventDefault();
      event.stopPropagation();
    }
  };

  textElement.addEventListener("blur", finish);
  textElement.addEventListener("keydown", handleKeyDown);
}

function beginDraggingAnnotation(
  event: PointerEvent,
  annotationElement: HTMLElement,
  annotation: GlossAnnotation,
  options: AnnotationRenderOptions,
  currentScale: number,
) {
  event.preventDefault();
  event.stopPropagation();

  const startX = event.clientX;
  const startY = event.clientY;
  const startLeft = parseFloat(annotationElement.style.left) || 0;
  const startTop = parseFloat(annotationElement.style.top) || 0;
  const ownerDocument = annotationElement.ownerDocument;

  const handlePointerMove = (moveEvent: PointerEvent) => {
    const dx = moveEvent.clientX - startX;
    const dy = moveEvent.clientY - startY;
    annotationElement.style.left = `${startLeft + dx}px`;
    annotationElement.style.top = `${startTop + dy}px`;
  };

  const handlePointerUp = (upEvent: PointerEvent) => {
    ownerDocument.removeEventListener("pointermove", handlePointerMove);
    ownerDocument.removeEventListener("pointerup", handlePointerUp);

    const dx = upEvent.clientX - startX;
    const dy = upEvent.clientY - startY;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
      options.onMove(annotation.id, { x: dx, y: dy }, currentScale);
      options.onSelect(annotation.id);
    }
  };

  ownerDocument.addEventListener("pointermove", handlePointerMove);
  ownerDocument.addEventListener("pointerup", handlePointerUp, { once: true });
}

function beginEditingTranslation(
  translationElement: HTMLElement,
  textElement: HTMLElement,
  translation: SideTranslationOverlay,
  options: AnnotationRenderOptions,
) {
  if (translation.loading) return;

  translationElement.classList.add("is-editing");
  textElement.setAttribute("contenteditable", "true");
  textElement.focus();

  const selection = translationElement.ownerDocument.getSelection();
  if (selection) {
    const range = translationElement.ownerDocument.createRange();
    range.selectNodeContents(textElement);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  let canceled = false;
  const finish = () => {
    textElement.removeEventListener("blur", finish);
    textElement.removeEventListener("keydown", handleKeyDown);
    textElement.removeAttribute("contenteditable");
    translationElement.classList.remove("is-editing");

    if (canceled) {
      textElement.textContent = translation.error || translation.translation;
      return;
    }

    const nextTranslation = (textElement.textContent ?? "").trim();
    if (
      nextTranslation &&
      nextTranslation !== translation.translation &&
      !translation.error
    ) {
      options.onEditTranslation(translation.id, nextTranslation);
    } else {
      textElement.textContent = translation.error || translation.translation;
    }
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      canceled = true;
      textElement.blur();
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      textElement.blur();
      event.preventDefault();
      event.stopPropagation();
    }
  };

  textElement.addEventListener("blur", finish);
  textElement.addEventListener("keydown", handleKeyDown);
}

function beginDraggingTranslation(
  event: PointerEvent,
  translationElement: HTMLElement,
  translation: SideTranslationOverlay,
  options: AnnotationRenderOptions,
  currentScale: number,
) {
  event.preventDefault();
  event.stopPropagation();

  const startX = event.clientX;
  const startY = event.clientY;
  const startLeft = parseFloat(translationElement.style.left) || 0;
  const startTop = parseFloat(translationElement.style.top) || 0;
  const ownerDocument = translationElement.ownerDocument;

  const handlePointerMove = (moveEvent: PointerEvent) => {
    const dx = moveEvent.clientX - startX;
    const dy = moveEvent.clientY - startY;
    translationElement.style.left = `${startLeft + dx}px`;
    translationElement.style.top = `${startTop + dy}px`;
  };

  const handlePointerUp = (upEvent: PointerEvent) => {
    ownerDocument.removeEventListener("pointermove", handlePointerMove);
    ownerDocument.removeEventListener("pointerup", handlePointerUp);

    const dx = upEvent.clientX - startX;
    const dy = upEvent.clientY - startY;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
      options.onMoveTranslation(translation.id, { x: dx, y: dy }, currentScale);
      options.onSelectTranslation(translation.id);
    }
  };

  ownerDocument.addEventListener("pointermove", handlePointerMove);
  ownerDocument.addEventListener("pointerup", handlePointerUp, { once: true });
}

function beginResizingTranslation(
  event: PointerEvent,
  translationElement: HTMLElement,
  translation: SideTranslationOverlay,
  options: AnnotationRenderOptions,
  currentScale: number,
) {
  event.preventDefault();
  event.stopPropagation();

  const startX = event.clientX;
  const startY = event.clientY;
  const startRect = translationElement.getBoundingClientRect();
  const hadManualHeight = Boolean(translation.size?.manualHeight);
  const ownerDocument = translationElement.ownerDocument;

  const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(value, max));

  const handlePointerMove = (moveEvent: PointerEvent) => {
    const width = clamp(startRect.width + moveEvent.clientX - startX, 140, 720);
    const dy = moveEvent.clientY - startY;
    const shouldResizeHeight = hadManualHeight || Math.abs(dy) > 4;
    translationElement.style.width = `${width}px`;
    if (shouldResizeHeight) {
      const height = clamp(startRect.height + dy, 28, 720);
      translationElement.style.height = `${height}px`;
    } else {
      translationElement.style.removeProperty("height");
    }
  };

  const handlePointerUp = (upEvent: PointerEvent) => {
    ownerDocument.removeEventListener("pointermove", handlePointerMove);
    ownerDocument.removeEventListener("pointerup", handlePointerUp);

    const width = clamp(startRect.width + upEvent.clientX - startX, 140, 720);
    const dy = upEvent.clientY - startY;
    const shouldResizeHeight = hadManualHeight || Math.abs(dy) > 4;
    const height = shouldResizeHeight
      ? clamp(startRect.height + dy, 28, 720)
      : undefined;
    if (
      Math.abs(width - startRect.width) > 0.5 ||
      (height !== undefined && Math.abs(height - startRect.height) > 0.5)
    ) {
      options.onResizeTranslation(translation.id, {
        width,
        height,
        manualHeight: shouldResizeHeight,
      }, currentScale);
      options.onSelectTranslation(translation.id);
    }
  };

  ownerDocument.addEventListener("pointermove", handlePointerMove);
  ownerDocument.addEventListener("pointerup", handlePointerUp, { once: true });
}

export function renderAnnotations(
  container: EmbedPdfContainer | null,
  annotations: GlossAnnotation[],
  translations: SideTranslationOverlay[],
  settings: Settings,
  layoutProvider: AnnotationLayoutProvider | null,
  options: AnnotationRenderOptions,
): void {
  const contentWrapper = getContentWrapper(container);
  if (!contentWrapper || !layoutProvider) return;

  injectAnnotationStyles(container);
  clearAnnotations(container);

  for (const annotation of annotations) {
    for (const anchorRect of annotation.anchor.rects.length
      ? annotation.anchor.rects
      : [annotation.anchor.rect]) {
      const highlightPosition = layoutProvider.getRectPositionForPage(
        annotation.anchor.page,
        anchorRect,
      );
      if (!highlightPosition) continue;

      contentWrapper.appendChild(
        createHighlightElement(annotation, highlightPosition),
      );
    }

    const position = layoutProvider.getRectPositionForPage(
      annotation.anchor.page,
      annotation.anchor.rect,
    );
    if (!position) continue;

    const currentScale = getAnnotationRenderScale(annotation.anchor.rect, position);
    contentWrapper.appendChild(
      createAnnotationElement(
        annotation,
        settings,
        position,
        currentScale,
        options,
      ),
    );
  }

  for (const translation of translations) {
    for (const anchorRect of translation.anchor.rects.length
      ? translation.anchor.rects
      : [translation.anchor.rect]) {
      const highlightPosition = layoutProvider.getRectPositionForPage(
        translation.anchor.page,
        anchorRect,
      );
      if (!highlightPosition) continue;

      contentWrapper.appendChild(
        createTranslationHighlightElement(translation, highlightPosition),
      );
    }

    const position = layoutProvider.getRectPositionForPage(
      translation.anchor.page,
      translation.anchor.rect,
    );
    if (!position) continue;

    const currentScale = getAnnotationRenderScale(translation.anchor.rect, position);
    contentWrapper.appendChild(
      createTranslationElement(
        translation,
        position,
        settings,
        currentScale,
        options,
      ),
    );
  }
}

export function clearAnnotations(
  container: EmbedPdfContainer | null,
): void {
  const root = container?.shadowRoot;
  if (!root) return;

  const annotations = root.querySelectorAll(
    [
      "[data-gloss-id]",
      "[data-gloss-highlight-id]",
      "[data-translation-id]",
      "[data-translation-highlight-id]",
    ].join(", "),
  );
  for (const el of annotations) {
    el.remove();
  }
}
