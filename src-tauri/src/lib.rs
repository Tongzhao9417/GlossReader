use tauri::ipc::Response;

#[tauri::command]
fn read_file_binary(path: String) -> Result<Response, String> {
    std::fs::read(&path)
        .map(|data| Response::new(data))
        .map_err(|e| format!("Failed to read file: {}", e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![read_file_binary])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
