use std::path::Path;

use tauri::State;
use tauri::ipc::Channel;

use crate::error::AppError;
use crate::services::agent::{
    AgentEvent, AgentKind, AgentService, AgentStatus, Catalog, ChatCommand, SessionSpec,
};
use crate::services::attachment::Attachment;
use crate::services::chat::ChatService;
use crate::services::worktree::{WorktreeService, canonical};

/// Rend la main dès que le message est parti ; la suite arrive sur `on_event` jusqu'à `turnEnd`.
/// Le worktree propre à un chat naît ici, au premier message. Renvoie le worktree où travaille l'agent.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn agent_send(
    mut spec: SessionSpec,
    prompt: String,
    attachments: Vec<Attachment>,
    recap: Option<String>,
    command: Option<ChatCommand>,
    on_event: Channel<AgentEvent>,
    agents: State<'_, AgentService>,
    chats: State<'_, ChatService>,
    worktrees: State<'_, WorktreeService>,
) -> Result<Option<String>, AppError> {
    let Place::Ready(root) = place(&mut spec, &chats, &worktrees, true).await? else {
        return Err(AppError::Git("le worktree du chat n'a pas été créé".into()));
    };
    agents.send(spec, prompt, &attachments, recap, command, on_event)?;
    Ok(root)
}

/// Un worktree pas encore créé attend le premier message : rien à préparer d'ici là.
#[tauri::command]
pub async fn agent_warm(
    mut spec: SessionSpec,
    agents: State<'_, AgentService>,
    chats: State<'_, ChatService>,
    worktrees: State<'_, WorktreeService>,
) -> Result<(), AppError> {
    match place(&mut spec, &chats, &worktrees, false).await? {
        Place::Ready(_) => agents.warm(spec),
        Place::Later => Ok(()),
    }
}

enum Place {
    /// `cwd` pointe sur le dossier de travail ; le worktree, s'il y en a un.
    Ready(Option<String>),
    /// Le worktree du chat n'existe pas encore.
    Later,
}

/// Remplace le dossier du projet par celui du worktree du chat. Le sien, effacé à la main, revient sur sa branche.
async fn place(
    spec: &mut SessionSpec,
    chats: &ChatService,
    worktrees: &WorktreeService,
    create: bool,
) -> Result<Place, AppError> {
    if !spec.worktree {
        return Ok(Place::Ready(None));
    }
    let Some(project) = spec.cwd.clone() else {
        return Ok(Place::Ready(None));
    };
    let project = Path::new(&project);
    let own = canonical(&worktrees.own(&spec.chat_id)?);
    let (cwd, root) = match spec.worktree_path.clone() {
        Some(path) if path != own => {
            let cwd = worktrees.enter(Path::new(&path), project).await?;
            // Le front a pu le choisir avant que la ligne du chat n'existe en base : on le réécrit au message.
            if create {
                chats.set_worktree(&spec.chat_id, true, Some(&path))?;
            }
            (cwd, path)
        }
        _ => {
            if !create && !worktrees.exists(&spec.chat_id) {
                return Ok(Place::Later);
            }
            let cwd = worktrees.ensure(&spec.chat_id, project).await?;
            if spec.worktree_path.is_none() {
                chats.set_worktree(&spec.chat_id, true, Some(&own))?;
            }
            (cwd, own)
        }
    };
    spec.cwd = Some(cwd.to_string_lossy().into_owned());
    Ok(Place::Ready(Some(root)))
}

#[tauri::command]
pub fn agent_stop(chat_id: String, agents: State<'_, AgentService>) {
    agents.stop(&chat_id);
}

#[tauri::command]
pub async fn agent_catalog(
    agent: AgentKind,
    agents: State<'_, AgentService>,
) -> Result<Catalog, AppError> {
    agents.catalog(agent).await
}

/// `path` : emplacement choisi dans les réglages, repris ensuite par tous les chats de l'agent.
#[tauri::command]
pub async fn agent_probe(
    agent: AgentKind,
    path: Option<String>,
    agents: State<'_, AgentService>,
) -> Result<AgentStatus, AppError> {
    agents.set_path(agent, path)?;
    agents.status(agent).await
}

#[tauri::command]
pub async fn agent_update(
    agent: AgentKind,
    agents: State<'_, AgentService>,
) -> Result<String, AppError> {
    agents.update(agent).await
}

#[tauri::command]
pub fn agent_approve(
    chat_id: String,
    request_id: String,
    allow: bool,
    agents: State<'_, AgentService>,
) {
    agents.approve(&chat_id, &request_id, allow);
}
