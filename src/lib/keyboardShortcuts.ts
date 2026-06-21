export const DEFAULT_GLOSS_SHORTCUT = "Meta+D";
export const DEFAULT_FIND_SHORTCUT = "Meta+F";

const MODIFIER_ORDER = ["Meta", "Ctrl", "Alt", "Shift"] as const;
const MODIFIER_LABELS: Record<string, string> = {
  Meta: "⌘",
  Ctrl: "Ctrl",
  Alt: "⌥",
  Shift: "⇧",
};

const MODIFIER_ALIASES: Record<string, (typeof MODIFIER_ORDER)[number]> = {
  cmd: "Meta",
  command: "Meta",
  meta: "Meta",
  "⌘": "Meta",
  control: "Ctrl",
  ctrl: "Ctrl",
  "^": "Ctrl",
  alt: "Alt",
  opt: "Alt",
  option: "Alt",
  "⌥": "Alt",
  shift: "Shift",
  "⇧": "Shift",
};

const EVENT_KEY_ALIASES: Record<string, string> = {
  " ": "Space",
  arrowdown: "ArrowDown",
  arrowleft: "ArrowLeft",
  arrowright: "ArrowRight",
  arrowup: "ArrowUp",
  escape: "Escape",
  esc: "Escape",
};

function normalizeShortcutKey(key: string) {
  const trimmed = key.trim();
  if (!trimmed) return "";

  const lower = trimmed.toLowerCase();
  if (EVENT_KEY_ALIASES[lower]) return EVENT_KEY_ALIASES[lower];
  if (lower === "space") return "Space";
  if (/^f\d{1,2}$/i.test(trimmed)) return trimmed.toUpperCase();
  if (trimmed.length === 1) return trimmed.toUpperCase();

  return trimmed[0].toUpperCase() + trimmed.slice(1);
}

export function normalizeKeyboardShortcut(shortcut: string) {
  const parts = shortcut
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
  const modifiers = new Set<(typeof MODIFIER_ORDER)[number]>();
  let key = "";

  for (const part of parts) {
    const modifier = MODIFIER_ALIASES[part.toLowerCase()];
    if (modifier) {
      modifiers.add(modifier);
      continue;
    }

    if (key) return "";
    key = normalizeShortcutKey(part);
  }

  if (!key || (!modifiers.has("Meta") && !modifiers.has("Ctrl") && !modifiers.has("Alt"))) {
    return "";
  }

  return [...MODIFIER_ORDER.filter((modifier) => modifiers.has(modifier)), key].join(
    "+",
  );
}

export function keyboardEventToShortcut(event: KeyboardEvent) {
  const key = normalizeShortcutKey(event.key);
  if (
    !key ||
    key === "Meta" ||
    key === "Ctrl" ||
    key === "Control" ||
    key === "Alt" ||
    key === "Shift"
  ) {
    return null;
  }

  const modifiers = [
    event.metaKey ? "Meta" : "",
    event.ctrlKey ? "Ctrl" : "",
    event.altKey ? "Alt" : "",
    event.shiftKey ? "Shift" : "",
  ].filter(Boolean);

  if (!event.metaKey && !event.ctrlKey && !event.altKey) return null;

  return normalizeKeyboardShortcut([...modifiers, key].join("+"));
}

export function isKeyboardShortcut(event: KeyboardEvent, shortcut: string) {
  const normalizedEventShortcut = keyboardEventToShortcut(event);
  if (!normalizedEventShortcut) return false;

  return normalizedEventShortcut === normalizeKeyboardShortcut(shortcut);
}

export function formatKeyboardShortcutLabel(shortcut: string) {
  const normalized = normalizeKeyboardShortcut(shortcut);
  if (!normalized) return "未设置";

  return normalized
    .split("+")
    .map((part) => MODIFIER_LABELS[part] ?? part)
    .join("");
}
