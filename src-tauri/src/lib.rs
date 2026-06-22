use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use tauri::ipc::Response;
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
