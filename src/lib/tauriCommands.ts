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

/**
 * Atomically overwrite a PDF on disk (temp file + rename on the Rust side).
 * The path travels percent-encoded in a header because raw-body invokes carry
 * no JSON args and header values must be ASCII (paths may contain CJK).
 */
export async function writePdfFile(
  filePath: string,
  data: Uint8Array,
): Promise<void> {
  await invoke("write_file_binary", data, {
    headers: { "x-glossreader-path": encodeURIComponent(filePath) },
  });
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
