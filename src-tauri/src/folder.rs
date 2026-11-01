// Families in folders (issue #64). The web build reaches folders through the File System
// Access API, which the macOS and Linux webviews lack, so the desktop app answers these
// commands instead (src/local/folder.ts). They work only in folders the person picked (or
// made) here, so a script in the webview can't reach the rest of the disk, and paths from the
// app are relative to that folder and can't leave it. Commands are async so file work stays
// off the main thread.

use std::collections::HashSet;
use std::fs;
use std::io::{ErrorKind, Write};
use std::path::{Component, Path, PathBuf, Prefix};
use std::sync::Mutex;
use std::time::UNIX_EPOCH;
use tauri::ipc::Response;
use tauri::{Manager, State};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};

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

/// The folders the person picked or made here, kept one per line in the app's data folder so
/// they stay allowed after a restart. Any other folder answers "permission" (which the app
/// knows): the person allows it again in a dialog of the system's own (`allow_folder`).
/// A folder picked to make a new one in is allowed for that only, once, and isn't kept.
pub struct Allowed {
    file: Option<PathBuf>,
    roots: Mutex<HashSet<PathBuf>>,
    parents: Mutex<HashSet<PathBuf>>,
}

impl Allowed {
    pub fn load(file: Option<PathBuf>) -> Self {
        let text = file.as_ref().and_then(|f| fs::read_to_string(f).ok());
        let roots = text
            .unwrap_or_default()
            .lines()
            .filter(|line| !line.is_empty())
            .map(PathBuf::from)
            .collect();
        Allowed {
            file,
            roots: Mutex::new(roots),
            parents: Mutex::default(),
        }
    }

    fn add(&self, root: &str) -> Result<(), String> {
        // A line break would read back as two folders, one of them never picked.
        if root.contains(['\n', '\r']) {
            return Err(format!("Not a folder Yeraz can keep: {root}"));
        }
        let mut roots = self.roots.lock().map_err(|e| e.to_string())?;
        if roots.insert(PathBuf::from(root)) {
            if let Some(file) = &self.file {
                if let Some(dir) = file.parent() {
                    fs::create_dir_all(dir).map_err(err)?;
                }
                let text: String = roots
                    .iter()
                    .map(|r| format!("{}\n", r.to_string_lossy()))
                    .collect();
                fs::write(file, text).map_err(err)?;
            }
        }
        Ok(())
    }

    fn add_parent(&self, parent: &str) -> Result<(), String> {
        let mut parents = self.parents.lock().map_err(|e| e.to_string())?;
        parents.insert(PathBuf::from(parent));
        Ok(())
    }

    /// Spends a parent: true when it was picked for a new folder and not used yet.
    fn take_parent(&self, parent: &str) -> Result<bool, String> {
        let mut parents = self.parents.lock().map_err(|e| e.to_string())?;
        Ok(parents.remove(Path::new(parent)))
    }

    fn check(&self, root: &str) -> Result<(), String> {
        let roots = self.roots.lock().map_err(|e| e.to_string())?;
        if roots.contains(Path::new(root)) {
            Ok(())
        } else {
            Err("permission".into())
        }
    }
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

/// A path inside the folder: plain names only, so no `..` or absolute path escapes it, and
/// no symbolic link on the way, so a link in a folder someone shared can't lead out of it.
fn inside(root: &str, path: &str) -> Result<PathBuf, String> {
    let rel = Path::new(path);
    if path.is_empty() || !rel.components().all(|c| matches!(c, Component::Normal(_))) {
        return Err(format!("Not a path inside the folder: {path}"));
    }
    let mut at = root_of(root)?.to_path_buf();
    for part in rel.components() {
        at.push(part);
        if fs::symlink_metadata(&at).is_ok_and(|m| m.file_type().is_symlink()) {
            return Err(format!("Not a path inside the folder: {path}"));
        }
    }
    Ok(at)
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

fn pick(app: &tauri::AppHandle) -> Option<String> {
    let picked = app.dialog().file().blocking_pick_folder()?;
    Some(picked.into_path().ok()?.to_string_lossy().into_owned())
}

/// A Family's folder, allowed from then on.
#[tauri::command]
pub async fn pick_folder(app: tauri::AppHandle) -> Option<String> {
    let root = pick(&app)?;
    app.state::<Allowed>().add(&root).ok()?;
    Some(root)
}

/// Where to make a new Family's folder (`new_folder`): allowed for that alone.
#[tauri::command]
pub async fn pick_parent(app: tauri::AppHandle) -> Option<String> {
    let parent = pick(&app)?;
    app.state::<Allowed>().add_parent(&parent).ok()?;
    Some(parent)
}

/// A Family's folder this device opened before, but isn't allowed now (the list is newer than
/// it, or was lost): the person says yes or no in the system's dialog, which the webview can
/// neither draw nor answer. Only a folder holding a Family's `.yeraz.json` can be asked for.
#[tauri::command]
pub async fn allow_folder(app: tauri::AppHandle, root: String) -> Result<bool, String> {
    if !askable(&root) {
        return Err("missing".into());
    }
    let yes = app
        .dialog()
        .message(format!(
            "Let Yeraz open and change the notes in this folder?\n\n{root}"
        ))
        .title("Open a Family's folder")
        .buttons(MessageDialogButtons::OkCancelCustom(
            "Allow".into(),
            "Don't allow".into(),
        ))
        .blocking_show();
    if yes {
        app.state::<Allowed>().add(&root)?;
    }
    Ok(yes)
}

/// A folder the dialog may name: absolute, plain names only, and on Windows on a drive
/// (`C:\`), so the disk is touched only there: never a network share (`\\host\share`, which
/// would sign in to that host before anyone said yes) or a device. It holds a `.yeraz.json`.
fn askable(root: &str) -> bool {
    let path = Path::new(root);
    path.is_absolute()
        && path.components().all(|c| match c {
            Component::Prefix(p) => matches!(p.kind(), Prefix::Disk(_)),
            Component::RootDir | Component::Normal(_) => true,
            _ => false,
        })
        && path.join(".yeraz.json").is_file()
}

/// A new project's folder, `name` inside `parent` (just picked with `pick_parent`); "taken"
/// (which the app knows) when one is there already, so a folder is never taken over. Returns
/// its path, allowed from then on.
#[tauri::command]
pub async fn new_folder(
    allowed: State<'_, Allowed>,
    parent: String,
    name: String,
) -> Result<String, String> {
    if !allowed.take_parent(&parent)? {
        return Err("permission".into());
    }
    if Path::new(&name).components().count() != 1 {
        return Err(format!("Not a folder name: {name}"));
    }
    let dir = inside(&parent, &name)?;
    match fs::create_dir(&dir) {
        Err(e) if e.kind() == ErrorKind::AlreadyExists => Err("taken".into()),
        made => {
            made.map_err(err)?;
            let dir = dir.to_string_lossy().into_owned();
            allowed.add(&dir)?;
            Ok(dir)
        }
    }
}

#[tauri::command]
pub async fn list_folder(
    allowed: State<'_, Allowed>,
    root: String,
) -> Result<Vec<FolderFile>, String> {
    allowed.check(&root)?;
    let mut out = Vec::new();
    walk(root_of(&root)?, "", &mut out)?;
    Ok(out)
}

#[tauri::command]
pub async fn read_file(
    allowed: State<'_, Allowed>,
    root: String,
    path: String,
) -> Result<Response, String> {
    allowed.check(&root)?;
    Ok(Response::new(fs::read(inside(&root, &path)?).map_err(err)?))
}

#[tauri::command]
pub async fn write_file(
    allowed: State<'_, Allowed>,
    root: String,
    path: String,
    bytes: Vec<u8>,
) -> Result<(), String> {
    allowed.check(&root)?;
    save(&inside(&root, &path)?, &bytes)
}

/// Written beside, then renamed over, so whatever syncs the folder never sees half a file.
/// The file beside is always a new one: whatever is there already (half a save, or a link
/// someone left in a shared folder) is removed first, never written through.
fn save(file: &Path, bytes: &[u8]) -> Result<(), String> {
    let dir = file.parent().ok_or("No folder")?;
    fs::create_dir_all(dir).map_err(err)?;
    let name = file.file_name().ok_or("No name")?.to_string_lossy();
    let temp = dir.join(format!(".{name}.yeraz-saving"));
    match fs::remove_file(&temp) {
        Err(e) if e.kind() != ErrorKind::NotFound => return Err(err(e)),
        _ => {}
    }
    let mut out = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temp)
        .map_err(err)?;
    out.write_all(bytes).map_err(err)?;
    drop(out);
    fs::rename(&temp, file).map_err(err)
}

/// Deletes a file, then the folders it leaves empty (git keeps none, so neither does a Family).
#[tauri::command]
pub async fn remove_file(
    allowed: State<'_, Allowed>,
    root: String,
    path: String,
) -> Result<(), String> {
    allowed.check(&root)?;
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

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("yeraz-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn only_folders_added_are_allowed_and_they_stay_after_a_restart() {
        let file = scratch("allowed").join("data/folders.txt");
        let allowed = Allowed::load(Some(file.clone()));
        assert_eq!(allowed.check("/home/me/notes"), Err("permission".into()));
        allowed.add("/home/me/notes").unwrap();
        assert_eq!(allowed.check("/home/me/notes"), Ok(()));
        assert_eq!(allowed.check("/home/me/notes/"), Ok(()));
        assert_eq!(allowed.check("/home/me"), Err("permission".into()));
        assert_eq!(allowed.check("/home/me/notes/.."), Err("permission".into()));
        assert_eq!(
            allowed.check("/home/me/notes/../.ssh"),
            Err("permission".into())
        );

        let again = Allowed::load(Some(file));
        assert_eq!(again.check("/home/me/notes"), Ok(()));
        assert_eq!(again.check("/home/me"), Err("permission".into()));
    }

    #[test]
    fn a_parent_is_for_one_new_folder_only_and_is_never_kept() {
        let file = scratch("parent").join("folders.txt");
        let allowed = Allowed::load(Some(file.clone()));
        assert_eq!(allowed.take_parent("/home/me"), Ok(false));
        allowed.add_parent("/home/me").unwrap();
        assert_eq!(allowed.check("/home/me"), Err("permission".into()));
        assert_eq!(allowed.take_parent("/home/me"), Ok(true));
        assert_eq!(allowed.take_parent("/home/me"), Ok(false));
        assert!(!file.exists());
    }

    #[test]
    fn a_folder_with_a_line_break_is_never_kept() {
        let file = scratch("newline").join("folders.txt");
        let allowed = Allowed::load(Some(file.clone()));
        assert!(allowed.add("/home/me/x\n/home").is_err());
        assert_eq!(
            Allowed::load(Some(file)).check("/home"),
            Err("permission".into())
        );
    }

    #[test]
    fn paths_stay_inside_the_folder() {
        let root = scratch("inside");
        let root = root.to_str().unwrap();
        assert!(inside(root, "notes/a.md").is_ok());
        for bad in ["", "../x", "notes/../../x", "/etc/passwd"] {
            assert!(inside(root, bad).is_err(), "{bad}");
        }
    }

    #[cfg(unix)]
    #[test]
    fn a_link_inside_the_folder_never_leads_out_of_it() {
        let root = scratch("links");
        let away = scratch("links-away");
        std::os::unix::fs::symlink(&away, root.join("evil")).unwrap();
        std::os::unix::fs::symlink(away.join("secret"), root.join("leaf.md")).unwrap();
        let root = root.to_str().unwrap();
        assert!(inside(root, "evil/x.md").is_err());
        assert!(inside(root, "leaf.md").is_err());
        assert!(inside(root, "plain/new.md").is_ok());
    }

    #[cfg(unix)]
    #[test]
    fn a_saved_file_never_writes_through_a_planted_temporary_link() {
        let root = scratch("temp-link");
        let away = scratch("temp-link-away");
        fs::write(away.join("bashrc"), "mine").unwrap();
        std::os::unix::fs::symlink(away.join("bashrc"), root.join(".leaf.md.yeraz-saving"))
            .unwrap();
        save(&root.join("leaf.md"), b"# Leaf\n").unwrap();
        assert_eq!(fs::read_to_string(away.join("bashrc")).unwrap(), "mine");
        assert_eq!(
            fs::read_to_string(root.join("leaf.md")).unwrap(),
            "# Leaf\n"
        );
        assert!(!fs::symlink_metadata(root.join("leaf.md"))
            .unwrap()
            .file_type()
            .is_symlink());
    }

    #[test]
    fn a_save_replaces_the_file_and_leaves_no_temporary_one() {
        let root = scratch("save");
        fs::write(root.join("leaf.md"), "old").unwrap();
        fs::write(root.join(".leaf.md.yeraz-saving"), "half a file").unwrap();
        save(&root.join("leaf.md"), b"new").unwrap();
        assert_eq!(fs::read_to_string(root.join("leaf.md")).unwrap(), "new");
        assert!(!root.join(".leaf.md.yeraz-saving").exists());
    }

    #[test]
    fn only_a_plain_absolute_folder_can_be_asked_for() {
        let root = scratch("askable");
        fs::write(root.join(".yeraz.json"), "{}").unwrap();
        assert!(askable(root.to_str().unwrap()));
        let bare = scratch("askable-bare");
        assert!(!askable(bare.to_str().unwrap()));
        for bad in ["", "notes", "./notes", "../notes", "/home/me/../.ssh"] {
            assert!(!askable(bad), "{bad}");
        }
        #[cfg(windows)]
        for bad in [
            r"\\host\share\notes",
            r"\\?\C:\notes",
            r"\\.\pipe\x",
            r"C:notes",
        ] {
            assert!(!askable(bad), "{bad}");
        }
    }
}
