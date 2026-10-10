use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::error::AppError;
use crate::services::agent::valid_session_id;

/// Au-delà, l'image n'est plus envoyée en entier : l'agent la lit lui-même depuis son chemin.
const IMAGE_LIMIT: u64 = 20 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Attachment {
    /// Ce que l'agent reçoit : l'image elle-même, ou le chemin du fichier qu'il lira.
    pub path: String,
    pub name: String,
    pub kind: AttachmentKind,
    /// Copie de l'image dans le dossier des pièces jointes, le seul que la webview peut afficher.
    pub preview: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum AttachmentKind {
    Image,
    File,
    Folder,
}

/// Pièce jointe prête pour l'agent.
#[derive(Debug, Clone, PartialEq)]
pub enum Attached {
    Image {
        path: String,
        media_type: &'static str,
        base64: String,
    },
    Path(String),
}

/// Pièces jointes rangées par chat dans `<données de l'app>/attachments/<id du chat>`.
pub struct AttachmentService {
    dir: PathBuf,
    next: AtomicU64,
}

impl AttachmentService {
    pub fn new(dir: PathBuf) -> Self {
        Self {
            dir,
            next: AtomicU64::new(0),
        }
    }

    /// Fichier collé : il n'existe que dans le presse-papiers, il est écrit sur disque.
    pub fn save(&self, chat_id: &str, name: &str, base64: &str) -> Result<Attachment, AppError> {
        let bytes = STANDARD
            .decode(base64)
            .map_err(|_| AppError::InvalidInput("contenu de la pièce jointe illisible".into()))?;
        let path = self.slot(chat_id, name)?;
        std::fs::write(&path, bytes)?;
        let path = path.display().to_string();
        let kind = kind_of(Path::new(&path));
        Ok(Attachment {
            preview: (kind == AttachmentKind::Image).then(|| path.clone()),
            name: safe_name(name),
            path,
            kind,
        })
    }

    /// Fichiers glissés ou choisis : l'agent les lit où ils sont, une image est copiée pour son aperçu.
    pub fn import(&self, chat_id: &str, paths: &[String]) -> Result<Vec<Attachment>, AppError> {
        paths
            .iter()
            .map(|path| {
                let path = std::fs::canonicalize(path)
                    .map_err(|_| AppError::InvalidInput(format!("fichier introuvable : {path}")))?;
                let kind = kind_of(&path);
                let name = file_name(&path.display().to_string());
                let preview = match kind {
                    AttachmentKind::Image => {
                        let copy = self.slot(chat_id, &name)?;
                        std::fs::copy(&path, &copy)?;
                        Some(copy.display().to_string())
                    }
                    _ => None,
                };
                Ok(Attachment {
                    path: path.display().to_string(),
                    name,
                    kind,
                    preview,
                })
            })
            .collect()
    }

    pub fn discard(&self, chat_id: &str) {
        if valid_session_id(chat_id) {
            let _ = std::fs::remove_dir_all(self.dir.join(chat_id));
        }
    }

    fn slot(&self, chat_id: &str, name: &str) -> Result<PathBuf, AppError> {
        if !valid_session_id(chat_id) {
            return Err(AppError::InvalidInput(
                "identifiant de chat invalide".into(),
            ));
        }
        let dir = self.dir.join(chat_id);
        std::fs::create_dir_all(&dir)?;
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |time| time.as_millis());
        let n = self.next.fetch_add(1, Ordering::Relaxed);
        Ok(dir.join(format!("{stamp}-{n}-{}", safe_name(name))))
    }
}

/// Lit les pièces jointes au moment de l'envoi. Une image d'un format que l'agent ne lit pas
/// (ou trop lourde) part comme un fichier ordinaire.
pub fn load(attachments: &[Attachment]) -> Result<Vec<Attached>, AppError> {
    attachments
        .iter()
        .map(|attachment| {
            let path = std::fs::canonicalize(&attachment.path).map_err(|_| {
                AppError::InvalidInput(format!("pièce jointe introuvable : {}", attachment.name))
            })?;
            let display = path.display().to_string();
            if attachment.kind == AttachmentKind::Image
                && std::fs::metadata(&path)?.len() <= IMAGE_LIMIT
            {
                let bytes = std::fs::read(&path)?;
                if let Some(media_type) = media_type(&bytes) {
                    return Ok(Attached::Image {
                        path: display,
                        media_type,
                        base64: STANDARD.encode(bytes),
                    });
                }
            }
            Ok(Attached::Path(display))
        })
        .collect()
}

fn kind_of(path: &Path) -> AttachmentKind {
    if path.is_dir() {
        return AttachmentKind::Folder;
    }
    let extension = path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(str::to_ascii_lowercase);
    match extension.as_deref() {
        Some("png" | "jpg" | "jpeg" | "gif" | "webp") => AttachmentKind::Image,
        _ => AttachmentKind::File,
    }
}

/// D'après le contenu, pas l'extension : l'API refuse une image dont le type annoncé est faux.
fn media_type(bytes: &[u8]) -> Option<&'static str> {
    match bytes {
        [0x89, b'P', b'N', b'G', ..] => Some("image/png"),
        [0xFF, 0xD8, 0xFF, ..] => Some("image/jpeg"),
        [b'G', b'I', b'F', b'8', ..] => Some("image/gif"),
        [
            b'R',
            b'I',
            b'F',
            b'F',
            _,
            _,
            _,
            _,
            b'W',
            b'E',
            b'B',
            b'P',
            ..,
        ] => Some("image/webp"),
        _ => None,
    }
}

fn file_name(path: &str) -> String {
    Path::new(path).file_name().map_or_else(
        || path.to_owned(),
        |name| name.to_string_lossy().into_owned(),
    )
}

/// Le nom vient du presse-papiers : rien qui permette de sortir du dossier.
fn safe_name(name: &str) -> String {
    let name: String = file_name(name)
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '\0' => '_',
            c => c,
        })
        .take(80)
        .collect();
    let name = name.trim_start_matches('.');
    if name.is_empty() {
        "fichier".to_owned()
    } else {
        name.to_owned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn service() -> (AttachmentService, PathBuf) {
        let n = std::process::id();
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |time| time.as_nanos());
        let dir = std::env::temp_dir().join(format!("nuee-attachments-{n}-{stamp}"));
        (AttachmentService::new(dir.join("attachments")), dir)
    }

    const PNG: &[u8] = &[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];

    #[test]
    fn a_pasted_image_is_written_in_its_chat_folder_and_sent_as_an_image() {
        let (attachments, root) = service();
        let pasted = attachments
            .save("chat-1", "../../Capture d'écran.png", &STANDARD.encode(PNG))
            .expect("enregistrée");
        assert_eq!(pasted.kind, AttachmentKind::Image);
        assert!(pasted.path.contains("/attachments/chat-1/"));
        assert_eq!(pasted.name, "Capture d'écran.png");
        assert_eq!(pasted.preview.as_deref(), Some(pasted.path.as_str()));

        let loaded = load(&[pasted]).expect("lue");
        let [Attached::Image { media_type, .. }] = loaded.as_slice() else {
            panic!("une image attendue");
        };
        assert_eq!(*media_type, "image/png");

        attachments.discard("chat-1");
        assert!(!root.join("attachments/chat-1").exists());
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn a_dropped_file_stays_in_place_and_a_fake_image_goes_as_a_path() {
        let (attachments, root) = service();
        std::fs::create_dir_all(&root).expect("dossier");
        std::fs::write(root.join("notes.txt"), "bonjour").expect("fichier");
        std::fs::write(root.join("faux.png"), "pas une image").expect("fichier");
        let paths = [
            root.join("notes.txt").display().to_string(),
            root.join("faux.png").display().to_string(),
            root.display().to_string(),
        ];
        let imported = attachments.import("chat-2", &paths).expect("importés");
        let kinds: Vec<AttachmentKind> = imported.iter().map(|a| a.kind).collect();
        assert_eq!(
            kinds,
            [
                AttachmentKind::File,
                AttachmentKind::Image,
                AttachmentKind::Folder
            ]
        );
        assert!(imported[0].preview.is_none());
        assert!(
            imported[1]
                .preview
                .as_deref()
                .is_some_and(|copy| copy.contains("/attachments/chat-2/"))
        );

        let loaded = load(&imported).expect("lus");
        assert!(loaded.iter().all(|a| matches!(a, Attached::Path(_))));
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn a_chat_id_cannot_escape_the_attachments_folder() {
        let (attachments, root) = service();
        assert!(attachments.save("../x", "a.png", "").is_err());
        let _ = std::fs::remove_dir_all(root);
    }
}
