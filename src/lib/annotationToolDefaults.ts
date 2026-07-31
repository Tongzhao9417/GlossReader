/**
 * Persistence for annotation tool defaults (highlight color, opacity, stroke
 * width…). The EmbedPDF annotation plugin keeps `tool.defaults` only in
 * memory, so toolbar style choices reset on every launch.
 *
 * Strategy: at viewer mount, snapshot the pristine defaults as a baseline,
 * apply the stored per-tool patches, then persist — on every tools change —
 * only the fields that differ from the baseline. Storing diffs (rather than
 * whole defaults) lets future EmbedPDF upgrades improve untouched fields.
 */

const STORAGE_KEY = "glossreader-annotation-tool-defaults";

type ToolDefaultsPatch = Record<string, unknown>;
type StoredToolDefaultsMap = Record<string, ToolDefaultsPatch>;

export interface AnnotationToolLike {
  id: string;
  defaults?: Record<string, unknown>;
}

export interface ToolDefaultsCapability {
  getTools?: () => AnnotationToolLike[];
  setToolDefaults?: (toolId: string, patch: ToolDefaultsPatch) => void;
  onToolsChange?: (
    listener: (event: { tools?: AnnotationToolLike[] }) => void,
  ) => () => void;
}

function readStoredToolDefaults(): StoredToolDefaultsMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === "object" && parsed !== null
      ? (parsed as StoredToolDefaultsMap)
      : {};
  } catch {
    return {};
  }
}

/** JSON-comparable serialization; returns undefined for values JSON cannot
 * represent (functions, symbols) so they are skipped entirely. */
function serialize(value: unknown): string | undefined {
  try {
    return JSON.stringify(value === undefined ? null : value);
  } catch {
    return undefined;
  }
}

function diffDefaults(
  current: Record<string, unknown>,
  baseline: Record<string, unknown>,
): ToolDefaultsPatch {
  const patch: ToolDefaultsPatch = {};
  for (const key of Object.keys(current)) {
    const currentSerialized = serialize(current[key]);
    if (currentSerialized === undefined) continue;
    if (currentSerialized !== serialize(baseline[key])) {
      patch[key] = JSON.parse(currentSerialized);
    }
  }
  return patch;
}

/**
 * Apply persisted tool defaults to a freshly mounted viewer and keep the
 * store in sync with subsequent changes. Returns an unsubscribe function
 * suitable as a React effect cleanup.
 */
export function setupToolDefaultsPersistence(
  capability: ToolDefaultsCapability,
): () => void {
  const pristineTools = capability.getTools?.() ?? [];
  const baseline = new Map(
    pristineTools.map((tool) => [tool.id, { ...(tool.defaults ?? {}) }]),
  );

  const stored = readStoredToolDefaults();
  for (const [toolId, patch] of Object.entries(stored)) {
    if (!baseline.has(toolId)) continue;
    if (typeof patch !== "object" || patch === null) continue;
    if (!Object.keys(patch).length) continue;
    capability.setToolDefaults?.(toolId, patch);
  }

  const unsubscribe = capability.onToolsChange?.((event) => {
    const map: StoredToolDefaultsMap = {};
    for (const tool of event.tools ?? []) {
      const toolBaseline = baseline.get(tool.id);
      // Runtime-added tools have no pristine baseline to diff against.
      if (!toolBaseline) continue;

      const patch = diffDefaults(tool.defaults ?? {}, toolBaseline);
      if (Object.keys(patch).length) {
        map[tool.id] = patch;
      }
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    } catch {
      // Quota/serialization failures must never break the toolbar.
    }
  });

  return () => {
    unsubscribe?.();
  };
}
