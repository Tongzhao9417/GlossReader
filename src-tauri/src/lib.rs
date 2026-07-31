use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{Emitter, Manager, State};

/// Files the OS asked us to open before the frontend was ready to receive them.
#[derive(Default)]
struct OpenState {
    pending: Mutex<Vec<String>>,
    ready: AtomicBool,
}

#[tauri::command]
fn read_file_binary(path: String) -> Result<Response, String> {
    std::fs::read(&path)
        .map(Response::new)
        .map_err(|e| format!("Failed to read file: {}", e))
}

/// Decode the %XX escapes produced by JS `encodeURIComponent` (UTF-8 bytes).
fn percent_decode(input: &str) -> Result<String, String> {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let hex = bytes
                .get(i + 1..i + 3)
                .and_then(|h| std::str::from_utf8(h).ok())
                .and_then(|h| u8::from_str_radix(h, 16).ok())
                .ok_or_else(|| "Invalid percent-encoding in path".to_string())?;
            out.push(hex);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).map_err(|e| format!("Path is not valid UTF-8: {}", e))
}

/// Overwrite `path` atomically with the raw request body: write a sibling temp
/// file, then rename over the original so a failed write can never truncate it.
#[tauri::command]
fn write_file_binary(request: Request) -> Result<(), String> {
    let encoded_path = request
        .headers()
        .get("x-glossreader-path")
        .ok_or_else(|| "Missing x-glossreader-path header".to_string())?
        .to_str()
        .map_err(|e| format!("Invalid path header: {}", e))?;
    let path = percent_decode(encoded_path)?;

    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("Expected a raw binary body".to_string());
    };
    if bytes.is_empty() {
        return Err("Refusing to write empty file".to_string());
    }

    let tmp_path = format!("{}.glossreader-tmp", path);
    std::fs::write(&tmp_path, bytes)
        .map_err(|e| format!("Failed to write temp file: {}", e))?;
    std::fs::rename(&tmp_path, &path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp_path);
        format!("Failed to replace file: {}", e)
    })
}

/// Called by the frontend once it has mounted: marks it ready to receive
/// `open-files` events and returns (clearing) any paths queued beforehand.
#[tauri::command]
fn take_pending_files(state: State<OpenState>) -> Vec<String> {
    let mut pending = state.pending.lock().unwrap();
    state.ready.store(true, Ordering::SeqCst);
    std::mem::take(&mut *pending)
}

/// Queue paths until the frontend is ready, or emit them immediately if it is.
fn deliver_files(app: &tauri::AppHandle, paths: Vec<String>) {
    if paths.is_empty() {
        return;
    }
    let state = app.state::<OpenState>();
    let mut pending = state.pending.lock().unwrap();
    if state.ready.load(Ordering::SeqCst) {
        drop(pending);
        let _ = app.emit("open-files", paths);
    } else {
        pending.extend(paths);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(OpenState::default())
        .invoke_handler(tauri::generate_handler![
            read_file_binary,
            write_file_binary,
            take_pending_files
        ])
        .setup(|app| {
            // Cold-start file arguments (Windows/Linux). On macOS, launch files
            // are delivered through the RunEvent::Opened event instead.
            let paths: Vec<String> = std::env::args()
                .skip(1)
                .filter(|arg| !arg.starts_with('-'))
                .filter(|arg| std::path::Path::new(arg).exists())
                .collect();
            deliver_files(app.handle(), paths);
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|_app_handle, _event| {
        // macOS delivers files opened via Finder "Open With" / Zotero here,
        // both at launch and while the app is already running.
        #[cfg(any(target_os = "macos", target_os = "ios"))]
        if let tauri::RunEvent::Opened { urls } = _event {
            let paths: Vec<String> = urls
                .iter()
                .filter_map(|url| url.to_file_path().ok())
                .map(|path| path.to_string_lossy().to_string())
                .collect();
            deliver_files(_app_handle, paths);
        }
    });
}
