import { getName, getVersion } from "@tauri-apps/api/app";
import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";

export type { Update } from "@tauri-apps/plugin-updater";

export const GITHUB_REPOSITORY_URL =
  "https://github.com/Tongzhao9417/GlossReader";

export interface AppInfo {
  name: string;
  version: string;
}

export interface DownloadProgress {
  downloadedBytes: number;
  totalBytes?: number;
  /** 0–100, or undefined when the total size is unknown. */
  percent?: number;
}

const DEFAULT_APP_INFO: AppInfo = {
  name: "GlossReader",
  version: "1.1.0",
};

function normalizeAppName(name: string) {
  const normalized = name.replace(/[-_\s]/g, "").toLowerCase();
  return normalized === "glossreader" ? "GlossReader" : name;
}

export async function loadAppInfo(): Promise<AppInfo> {
  if (!isTauri()) return DEFAULT_APP_INFO;

  try {
    const [name, version] = await Promise.all([getName(), getVersion()]);
    return {
      name: name ? normalizeAppName(name) : DEFAULT_APP_INFO.name,
      version: version || DEFAULT_APP_INFO.version,
    };
  } catch {
    return DEFAULT_APP_INFO;
  }
}

export async function openGitHubRepository() {
  if (isTauri()) {
    await openUrl(GITHUB_REPOSITORY_URL);
    return;
  }

  window.open(GITHUB_REPOSITORY_URL, "_blank", "noopener,noreferrer");
}

export function isUpdaterEndpointMissing(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("404") || message.includes("Not Found");
}

/**
 * Checks for an available update without downloading anything. Returns the
 * Update handle (used later for download/install) or null when up to date.
 * Throws on a real failure so callers can surface it. Returns null outside Tauri.
 */
export async function checkForUpdate(): Promise<Update | null> {
  if (!isTauri()) return null;
  return await check();
}

/**
 * Downloads and installs an already-discovered update, reporting byte progress.
 * Does NOT relaunch — call restartApp() once the user confirms.
 */
export async function downloadAndInstallUpdate(
  update: Update,
  onProgress: (progress: DownloadProgress) => void,
): Promise<void> {
  let downloadedBytes = 0;
  let totalBytes: number | undefined;

  await update.downloadAndInstall((event: DownloadEvent) => {
    if (event.event === "Started") {
      downloadedBytes = 0;
      totalBytes = event.data.contentLength;
    } else if (event.event === "Progress") {
      downloadedBytes += event.data.chunkLength;
    } else {
      // "Finished"
      downloadedBytes = totalBytes ?? downloadedBytes;
    }

    onProgress({
      downloadedBytes,
      totalBytes,
      percent: totalBytes
        ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100))
        : undefined,
    });
  });
}

export async function restartApp(): Promise<void> {
  await relaunch();
}
