use serde::{Serialize, Serializer};
use ts_rs::TS;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("binaire `{0}` introuvable dans le PATH")]
    AgentNotFound(&'static str),
    #[error("{0}")]
    AgentFailed(String),
    #[error("un tour est déjà en cours dans ce chat")]
    Busy,
    #[error("{0}")]
    InvalidInput(String),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Database(#[from] rusqlite::Error),
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum ErrorKind {
    AgentNotFound,
    AgentFailed,
    Busy,
    InvalidInput,
    Io,
    Database,
}

/// Forme reçue par le front quand une commande échoue : `kind` choisit le texte traduit.
#[derive(Serialize, TS)]
#[ts(export, rename = "AppError")]
struct ErrorPayload {
    kind: ErrorKind,
    message: String,
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let kind = match self {
            Self::AgentNotFound(_) => ErrorKind::AgentNotFound,
            Self::AgentFailed(_) => ErrorKind::AgentFailed,
            Self::Busy => ErrorKind::Busy,
            Self::InvalidInput(_) => ErrorKind::InvalidInput,
            Self::Io(_) => ErrorKind::Io,
            Self::Database(_) => ErrorKind::Database,
        };
        ErrorPayload {
            kind,
            message: self.to_string(),
        }
        .serialize(serializer)
    }
}
