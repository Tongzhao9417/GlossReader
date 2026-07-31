/**
 * Autosave controller for native PDF annotations (highlights, ink, shapes…).
 *
 * EmbedPDF keeps those marks only in the in-memory PDFium document; unless the
 * file on disk is rewritten they vanish when the document closes. This module
 * listens for annotation mutations and, after a debounce, commits pending
 * changes and writes the full saved copy back to the original path.
 *
 * Scheduling uses plain timers, never requestAnimationFrame — WKWebView
 * freezes rAF entirely while the window is occluded (see
 * .trellis/spec/frontend/annotation-persistence.md, invariant 4).
 */

export interface AutosavePdfTask<T> {
  wait: (
    onResolve: (result: T) => void,
    onReject?: (error: unknown) => void,
  ) => void;
}

export interface AutosaveAnnotationCapability {
  commit: () => AutosavePdfTask<unknown>;
  onAnnotationEvent?: (
    listener: (event: { type: string }) => void,
  ) => () => void;
}

export interface AutosaveExportCapability {
  saveAsCopy: () => AutosavePdfTask<ArrayBuffer | Uint8Array>;
}

export interface AnnotationAutosaveOptions {
  annotation: AutosaveAnnotationCapability;
  exporter: AutosaveExportCapability;
  writeFile: (bytes: Uint8Array) => Promise<void>;
  onError: (message: string) => void;
  debounceMs?: number;
}

export interface AnnotationAutosaveController {
  isDirty: () => boolean;
  /**
   * Flush pending changes now. Resolves once the write finished, failed, or
   * `timeoutMs` elapsed — callers use it to hold a tab close briefly without
   * ever blocking it forever. `silent` suppresses the onError surface (used
   * for best-effort flushes during teardown, where failures are expected if
   * the viewer is already going away).
   */
  flushNow: (timeoutMs?: number, silent?: boolean) => Promise<void>;
  /** Unsubscribe and cancel timers. Does not flush. */
  dispose: () => void;
}

/** Annotation events that change the document (gesture events like
 * start/end/cancel and the initial "loaded" event do not). */
const MUTATING_EVENT_TYPES = new Set([
  "create",
  "update",
  "delete",
  "move",
  "resize",
  "rotate",
  "property-update",
]);

const DEFAULT_DEBOUNCE_MS = 1000;
const MIN_PDF_BYTES = 1024;
const PDF_HEADER = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

function isPlausiblePdf(bytes: Uint8Array) {
  if (bytes.byteLength < MIN_PDF_BYTES) return false;
  return PDF_HEADER.every((byte, index) => bytes[index] === byte);
}

function describeSaveError(error: unknown) {
  const detail =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message: unknown }).message)
        : String(error);
  return `保存批注到文件失败：${detail}`;
}

export function createAnnotationAutosave(
  options: AnnotationAutosaveOptions,
): AnnotationAutosaveController {
  const {
    annotation,
    exporter,
    writeFile,
    onError,
    debounceMs = DEFAULT_DEBOUNCE_MS,
  } = options;

  let dirty = false;
  let disposed = false;
  let debounceTimer: number | null = null;
  let inFlight: Promise<void> | null = null;

  const clearDebounce = () => {
    if (debounceTimer !== null) {
      window.clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  };

  const runSave = (silent: boolean): Promise<void> =>
    new Promise<void>((resolve) => {
      dirty = false;

      const fail = (error: unknown) => {
        // Keep the change marked so the next event (or flush) retries.
        dirty = true;
        if (!silent && !disposed) onError(describeSaveError(error));
        resolve();
      };

      try {
        annotation.commit().wait(() => {
          try {
            exporter.saveAsCopy().wait(async (buffer) => {
              const bytes =
                buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
              if (!isPlausiblePdf(bytes)) {
                fail(new Error("导出的 PDF 数据无效，已放弃写入"));
                return;
              }
              try {
                await writeFile(bytes);
                resolve();
              } catch (error) {
                fail(error);
              }
            }, fail);
          } catch (error) {
            fail(error);
          }
        }, fail);
      } catch (error) {
        fail(error);
      }
    });

  const flush = (silent: boolean): Promise<void> => {
    if (inFlight) return inFlight;
    if (!dirty) return Promise.resolve();

    clearDebounce();
    inFlight = runSave(silent).finally(() => {
      inFlight = null;
      // Mutations that arrived while saving trigger one more pass.
      if (dirty && !disposed) scheduleFlush();
    });
    return inFlight;
  };

  const scheduleFlush = () => {
    clearDebounce();
    debounceTimer = window.setTimeout(() => {
      debounceTimer = null;
      void flush(false);
    }, debounceMs);
  };

  const unsubscribe = annotation.onAnnotationEvent?.((event) => {
    if (disposed || !MUTATING_EVENT_TYPES.has(event.type)) return;
    dirty = true;
    scheduleFlush();
  });

  return {
    isDirty: () => dirty || inFlight !== null,
    flushNow: (timeoutMs = 2500, silent = false) => {
      const pending = flush(silent);
      if (!timeoutMs) return pending;
      return Promise.race([
        pending,
        new Promise<void>((resolve) => window.setTimeout(resolve, timeoutMs)),
      ]);
    },
    dispose: () => {
      disposed = true;
      clearDebounce();
      unsubscribe?.();
    },
  };
}
