// Families in folders (issue #64). The web build reaches folders through the File System
// Access API, which the macOS and Linux webviews lack, so the desktop app answers these
// commands instead (src/local/folder.ts). Paths from the app are relative to the folder the
// person picked, and can't leave it. Commands are async so file work stays off the main thread.

use std::fs;
use std::io::ErrorKind;
use std::path::{Component, Path, PathBuf};
use std::time::UNIX_EPOCH;
use tauri::ipc::Response;
use tauri_plugin_dialog::DialogExt;

#[derive(serde::Serialize)]
pub struct FolderFile {
    path: String,
    size: u64,
    /// Last modified, ms since epoch.
    modified: u64,
}

fn err(e: std::io::Error) -> String {
    e.to_string()
}

/// The folder itself; "missing" (which the app knows) when it was moved or deleted.
fn root_of(root: &str) -> Result<&Path, String> {
    let root = Path::new(root);
    if root.is_dir() {
        Ok(root)
    } else {
        Err("missing".into())
    }
}

/// A path inside the folder: plain names only, so no `..` or absolute path escapes it.
fn inside(root: &str, path: &str) -> Result<PathBuf, String> {
    let rel = Path::new(path);
    if path.is_empty() || !rel.components().all(|c| matches!(c, Component::Normal(_))) {
        return Err(format!("Not a path inside the folder: {path}"));
    }
    Ok(root_of(root)?.join(rel))
}

/// Hidden entries (`.git`, `.obsidian`, `.DS_Store`) are left out, except the root's marker
/// and `.yeraz/`, which holds the Family's templates.
fn visible(name: &str, at_root: bool) -> bool {
    !name.starts_with('.') || (at_root && (name == ".yeraz.json" || name == ".yeraz"))
}

fn walk(dir: &Path, prefix: &str, out: &mut Vec<FolderFile>) -> Result<(), String> {
    for entry in fs::read_dir(dir).map_err(err)? {
        let entry = entry.map_err(err)?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if !visible(&name, prefix.is_empty()) {
            continue;
        }
        // Not followed: a symbolic link is neither, so links (and their loops) are skipped.
        let meta = entry.metadata().map_err(err)?;
        if meta.is_dir() {
            walk(&entry.path(), &format!("{prefix}{name}/"), out)?;
        } else if meta.is_file() {
            let modified = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map_or(0, |d| d.as_millis() as u64);
            out.push(FolderFile {
                path: format!("{prefix}{name}"),
                size: meta.len(),
                modified,
            });
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn pick_folder(app: tauri::AppHandle) -> Option<String> {
    let picked = app.dialog().file().blocking_pick_folder()?;
    Some(picked.into_path().ok()?.to_string_lossy().into_owned())
}

/// A new project's folder, `name` inside `parent`; "taken" (which the app knows) when one is
/// there already, so a folder is never taken over. Returns its path.
#[tauri::command]
pub async fn new_folder(parent: String, name: String) -> Result<String, String> {
    if Path::new(&name).components().count() != 1 {
        return Err(format!("Not a folder name: {name}"));
    }
    let dir = inside(&parent, &name)?;
    match fs::create_dir(&dir) {
        Err(e) if e.kind() == ErrorKind::AlreadyExists => Err("taken".into()),
        made => made.map_err(err).map(|()| dir.to_string_lossy().into_owned()),
    }
}

#[tauri::command]
pub async fn list_folder(root: String) -> Result<Vec<FolderFile>, String> {
    let mut out = Vec::new();
    walk(root_of(&root)?, "", &mut out)?;
    Ok(out)
}

#[tauri::command]
pub async fn read_file(root: String, path: String) -> Result<Response, String> {
    Ok(Response::new(fs::read(inside(&root, &path)?).map_err(err)?))
}

/// Written beside, then renamed over, so whatever syncs the folder never sees half a file.
#[tauri::command]
pub async fn write_file(root: String, path: String, bytes: Vec<u8>) -> Result<(), String> {
    let file = inside(&root, &path)?;
    let dir = file.parent().ok_or("No folder")?;
    fs::create_dir_all(dir).map_err(err)?;
    let name = file.file_name().ok_or("No name")?.to_string_lossy();
    let temp = dir.join(format!(".{name}.yeraz-saving"));
    fs::write(&temp, bytes).map_err(err)?;
    fs::rename(&temp, &file).map_err(err)
}

/// Deletes a file, then the folders it leaves empty (git keeps none, so neither does a Family).
#[tauri::command]
pub async fn remove_file(root: String, path: String) -> Result<(), String> {
    let file = inside(&root, &path)?;
    match fs::remove_file(&file) {
        Err(e) if e.kind() != ErrorKind::NotFound => return Err(err(e)),
        _ => {}
    }
    let root = Path::new(&root);
    let mut dir = file.parent();
    while let Some(d) = dir.filter(|d| *d != root) {
        if fs::remove_dir(d).is_err() {
            break;
        }
        dir = d.parent();
    }
    Ok(())
}
