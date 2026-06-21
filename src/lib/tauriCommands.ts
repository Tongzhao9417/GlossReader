import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";

export interface OpenPdfResult {
  data: ArrayBuffer;
  filePath: string;
}

export async function readPdfFile(filePath: string): Promise<OpenPdfResult> {
  const data: ArrayBuffer = await invoke("read_file_binary", {
    path: filePath,
  });

  return { data, filePath };
}

export async function openPdfFiles(): Promise<OpenPdfResult[]> {
  const filePaths = await open({
    multiple: true,
    directory: false,
    filters: [{ name: "PDF Documents", extensions: ["pdf"] }],
  });

  if (!filePaths) return [];

  const normalizedPaths = Array.isArray(filePaths) ? filePaths : [filePaths];
  return Promise.all(normalizedPaths.map(readPdfFile));
}
