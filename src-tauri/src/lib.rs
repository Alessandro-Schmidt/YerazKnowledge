// The desktop shell (ARCHITECTURE.md §10): the same web build in a Tauri window. The only
// native code is the GitHub token in the OS keychain (§9), which src/store/token.ts calls,
// and Families in folders (folder.rs, issue #64).
// ponytail: printing uses the webview's window.print(); if a platform's webview can't
// print (§11 risk), add a command that calls the webview's native print here.

const SERVICE: &str = "io.yeraz.app";
const ACCOUNT: &str = "github-token";

fn entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, ACCOUNT).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_token() -> Result<Option<String>, String> {
    match entry()?.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn set_token(token: String) -> Result<(), String> {
    entry()?.set_password(&token).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_token() -> Result<(), String> {
    match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

mod folder;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_token,
            set_token,
            delete_token,
            folder::pick_folder,
            folder::new_folder,
            folder::list_folder,
            folder::read_file,
            folder::write_file,
            folder::remove_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running Yeraz");
}
