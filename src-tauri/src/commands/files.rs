use std::path::PathBuf;

use serde::Deserialize;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};
use ts_rs::TS;

use crate::error::AppError;
use crate::services::agent::valid_session_id;
use crate::services::chat::ChatService;
use crate::services::files::{
    self, DirListing, Editor, EditorApp, FileContent, FileList, FileMark, FileSaved, FilesService,
    SearchOptions, SearchResults,
};
use crate::services::worktree::WorktreeService;

/// Session dont le volet montre les fichiers. `worktree` : celui qu'elle a rejoint, pris seulement tant qu'elle n'a
/// pas de ligne en base et s'il est dans `git worktree list`.
#[derive(Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct FilesPlace {
    chat_id: String,
    path: Option<String>,
    worktree: Option<String>,
}

/// Dossier de la session, choisi par Rust : son worktree s'il existe, sinon le projet `path`, et sans projet son
/// dossier de « Cet ordinateur ». Le front ne donne jamais qu'un chemin relatif à ce dossier.
async fn session_dir(
    app: &AppHandle,
    place: FilesPlace,
    chats: &ChatService,
    worktrees: &WorktreeService,
) -> Result<PathBuf, AppError> {
    let FilesPlace {
        chat_id,
        path,
        worktree,
    } = place;
    let Some(path) = path else {
        if !valid_session_id(&chat_id) {
            return Err(AppError::InvalidInput(format!(
                "session invalide : {chat_id}"
            )));
        }
        return Ok(app
            .path()
            .app_data_dir()
            .map_err(|error| std::io::Error::other(error.to_string()))?
            .join("scratch")
            .join(chat_id));
    };
    let project = PathBuf::from(path);
    Ok(match chats.worktree_path(&chat_id)?.or(worktree) {
        Some(tree) => worktrees
            .enter(&PathBuf::from(tree), &project)
            .await
            .unwrap_or(project),
        None => project,
    })
}

#[tauri::command]
pub async fn files_list(
    app: AppHandle,
    place: FilesPlace,
    chats: State<'_, ChatService>,
    worktrees: State<'_, WorktreeService>,
) -> Result<FileList, AppError> {
    let dir = session_dir(&app, place, &chats, &worktrees).await?;
    Ok(FileList {
        root: files::list_root(&dir)?,
        files: crate::services::project::files(&dir, false).await?,
    })
}

#[tauri::command]
pub async fn files_read(
    app: AppHandle,
    place: FilesPlace,
    file: String,
    chats: State<'_, ChatService>,
    worktrees: State<'_, WorktreeService>,
) -> Result<FileContent, AppError> {
    let dir = session_dir(&app, place, &chats, &worktrees).await?;
    tauri::async_runtime::spawn_blocking(move || files::read(&dir, &file))
        .await
        .map_err(|error| std::io::Error::other(error.to_string()))?
}

#[tauri::command]
pub async fn files_stat(
    app: AppHandle,
    place: FilesPlace,
    file: String,
    chats: State<'_, ChatService>,
    worktrees: State<'_, WorktreeService>,
) -> Result<Option<String>, AppError> {
    let dir = session_dir(&app, place, &chats, &worktrees).await?;
    files::stat(&dir, &file)
}

#[tauri::command]
pub async fn files_write(
    app: AppHandle,
    place: FilesPlace,
    file: String,
    text: String,
    expected: Option<String>,
    chats: State<'_, ChatService>,
    worktrees: State<'_, WorktreeService>,
) -> Result<FileSaved, AppError> {
    let dir = session_dir(&app, place, &chats, &worktrees).await?;
    files::write(&dir, &file, &text, expected.as_deref())
}

#[tauri::command]
pub async fn files_editors() -> Vec<EditorApp> {
    tauri::async_runtime::spawn_blocking(files::editors)
        .await
        .unwrap_or_default()
}

#[tauri::command]
pub async fn files_open_editor(
    app: AppHandle,
    place: FilesPlace,
    file: String,
    editor: Editor,
    chats: State<'_, ChatService>,
    worktrees: State<'_, WorktreeService>,
) -> Result<(), AppError> {
    let dir = session_dir(&app, place, &chats, &worktrees).await?;
    files::open_in(editor, &dir, &file)
}

#[tauri::command]
pub async fn files_reveal(
    app: AppHandle,
    place: FilesPlace,
    file: String,
    chats: State<'_, ChatService>,
    worktrees: State<'_, WorktreeService>,
) -> Result<(), AppError> {
    let dir = session_dir(&app, place, &chats, &worktrees).await?;
    tauri_plugin_opener::reveal_item_in_dir(files::resolve(&dir, &file)?)
        .map_err(|error| std::io::Error::other(error.to_string()).into())
}

#[tauri::command]
pub async fn files_create(
    app: AppHandle,
    place: FilesPlace,
    parent: String,
    name: String,
    dir: bool,
    chats: State<'_, ChatService>,
    worktrees: State<'_, WorktreeService>,
) -> Result<String, AppError> {
    let root = session_dir(&app, place, &chats, &worktrees).await?;
    files::create(&root, &parent, &name, dir)
}

#[tauri::command]
pub async fn files_rename(
    app: AppHandle,
    place: FilesPlace,
    file: String,
    name: String,
    chats: State<'_, ChatService>,
    worktrees: State<'_, WorktreeService>,
) -> Result<String, AppError> {
    let root = session_dir(&app, place, &chats, &worktrees).await?;
    files::rename(&root, &file, &name)
}

#[tauri::command]
pub async fn files_trash(
    app: AppHandle,
    place: FilesPlace,
    file: String,
    chats: State<'_, ChatService>,
    worktrees: State<'_, WorktreeService>,
) -> Result<(), AppError> {
    let root = session_dir(&app, place, &chats, &worktrees).await?;
    tauri::async_runtime::spawn_blocking(move || files::trash(&root, &file))
        .await
        .map_err(|error| std::io::Error::other(error.to_string()))?
}

/// `cut` : déplacé (couper puis coller), sinon copié sous un nom libre (copier puis coller, dupliquer).
#[tauri::command]
pub async fn files_paste(
    app: AppHandle,
    place: FilesPlace,
    file: String,
    parent: String,
    cut: bool,
    chats: State<'_, ChatService>,
    worktrees: State<'_, WorktreeService>,
) -> Result<String, AppError> {
    let root = session_dir(&app, place, &chats, &worktrees).await?;
    tauri::async_runtime::spawn_blocking(move || {
        if cut {
            files::move_to(&root, &file, &parent)
        } else {
            files::copy(&root, &file, &parent)
        }
    })
    .await
    .map_err(|error| std::io::Error::other(error.to_string()))?
}

/// Signal sur `on_change` à chaque changement du dossier de la session ; rend l'id à passer à `files_unwatch`.
#[tauri::command]
pub async fn files_watch(
    app: AppHandle,
    place: FilesPlace,
    on_change: Channel<()>,
    chats: State<'_, ChatService>,
    worktrees: State<'_, WorktreeService>,
    watchers: State<'_, FilesService>,
) -> Result<u32, AppError> {
    let root = session_dir(&app, place, &chats, &worktrees).await?;
    watchers.watch(&root, move || {
        let _ = on_change.send(());
    })
}

#[tauri::command]
pub fn files_unwatch(id: u32, watchers: State<'_, FilesService>) {
    watchers.unwatch(id);
}

#[tauri::command]
pub async fn files_search(
    app: AppHandle,
    place: FilesPlace,
    options: SearchOptions,
    chats: State<'_, ChatService>,
    worktrees: State<'_, WorktreeService>,
) -> Result<SearchResults, AppError> {
    let root = session_dir(&app, place, &chats, &worktrees).await?;
    files::search(&root, &options).await
}

/// Un dossier (`dir` relatif, vide pour la racine), lu quand l'explorateur l'ouvre.
#[tauri::command]
pub async fn files_dir(
    app: AppHandle,
    place: FilesPlace,
    dir: String,
    chats: State<'_, ChatService>,
    worktrees: State<'_, WorktreeService>,
) -> Result<DirListing, AppError> {
    let root = session_dir(&app, place, &chats, &worktrees).await?;
    files::list_dir(&root, &dir).await
}

#[tauri::command]
pub async fn files_marks(
    app: AppHandle,
    place: FilesPlace,
    chats: State<'_, ChatService>,
    worktrees: State<'_, WorktreeService>,
) -> Result<Vec<FileMark>, AppError> {
    let root = session_dir(&app, place, &chats, &worktrees).await?;
    files::marks(&root).await
}
