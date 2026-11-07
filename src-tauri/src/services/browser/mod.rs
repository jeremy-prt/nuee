//! Volet Navigateur : de vraies pages web posées dans la fenêtre, une par onglet, que l'utilisateur
//! utilise et que l'agent pilote par les outils de `tools.rs`. Sur macOS, une WKWebView créée à la
//! main (`native.rs`) plutôt qu'une webview Tauri : la page n'a ainsi aucun accès aux commandes de Nuée,
//! et la fenêtre principale reste une simple webview (le mode multi-webview de Tauri est instable).
// Hors macOS, rien ne reçoit encore la page : ses relevés (console, réseau) restent sans lecteur.
#![cfg_attr(not(target_os = "macos"), allow(dead_code))]

use std::collections::{HashMap, VecDeque};
use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::AppHandle;
use tauri::ipc::Channel;
use ts_rs::TS;

use crate::error::AppError;

#[cfg(target_os = "macos")]
mod native;
pub mod tools;

const CONSOLE_LIMIT: usize = 1000;
const NETWORK_LIMIT: usize = 500;
/// Corps de requête et de réponse gardés, en caractères.
const BODY_LIMIT: usize = 64 * 1024;
const TEXT_LIMIT: usize = 4000;
const SCRIPT_TIMEOUT: Duration = Duration::from_secs(15);
/// Taille donnée à une page que l'agent pilote alors que le volet ne la montre pas.
const PARKED: Viewport = Viewport {
    width: 1280,
    height: 800,
};

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum ColorScheme {
    Light,
    Dark,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Viewport {
    pub width: u32,
    pub height: u32,
}

/// Zone du volet où poser la page, en points de la fenêtre (zoom de l'interface déjà appliqué).
#[derive(Clone, Copy, Debug, PartialEq, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct PaneRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Clone, Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct BrowserTab {
    pub id: String,
    pub chat_id: String,
    pub url: String,
    pub title: String,
    pub loading: bool,
    pub can_back: bool,
    pub can_forward: bool,
    /// Chargement raté (serveur arrêté, adresse inconnue) : le message de WebKit.
    pub error: Option<String>,
    /// Taille d'écran imposée ; `None` : la page prend tout le volet.
    pub viewport: Option<Viewport>,
    pub color_scheme: Option<ColorScheme>,
}

#[derive(Clone, Serialize, TS)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[ts(export)]
pub enum BrowserEvent {
    Tab {
        tab: BrowserTab,
    },
    Closed {
        id: String,
    },
    /// L'agent a ouvert ou choisi cet onglet : le volet le montre si la session est à l'écran.
    Reveal {
        chat_id: String,
        tab_id: String,
    },
    /// Ce que fait l'agent dans la page ; `None` quand il a fini.
    Agent {
        tab_id: String,
        action: Option<String>,
    },
    /// Raccourci ⌘ tapé dans la page : le front le rejoue comme s'il avait été tapé chez lui.
    Key {
        key: String,
        code: String,
        meta: bool,
        ctrl: bool,
        alt: bool,
        shift: bool,
    },
}

#[derive(Clone, Debug, Serialize)]
pub struct ConsoleEntry {
    pub level: String,
    pub text: String,
    pub url: String,
    pub time: u64,
}

#[derive(Clone, Debug, Serialize)]
pub struct NetworkEntry {
    pub id: String,
    pub kind: String,
    pub method: String,
    pub url: String,
    pub status: Option<u16>,
    pub status_text: String,
    pub mime: String,
    pub duration_ms: Option<f64>,
    pub size: Option<u64>,
    pub error: Option<String>,
    pub request_headers: Option<Value>,
    pub response_headers: Option<Value>,
    pub request_body: Option<String>,
    pub response_body: Option<String>,
    pub time: u64,
}

/// Monde où tourne un script : celui de la page (son `window`), ou le nôtre, qui voit le même DOM
/// mais pas ses variables ni ses retouches de prototypes.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum World {
    Page,
    Nuee,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum MouseAction {
    Click { button: MouseButton, count: u8 },
    Move,
    Drag { from: (f64, f64) },
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum MouseButton {
    Left,
    Right,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Modifiers {
    pub meta: bool,
    pub ctrl: bool,
    pub alt: bool,
    pub shift: bool,
}

struct Tab {
    info: BrowserTab,
    store: String,
    console: VecDeque<ConsoleEntry>,
    network: VecDeque<NetworkEntry>,
    /// Zone du volet donnée par le front ; `None` : la page n'est pas à l'écran.
    pane: Option<PaneRect>,
}

#[derive(Default)]
struct State {
    tabs: Vec<Tab>,
    /// Stockage (cookies, localStorage) de chaque session : celui de son projet.
    stores: HashMap<String, String>,
    /// Onglet au premier plan de chaque session : celui où agit l'agent sans `tabId`.
    active: HashMap<String, String>,
    channel: Option<Channel<BrowserEvent>>,
    next_tab: u64,
    next_request: u64,
}

#[derive(Default)]
pub struct BrowserService {
    state: Mutex<State>,
}

impl BrowserService {
    /// Le front s'abonne ; renvoie les onglets ouverts (après un rechargement de la page, ils sont toujours là).
    pub fn watch(&self, channel: Channel<BrowserEvent>) -> Vec<BrowserTab> {
        let mut state = lock(&self.state);
        state.channel = Some(channel);
        state.tabs.iter().map(|tab| tab.info.clone()).collect()
    }

    /// Stockage de la session : un par projet, un par session sans projet.
    pub fn bind(&self, chat_id: &str, project: Option<&str>) {
        let store = project.map_or_else(|| format!("chat:{chat_id}"), str::to_owned);
        lock(&self.state).stores.insert(chat_id.to_owned(), store);
    }

    fn store_of(&self, chat_id: &str) -> String {
        lock(&self.state)
            .stores
            .get(chat_id)
            .cloned()
            .unwrap_or_else(|| format!("chat:{chat_id}"))
    }

    pub fn tabs_of(&self, chat_id: &str) -> Vec<BrowserTab> {
        lock(&self.state)
            .tabs
            .iter()
            .filter(|tab| tab.info.chat_id == chat_id)
            .map(|tab| tab.info.clone())
            .collect()
    }

    pub fn active_of(&self, chat_id: &str) -> Option<String> {
        let state = lock(&self.state);
        let active = state.active.get(chat_id)?;
        state
            .tabs
            .iter()
            .any(|tab| &tab.info.id == active)
            .then(|| active.clone())
    }

    pub fn tab(&self, id: &str) -> Option<BrowserTab> {
        lock(&self.state)
            .tabs
            .iter()
            .find(|tab| tab.info.id == id)
            .map(|tab| tab.info.clone())
    }

    pub fn select(&self, chat_id: &str, tab_id: &str) {
        let mut state = lock(&self.state);
        if state
            .tabs
            .iter()
            .any(|tab| tab.info.id == tab_id && tab.info.chat_id == chat_id)
        {
            state.active.insert(chat_id.to_owned(), tab_id.to_owned());
        }
    }

    pub async fn open(
        &self,
        app: &AppHandle,
        chat_id: &str,
        url: &str,
    ) -> Result<BrowserTab, AppError> {
        let url = normalize_url(url)?;
        let store = self.store_of(chat_id);
        let info = {
            let mut state = lock(&self.state);
            state.next_tab += 1;
            let info = BrowserTab {
                id: format!("tab_{}", state.next_tab),
                chat_id: chat_id.to_owned(),
                url: url.clone(),
                title: String::new(),
                loading: true,
                can_back: false,
                can_forward: false,
                error: None,
                viewport: None,
                color_scheme: None,
            };
            state.tabs.push(Tab {
                info: info.clone(),
                store: store.clone(),
                console: VecDeque::new(),
                network: VecDeque::new(),
                pane: None,
            });
            state.active.insert(chat_id.to_owned(), info.id.clone());
            info
        };
        let id = info.id.clone();
        let handle = app.clone();
        let created = on_main(app, move |mtm| {
            native::create(&handle, &id, store_id(&store), &url, mtm)
        })
        .await?;
        if let Err(error) = created {
            self.forget(&info.id);
            return Err(AppError::Browser(error));
        }
        self.emit(BrowserEvent::Tab { tab: info.clone() });
        Ok(info)
    }

    pub async fn close(&self, app: &AppHandle, id: &str) -> Result<(), AppError> {
        let tab = id.to_owned();
        on_main(app, move |_| native::close(&tab)).await?;
        self.forget(id);
        self.emit(BrowserEvent::Closed { id: id.to_owned() });
        Ok(())
    }

    /// Les onglets d'une session qu'on ferme partent avec elle.
    pub async fn close_chat(&self, app: &AppHandle, chat_id: &str) {
        for tab in self.tabs_of(chat_id) {
            let _ = self.close(app, &tab.id).await;
        }
    }

    fn forget(&self, id: &str) {
        let mut state = lock(&self.state);
        state.tabs.retain(|tab| tab.info.id != id);
        state.active.retain(|_, active| active != id);
    }

    pub async fn navigate(&self, app: &AppHandle, id: &str, url: &str) -> Result<(), AppError> {
        let url = normalize_url(url)?;
        self.update(id, |info| {
            info.url = url.clone();
            info.error = None;
            info.loading = true;
        });
        let tab = id.to_owned();
        on_main(app, move |_| native::load(&tab, &url)).await
    }

    pub async fn history(&self, app: &AppHandle, id: &str, step: History) -> Result<(), AppError> {
        self.update(id, |info| info.error = None);
        let tab = id.to_owned();
        on_main(app, move |_| native::history(&tab, step)).await
    }

    /// Le front donne la zone du volet, ou `None` quand la page n'est plus à l'écran.
    pub async fn place(
        &self,
        app: &AppHandle,
        id: &str,
        pane: Option<PaneRect>,
    ) -> Result<(), AppError> {
        let viewport = {
            let mut state = lock(&self.state);
            let Some(tab) = state.tabs.iter_mut().find(|tab| tab.info.id == id) else {
                return Ok(());
            };
            tab.pane = pane;
            tab.info.viewport
        };
        let tab = id.to_owned();
        on_main(app, move |_| {
            native::place(&tab, pane.map(|pane| frame_in(pane, viewport)))
        })
        .await
    }

    /// Une page hors de l'écran est posée hors de la fenêtre le temps que l'agent agisse : cachée,
    /// WebKit ne la dessine plus et les captures reviennent vides.
    async fn wake(&self, app: &AppHandle, id: &str) -> Result<(), AppError> {
        let (shown, viewport) = {
            let state = lock(&self.state);
            let tab = state
                .tabs
                .iter()
                .find(|tab| tab.info.id == id)
                .ok_or_else(|| AppError::Browser(format!("onglet introuvable : {id}")))?;
            (tab.pane.is_some(), tab.info.viewport)
        };
        if shown {
            return Ok(());
        }
        let size = viewport.unwrap_or(PARKED);
        let tab = id.to_owned();
        on_main(app, move |_| {
            native::place(
                &tab,
                Some(Frame {
                    x: -20_000.0,
                    y: 0.0,
                    width: f64::from(size.width),
                    height: f64::from(size.height),
                    zoom: 1.0,
                }),
            )
        })
        .await
    }

    pub async fn emulate(
        &self,
        app: &AppHandle,
        id: &str,
        viewport: Option<Viewport>,
        scheme: Option<Option<ColorScheme>>,
        mobile: bool,
    ) -> Result<(), AppError> {
        let mut pane = None;
        self.update(id, |info| {
            info.viewport = viewport;
            if let Some(scheme) = scheme {
                info.color_scheme = scheme;
            }
        });
        if let Some(tab) = lock(&self.state).tabs.iter().find(|tab| tab.info.id == id) {
            pane = tab.pane;
        }
        let tab = id.to_owned();
        on_main(app, move |_| {
            native::user_agent(&tab, mobile.then_some(MOBILE_AGENT));
            if let Some(scheme) = scheme {
                native::appearance(&tab, scheme);
            }
            if let Some(pane) = pane {
                native::place(&tab, Some(frame_in(pane, viewport)));
            }
        })
        .await?;
        if pane.is_none() {
            self.wake(app, id).await?;
        }
        Ok(())
    }

    /// Lance `body` (corps d'une fonction async) et renvoie la valeur qu'elle rend, passée par JSON.
    pub async fn script(
        &self,
        app: &AppHandle,
        id: &str,
        body: String,
        world: World,
    ) -> Result<Value, AppError> {
        self.wake(app, id).await?;
        let tab = id.to_owned();
        let (sender, receiver) = tokio::sync::oneshot::channel();
        on_main(app, move |_| native::script(&tab, &body, world, sender)).await?;
        let result = tokio::time::timeout(SCRIPT_TIMEOUT, receiver)
            .await
            .map_err(|_| {
                AppError::Browser("la page ne répond pas (script trop long ou bloqué)".into())
            })?
            .map_err(|_| AppError::Browser("onglet fermé".into()))?;
        let text = result.map_err(AppError::Browser)?;
        Ok(serde_json::from_str(&text).unwrap_or(Value::String(text)))
    }

    /// Fonction de `agent.js`, dans notre monde.
    pub async fn helper(
        &self,
        app: &AppHandle,
        id: &str,
        name: &str,
        args: Value,
    ) -> Result<Value, AppError> {
        let body = format!(
            "if (!globalThis.__nuee) {{ {AGENT_SCRIPT} }}\nreturn JSON.stringify(await globalThis.__nuee.{name}({args}) ?? null)"
        );
        self.script(app, id, body, World::Nuee).await
    }

    /// Capture de la zone visible (ou de `region`, en px CSS), à l'échelle du CSS : un pixel de l'image = un px CSS.
    pub async fn screenshot(
        &self,
        app: &AppHandle,
        id: &str,
        region: Option<[f64; 4]>,
        scale: f64,
    ) -> Result<Screenshot, AppError> {
        self.wake(app, id).await?;
        let tab = id.to_owned();
        let (sender, receiver) = tokio::sync::oneshot::channel();
        on_main(app, move |_| native::snapshot(&tab, region, scale, sender)).await?;
        tokio::time::timeout(SCRIPT_TIMEOUT, receiver)
            .await
            .map_err(|_| AppError::Browser("capture trop longue".into()))?
            .map_err(|_| AppError::Browser("onglet fermé".into()))?
            .map_err(AppError::Browser)
    }

    /// Vrais événements de souris de macOS, aux coordonnées CSS de la page.
    pub async fn mouse(
        &self,
        app: &AppHandle,
        id: &str,
        action: MouseAction,
        point: (f64, f64),
        modifiers: Modifiers,
    ) -> Result<(), AppError> {
        self.wake(app, id).await?;
        let tab = id.to_owned();
        on_main(app, move |_| native::mouse(&tab, action, point, modifiers))
            .await?
            .map_err(AppError::Browser)
    }

    pub async fn key(
        &self,
        app: &AppHandle,
        id: &str,
        key: String,
        modifiers: Modifiers,
    ) -> Result<(), AppError> {
        self.wake(app, id).await?;
        let tab = id.to_owned();
        on_main(app, move |_| native::key(&tab, &key, modifiers))
            .await?
            .map_err(AppError::Browser)
    }

    /// Cookies, stockage local et cache du projet. Les pages ouvertes sont rechargées sans eux.
    pub async fn clear_data(&self, app: &AppHandle, chat_id: &str) -> Result<(), AppError> {
        let store = self.store_of(chat_id);
        let (sender, receiver) = tokio::sync::oneshot::channel();
        let id = store_id(&store);
        on_main(app, move |mtm| native::clear_store(id, sender, mtm)).await?;
        receiver
            .await
            .map_err(|_| AppError::Browser("effacement interrompu".into()))?
            .map_err(AppError::Browser)?;
        let tabs: Vec<String> = lock(&self.state)
            .tabs
            .iter()
            .filter(|tab| tab.store == store)
            .map(|tab| tab.info.id.clone())
            .collect();
        for tab in tabs {
            self.history(app, &tab, History::Reload).await?;
        }
        Ok(())
    }

    pub fn reveal(&self, chat_id: &str, tab_id: &str) {
        lock(&self.state)
            .active
            .insert(chat_id.to_owned(), tab_id.to_owned());
        self.emit(BrowserEvent::Reveal {
            chat_id: chat_id.to_owned(),
            tab_id: tab_id.to_owned(),
        });
    }

    pub fn agent_action(&self, tab_id: &str, action: Option<String>) {
        self.emit(BrowserEvent::Agent {
            tab_id: tab_id.to_owned(),
            action,
        });
    }

    pub fn console(&self, id: &str, clear: bool) -> Vec<ConsoleEntry> {
        let mut state = lock(&self.state);
        let Some(tab) = state.tabs.iter_mut().find(|tab| tab.info.id == id) else {
            return Vec::new();
        };
        let entries = tab.console.iter().cloned().collect();
        if clear {
            tab.console.clear();
        }
        entries
    }

    pub fn network(&self, id: &str, clear: bool) -> Vec<NetworkEntry> {
        let mut state = lock(&self.state);
        let Some(tab) = state.tabs.iter_mut().find(|tab| tab.info.id == id) else {
            return Vec::new();
        };
        let entries = tab.network.iter().cloned().collect();
        if clear {
            tab.network.clear();
        }
        entries
    }

    // ===== Appelé par la page (native.rs), sur le thread principal =====

    fn update(&self, id: &str, change: impl FnOnce(&mut BrowserTab)) {
        let info = {
            let mut state = lock(&self.state);
            let Some(tab) = state.tabs.iter_mut().find(|tab| tab.info.id == id) else {
                return;
            };
            let before = tab.info.clone();
            change(&mut tab.info);
            if same(&before, &tab.info) {
                return;
            }
            tab.info.clone()
        };
        self.emit(BrowserEvent::Tab { tab: info });
    }

    fn navigated(&self, id: &str, page: PageState) {
        self.update(id, |info| {
            if let Some(url) = page.url {
                info.url = url;
            }
            if let Some(title) = page.title {
                info.title = title;
            }
            info.can_back = page.can_back;
            info.can_forward = page.can_forward;
            if let Some(loading) = page.loading {
                info.loading = loading;
                if loading {
                    info.error = None;
                }
            }
            if page.error.is_some() {
                info.error = page.error;
                info.loading = false;
            }
        });
    }

    /// Ouverture d'une page dans un nouvel onglet (`target=_blank`, `window.open`).
    fn chat_of(&self, id: &str) -> Option<String> {
        lock(&self.state)
            .tabs
            .iter()
            .find(|tab| tab.info.id == id)
            .map(|tab| tab.info.chat_id.clone())
    }

    /// Message de `page.js` : console, requête ou raccourci.
    fn message(&self, id: &str, text: &str) {
        let Ok(message) = serde_json::from_str::<Value>(text) else {
            return;
        };
        let now = now_ms();
        match message["t"].as_str() {
            Some("console") => {
                let mut state = lock(&self.state);
                let Some(tab) = state.tabs.iter_mut().find(|tab| tab.info.id == id) else {
                    return;
                };
                if tab.console.len() >= CONSOLE_LIMIT {
                    tab.console.pop_front();
                }
                let url = tab.info.url.clone();
                tab.console.push_back(ConsoleEntry {
                    level: clip(message["level"].as_str().unwrap_or("log"), 16),
                    text: clip(message["text"].as_str().unwrap_or_default(), TEXT_LIMIT),
                    url,
                    time: now,
                });
            }
            Some("net") => {
                let mut state = lock(&self.state);
                state.next_request += 1;
                let request = format!("req_{}", state.next_request);
                let Some(tab) = state.tabs.iter_mut().find(|tab| tab.info.id == id) else {
                    return;
                };
                if tab.network.len() >= NETWORK_LIMIT {
                    tab.network.pop_front();
                }
                tab.network.push_back(network_entry(request, &message, now));
            }
            Some("nav") => self.navigated(
                id,
                PageState {
                    url: message["url"].as_str().map(str::to_owned),
                    title: message["title"].as_str().map(|title| clip(title, 300)),
                    can_back: message["back"].as_bool().unwrap_or_default(),
                    can_forward: false,
                    loading: None,
                    error: None,
                },
            ),
            Some("key") => self.emit(BrowserEvent::Key {
                key: clip(message["key"].as_str().unwrap_or_default(), 32),
                code: clip(message["code"].as_str().unwrap_or_default(), 32),
                meta: message["meta"] == true,
                ctrl: message["ctrl"] == true,
                alt: message["alt"] == true,
                shift: message["shift"] == true,
            }),
            _ => {}
        }
    }

    fn emit(&self, event: BrowserEvent) {
        let channel = lock(&self.state).channel.clone();
        if let Some(channel) = channel {
            let _ = channel.send(event);
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum History {
    Back,
    Forward,
    Reload,
    Stop,
}

/// Ce que WebKit dit de la page après un changement.
struct PageState {
    url: Option<String>,
    title: Option<String>,
    can_back: bool,
    can_forward: bool,
    loading: Option<bool>,
    error: Option<String>,
}

/// Cadre de la page dans la fenêtre, en points, et le zoom qui donne au CSS la largeur voulue.
#[derive(Clone, Copy, Debug, PartialEq)]
struct Frame {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    zoom: f64,
}

pub struct Screenshot {
    pub jpeg: Vec<u8>,
    pub width: u32,
    pub height: u32,
}

const MOBILE_AGENT: &str = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";
const AGENT_SCRIPT: &str = include_str!("agent.js");
const PAGE_SCRIPT: &str = include_str!("page.js");

/// Taille d'écran imposée : la page garde sa largeur CSS, réduite par le zoom si le volet est plus étroit,
/// centrée en haut du volet.
fn frame_in(pane: PaneRect, viewport: Option<Viewport>) -> Frame {
    let Some(viewport) = viewport else {
        return Frame {
            x: pane.x,
            y: pane.y,
            width: pane.width,
            height: pane.height,
            zoom: 1.0,
        };
    };
    let (width, height) = (f64::from(viewport.width), f64::from(viewport.height));
    let zoom = (pane.width / width).min(pane.height / height).min(1.0);
    // Arrondi au point supérieur : sinon la page compte un px CSS de moins (374 au lieu de 375).
    let (shown_width, shown_height) = ((width * zoom).ceil(), (height * zoom).ceil());
    Frame {
        x: pane.x + (pane.width - shown_width) / 2.0,
        y: pane.y,
        width: shown_width,
        height: shown_height,
        zoom,
    }
}

/// Adresse tapée sans schéma : `localhost:3000` devient `http://`, un nom de domaine `https://`.
pub fn normalize_url(input: &str) -> Result<String, AppError> {
    let input = input.trim();
    if input.is_empty() {
        return Err(AppError::InvalidInput("adresse vide".into()));
    }
    if input == "about:blank" {
        return Ok(input.to_owned());
    }
    let lower = input.to_ascii_lowercase();
    let url = if lower.starts_with("http://") || lower.starts_with("https://") {
        input.to_owned()
    } else if lower.contains("://")
        || lower.starts_with("javascript:")
        || lower.starts_with("data:")
    {
        return Err(AppError::InvalidInput(format!(
            "seules les adresses http et https s'ouvrent dans le navigateur : {input}"
        )));
    } else if is_local(&lower) {
        format!("http://{input}")
    } else {
        format!("https://{input}")
    };
    Ok(url)
}

fn is_local(address: &str) -> bool {
    let host = address.split(['/', '?', '#']).next().unwrap_or_default();
    let host = host.rsplit_once(':').map_or(host, |(host, port)| {
        if port.chars().all(|c| c.is_ascii_digit()) {
            host
        } else {
            address
        }
    });
    host == "localhost"
        || host.ends_with(".localhost")
        || host.ends_with(".test")
        || host == "[::1]"
        || host.split('.').count() == 4 && host.split('.').all(|part| part.parse::<u8>().is_ok())
}

/// Identifiant stable du stockage d'un projet : FNV-1a sur 2 × 64 bits. Ni `DefaultHasher` (son
/// algorithme peut changer d'une version de Rust à l'autre, et les cookies avec), ni dépendance de plus.
fn store_id(store: &str) -> [u8; 16] {
    fn fnv(seed: u64, bytes: &[u8]) -> u64 {
        bytes.iter().fold(seed, |hash, byte| {
            (hash ^ u64::from(*byte)).wrapping_mul(0x0100_0000_01b3)
        })
    }
    let bytes = store.as_bytes();
    let mut id = [0u8; 16];
    id[..8].copy_from_slice(&fnv(0xcbf2_9ce4_8422_2325, bytes).to_be_bytes());
    id[8..].copy_from_slice(&fnv(0x84222325_cbf29ce4, bytes).to_be_bytes());
    // Forme d'un UUID v4 : WebKit refuse l'identifiant nul.
    id[6] = (id[6] & 0x0f) | 0x40;
    id[8] = (id[8] & 0x3f) | 0x80;
    id
}

fn network_entry(id: String, message: &Value, time: u64) -> NetworkEntry {
    let text = |key: &str, limit: usize| message[key].as_str().map(|value| clip(value, limit));
    NetworkEntry {
        id,
        kind: text("kind", 16).unwrap_or_default(),
        method: text("method", 16).unwrap_or_else(|| "GET".into()),
        url: text("url", 4000).unwrap_or_default(),
        status: message["status"]
            .as_u64()
            .and_then(|status| u16::try_from(status).ok())
            .filter(|status| *status > 0),
        status_text: text("statusText", 200).unwrap_or_default(),
        mime: text("mime", 200).unwrap_or_default(),
        duration_ms: message["duration"].as_f64(),
        size: message["size"].as_u64(),
        error: text("error", 1000),
        request_headers: message
            .get("reqHeaders")
            .filter(|value| value.is_object())
            .cloned(),
        response_headers: message
            .get("resHeaders")
            .filter(|value| value.is_object())
            .cloned(),
        request_body: text("reqBody", BODY_LIMIT),
        response_body: text("resBody", BODY_LIMIT),
        time,
    }
}

fn same(a: &BrowserTab, b: &BrowserTab) -> bool {
    a.url == b.url
        && a.title == b.title
        && a.loading == b.loading
        && a.can_back == b.can_back
        && a.can_forward == b.can_forward
        && a.error == b.error
        && a.viewport == b.viewport
        && a.color_scheme == b.color_scheme
}

fn clip(text: &str, limit: usize) -> String {
    if text.len() <= limit {
        return text.to_owned();
    }
    let mut end = limit;
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}…", &text[..end])
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as u64)
        .unwrap_or_default()
}

/// Exécute `job` sur le thread principal, seul autorisé à toucher AppKit et WebKit.
#[cfg(target_os = "macos")]
async fn on_main<T: Send + 'static>(
    app: &AppHandle,
    job: impl FnOnce(objc2::MainThreadMarker) -> T + Send + 'static,
) -> Result<T, AppError> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.run_on_main_thread(move || {
        if let Some(mtm) = objc2::MainThreadMarker::new() {
            let _ = sender.send(job(mtm));
        }
    })
    .map_err(|error| AppError::Browser(error.to_string()))?;
    receiver
        .await
        .map_err(|_| AppError::Browser("thread principal indisponible".into()))
}

/// Hors macOS, pas encore de navigateur intégré : chaque appel échoue proprement.
#[cfg(not(target_os = "macos"))]
async fn on_main<T: Send + 'static>(
    _app: &AppHandle,
    _job: impl FnOnce(()) -> T + Send + 'static,
) -> Result<T, AppError> {
    Err(AppError::Browser(
        "le navigateur intégré n'existe pour l'instant que sur macOS".into(),
    ))
}

#[cfg(not(target_os = "macos"))]
mod native {
    //! Pas de webview native hors macOS : `on_main` échoue avant d'appeler ces fonctions.
    use super::*;
    pub fn create(_: &AppHandle, _: &str, _: [u8; 16], _: &str, _: ()) -> Result<(), String> {
        Err(String::new())
    }
    pub fn close(_: &str) {}
    pub fn load(_: &str, _: &str) {}
    pub fn history(_: &str, _: History) {}
    pub fn place(_: &str, _: Option<Frame>) {}
    pub fn user_agent(_: &str, _: Option<&str>) {}
    pub fn appearance(_: &str, _: Option<ColorScheme>) {}
    pub fn script(
        _: &str,
        _: &str,
        _: World,
        _: tokio::sync::oneshot::Sender<Result<String, String>>,
    ) {
    }
    pub fn snapshot(
        _: &str,
        _: Option<[f64; 4]>,
        _: f64,
        _: tokio::sync::oneshot::Sender<Result<Screenshot, String>>,
    ) {
    }
    pub fn mouse(_: &str, _: MouseAction, _: (f64, f64), _: Modifiers) -> Result<(), String> {
        Ok(())
    }
    pub fn key(_: &str, _: &str, _: Modifiers) -> Result<(), String> {
        Ok(())
    }
    pub fn clear_store(_: [u8; 16], _: tokio::sync::oneshot::Sender<Result<(), String>>, _: ()) {}
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn typed_addresses_get_their_scheme() {
        assert_eq!(
            normalize_url("localhost:3000").unwrap(),
            "http://localhost:3000"
        );
        assert_eq!(
            normalize_url("127.0.0.1:5173/a").unwrap(),
            "http://127.0.0.1:5173/a"
        );
        assert_eq!(normalize_url("app.test").unwrap(), "http://app.test");
        assert_eq!(normalize_url("example.com").unwrap(), "https://example.com");
        assert_eq!(normalize_url(" HTTPS://x.dev ").unwrap(), "HTTPS://x.dev");
        assert!(normalize_url("file:///etc/passwd").is_err());
        assert!(normalize_url("javascript:alert(1)").is_err());
        assert!(normalize_url("tauri://localhost").is_err());
    }

    #[test]
    fn a_project_keeps_the_same_store() {
        let a = store_id("/Users/me/site");
        assert_eq!(a, store_id("/Users/me/site"));
        assert_ne!(a, store_id("/Users/me/other"));
        assert_eq!(a[6] >> 4, 4);
    }

    #[test]
    fn an_emulated_screen_is_scaled_into_the_pane() {
        let pane = PaneRect {
            x: 100.0,
            y: 50.0,
            width: 400.0,
            height: 900.0,
        };
        let phone = frame_in(
            pane,
            Some(Viewport {
                width: 375,
                height: 812,
            }),
        );
        assert_eq!(phone.zoom, 1.0);
        assert_eq!(phone.x, 112.5);
        let desktop = frame_in(
            pane,
            Some(Viewport {
                width: 1600,
                height: 900,
            }),
        );
        assert_eq!(desktop.zoom, 0.25);
        assert_eq!(desktop.width, 400.0);
    }
}
