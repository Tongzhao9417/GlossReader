import { getName, getVersion } from "@tauri-apps/api/app";
import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type DownloadEvent } from "@tauri-apps/plugin-updater";

export const GITHUB_REPOSITORY_URL =
  "https://github.com/Tongzhao9417/GlossReader";

export interface AppInfo {
  name: string;
  version: string;
}

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "installing"
  | "restarting"
  | "up-to-date"
  | "unsupported"
  | "error";

export interface UpdateState {
  status: UpdateStatus;
  message: string;
  version?: string;
}

const DEFAULT_APP_INFO: AppInfo = {
  name: "GlossReader",
  version: "1.0.0",
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

function formatDownloadProgress(downloadedBytes: number, totalBytes?: number) {
  if (!totalBytes) return "正在下载更新...";

  const percent = Math.min(
    100,
    Math.round((downloadedBytes / totalBytes) * 100),
  );
  return `正在下载更新... ${percent}%`;
}

function isUpdaterEndpointMissing(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("404") || message.includes("Not Found");
}

export async function checkAndInstallUpdate(
  onState: (state: UpdateState) => void,
  options: { confirmBeforeInstall?: boolean } = {},
): Promise<UpdateState> {
  if (!isTauri()) {
    const state = {
      status: "unsupported",
      message: "请在 Tauri 应用中检测更新。",
    } satisfies UpdateState;
    onState(state);
    return state;
  }

  try {
    onState({ status: "checking", message: "正在检测更新..." });

    const update = await check();
    if (!update) {
      const state = {
        status: "up-to-date",
        message: "当前已经是最新版本。",
      } satisfies UpdateState;
      onState(state);
      return state;
    }

    const availableState = {
      status: "available",
      message: `发现新版本 ${update.version}。`,
      version: update.version,
    } satisfies UpdateState;
    onState(availableState);

    if (options.confirmBeforeInstall) {
      const shouldInstall = window.confirm(
        `发现 GlossReader ${update.version}，是否现在下载并安装？安装完成后应用会自动重启。`,
      );

      if (!shouldInstall) return availableState;
    }

    let downloadedBytes = 0;
    let totalBytes: number | undefined;

    await update.downloadAndInstall((event: DownloadEvent) => {
      if (event.event === "Started") {
        downloadedBytes = 0;
        totalBytes = event.data.contentLength;
        onState({
          status: "downloading",
          message: formatDownloadProgress(downloadedBytes, totalBytes),
          version: update.version,
        });
        return;
      }

      if (event.event === "Progress") {
        downloadedBytes += event.data.chunkLength;
        onState({
          status: "downloading",
          message: formatDownloadProgress(downloadedBytes, totalBytes),
          version: update.version,
        });
        return;
      }

      onState({
        status: "installing",
        message: "正在安装更新...",
        version: update.version,
      });
    });

    const state = {
      status: "restarting",
      message: "更新已安装，正在重启 GlossReader...",
      version: update.version,
    } satisfies UpdateState;
    onState(state);
    await relaunch();
    return state;
  } catch (error) {
    const message = isUpdaterEndpointMissing(error)
      ? "还没有可用于自动更新的 GitHub Release。"
      : `检测更新失败：${
          error instanceof Error ? error.message : String(error)
        }`;
    const state = { status: "error", message } satisfies UpdateState;
    onState(state);
    return state;
  }
}
