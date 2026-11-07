//! Serveur MCP `nuee` que Nuée tient pour chaque session de l'agent, sans port ni process de plus :
//! la CLI lui parle par le canal de contrôle de stream-json (serveur de type `sdk`, essayé sur la
//! CLI 2.1.319). Ses outils pilotent le volet Navigateur de la session, sur le modèle de ceux de l'app Claude.

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use base64::Engine;
use serde_json::{Value, json};
use tauri::{AppHandle, Manager};

use super::{
    BrowserService, BrowserTab, ColorScheme, History, Modifiers, MouseAction, MouseButton,
    Viewport, World,
};
use crate::error::AppError;
use crate::services::server::{self, ServerService, ServerStart, ServerStatus};

pub const SERVER: &str = "nuee";
const LOAD_TIMEOUT: Duration = Duration::from_secs(15);
const SERVER_TIMEOUT: Duration = Duration::from_secs(60);

/// Session de l'agent qui appelle : ses outils n'atteignent que les onglets de cette session.
pub struct Caller {
    pub chat_id: String,
    pub cwd: PathBuf,
}

/// Répond à un message JSON-RPC de la CLI ; `None` pour une notification.
pub async fn handle(app: &AppHandle, caller: &Caller, message: Value) -> Value {
    let id = message.get("id").cloned();
    let result = match message["method"].as_str().unwrap_or_default() {
        "initialize" => Ok(json!({
            "protocolVersion": message["params"]["protocolVersion"].as_str().unwrap_or("2025-06-18"),
            "capabilities": { "tools": {} },
            "serverInfo": { "name": SERVER, "version": env!("CARGO_PKG_VERSION") },
            "instructions": instructions(&caller.cwd),
        })),
        "tools/list" => Ok(json!({ "tools": tool_list() })),
        "tools/call" => {
            let name = message["params"]["name"].as_str().unwrap_or_default();
            let args = message["params"]["arguments"].clone();
            Ok(call(app, caller, name, &args).await)
        }
        "ping" | "notifications/initialized" | "notifications/cancelled" => Ok(json!({})),
        method => Err(json!({ "code": -32601, "message": format!("méthode inconnue : {method}") })),
    };
    match (id, result) {
        (Some(id), Ok(result)) => json!({ "jsonrpc": "2.0", "id": id, "result": result }),
        (Some(id), Err(error)) => json!({ "jsonrpc": "2.0", "id": id, "error": error }),
        (None, _) => json!({ "jsonrpc": "2.0", "result": {} }),
    }
}

async fn call(app: &AppHandle, caller: &Caller, name: &str, args: &Value) -> Value {
    match run(app, caller, name, args).await {
        Ok(content) => json!({ "content": content }),
        Err(error) => json!({ "content": [text(error.to_string())], "isError": true }),
    }
}

fn text(value: impl Into<String>) -> Value {
    json!({ "type": "text", "text": value.into() })
}

fn image(jpeg: &[u8]) -> Value {
    json!({
        "type": "image",
        "data": base64::engine::general_purpose::STANDARD.encode(jpeg),
        "mimeType": "image/jpeg",
    })
}

fn fail(message: impl Into<String>) -> AppError {
    AppError::Browser(message.into())
}

async fn run(
    app: &AppHandle,
    caller: &Caller,
    name: &str,
    args: &Value,
) -> Result<Vec<Value>, AppError> {
    let browser = app.state::<BrowserService>();
    if name == "browser_batch" {
        return batch(app, caller, args).await;
    }
    match name {
        "preview_start" => return preview_start(app, caller, args).await,
        "preview_list" => return Ok(vec![text(preview_list(app, caller))]),
        "preview_stop" => {
            let name = str_arg(args, "name").ok_or_else(|| fail("`name` manquant"))?;
            app.state::<ServerService>().stop(&root(caller), name);
            return Ok(vec![text(format!("Serveur {name} arrêté."))]);
        }
        "preview_logs" => return preview_logs(app, caller, args).map(|logs| vec![text(logs)]),
        "tabs_context" => return Ok(vec![text(tabs_context(&browser, caller))]),
        "tabs_create" => {
            let url = str_arg(args, "url").unwrap_or("about:blank");
            let tab = browser.open(app, &caller.chat_id, url).await?;
            if args["foreground"] != false {
                browser.reveal(&caller.chat_id, &tab.id);
            }
            let tab = settle(&browser, &tab.id).await;
            return Ok(vec![text(format!(
                "Onglet {} ouvert : {}",
                tab.id,
                describe(&tab)
            ))]);
        }
        "navigate" => return navigate(app, caller, args).await,
        _ => {}
    }

    let tab = tab_of(&browser, caller, args)?;
    let summary = str_arg(args, "action_summary").map(str::to_owned);
    browser.agent_action(&tab, Some(summary.unwrap_or_else(|| label_of(name, args))));
    let result = act(app, &browser, caller, &tab, name, args).await;
    browser.agent_action(&tab, None);
    result
}

async fn act(
    app: &AppHandle,
    browser: &BrowserService,
    caller: &Caller,
    tab: &str,
    name: &str,
    args: &Value,
) -> Result<Vec<Value>, AppError> {
    let helper = |function: &'static str, args: Value| browser.helper(app, tab, function, args);
    match name {
        "tabs_select" => {
            browser.reveal(&caller.chat_id, tab);
            Ok(vec![text(format!("Onglet {tab} au premier plan."))])
        }
        "tabs_close" => {
            browser.close(app, tab).await?;
            Ok(vec![text(format!("Onglet {tab} fermé."))])
        }
        "read_page" => {
            let page = helper(
                "read_page",
                pick(args, &["filter", "depth", "ref_id", "max_chars"]),
            )
            .await?;
            Ok(vec![text(page.as_str().unwrap_or_default())])
        }
        "find" => {
            let found = helper("find", pick(args, &["query"])).await?;
            Ok(vec![text(found.as_str().unwrap_or_default())])
        }
        "form_input" => {
            let done = helper("form_input", pick(args, &["ref", "value"])).await?;
            Ok(vec![text(done.as_str().unwrap_or_default())])
        }
        "get_page_text" => {
            let page = helper("get_page_text", pick(args, &["max_chars"])).await?;
            Ok(vec![text(page.as_str().unwrap_or_default())])
        }
        "inspect" => {
            let measures =
                helper("inspect", pick(args, &["ref", "selector", "properties"])).await?;
            Ok(vec![text(
                serde_json::to_string_pretty(&measures).unwrap_or_default(),
            )])
        }
        "javascript_tool" => {
            let code = str_arg(args, "text").ok_or_else(|| fail("`text` manquant"))?;
            let value = evaluate(app, browser, tab, code).await?;
            Ok(vec![text(
                serde_json::to_string_pretty(&value).unwrap_or_else(|_| "null".into()),
            )])
        }
        "read_console_messages" => Ok(vec![text(console(browser, tab, args))]),
        "read_network_requests" => Ok(vec![text(network(browser, tab, args))]),
        "resize_window" => resize(app, browser, tab, args).await,
        "computer" => computer(app, browser, tab, args).await,
        _ => Err(fail(format!("outil inconnu : {name}"))),
    }
}

// ===== Serveurs du projet =====

fn root(caller: &Caller) -> String {
    caller.cwd.to_string_lossy().into_owned()
}

fn preview_list(app: &AppHandle, caller: &Caller) -> String {
    let list = app.state::<ServerService>().list(&caller.cwd);
    if list.missing {
        return "Pas de .claude/launch.json dans ce dossier : en écrire un (configurations avec name, runtimeExecutable, runtimeArgs, port) pour lancer le serveur de dev.".into();
    }
    if let Some(problem) = list.problem {
        return format!(".claude/launch.json illisible : {problem}");
    }
    let lines: Vec<String> = list
        .servers
        .iter()
        .map(|server| {
            format!(
                "- {} : {:?}, port {}{}",
                server.name,
                server.status,
                server.active_port.unwrap_or(server.port),
                server
                    .url
                    .as_deref()
                    .map(|url| format!(", {url}"))
                    .unwrap_or_default()
            )
        })
        .collect();
    if lines.is_empty() {
        "Aucun serveur dans .claude/launch.json.".into()
    } else {
        lines.join("\n")
    }
}

async fn preview_start(
    app: &AppHandle,
    caller: &Caller,
    args: &Value,
) -> Result<Vec<Value>, AppError> {
    let browser = app.state::<BrowserService>();
    let url = match (str_arg(args, "name"), str_arg(args, "url")) {
        (Some(name), _) => start_server(app, caller, name).await?,
        (None, Some(url)) => url.to_owned(),
        (None, None) => {
            return Err(fail(
                "donner `name` (serveur de .claude/launch.json) ou `url`",
            ));
        }
    };
    let url = super::normalize_url(&url)?;
    // Un onglet de la session déjà sur ce serveur est réutilisé plutôt que d'en ouvrir un de plus.
    let origin = origin_of(&url);
    let existing = browser
        .tabs_of(&caller.chat_id)
        .into_iter()
        .find(|tab| origin_of(&tab.url) == origin);
    let tab = match existing {
        Some(tab) => {
            browser.navigate(app, &tab.id, &url).await?;
            tab
        }
        None => browser.open(app, &caller.chat_id, &url).await?,
    };
    browser.reveal(&caller.chat_id, &tab.id);
    let tab = settle(&browser, &tab.id).await;
    let mut lines = vec![
        format!("tabId: {}", tab.id),
        format!("Page : {}", describe(&tab)),
    ];
    if let Some(name) = str_arg(args, "name") {
        lines.insert(0, format!("serverId: {name}"));
    }
    Ok(vec![text(lines.join("\n"))])
}

/// Lance le serveur s'il ne tourne pas, attend que son port réponde et rend son adresse.
async fn start_server(app: &AppHandle, caller: &Caller, name: &str) -> Result<String, AppError> {
    let servers = app.state::<ServerService>();
    let info = servers
        .list(&caller.cwd)
        .servers
        .into_iter()
        .find(|server| server.name == name)
        .ok_or_else(|| {
            fail(format!(
                "pas de serveur {name} dans .claude/launch.json (voir preview_list)"
            ))
        })?;
    if info.external {
        return info
            .url
            .ok_or_else(|| fail(format!("{name} n'a pas d'url")));
    }
    let info = if matches!(info.status, ServerStatus::Running | ServerStatus::Starting) {
        info
    } else {
        match servers.start(&caller.cwd, name)? {
            ServerStart::Started { server } => server,
            ServerStart::PortTaken { port } => {
                return Err(fail(format!(
                    "le port {port} est déjà pris par un autre programme ; mettre \"autoPort\": true ou libérer le port"
                )));
            }
            ServerStart::CommandNotFound { command } => {
                return Err(fail(format!("commande introuvable : {command}")));
            }
        }
    };
    let port = info.active_port.unwrap_or(info.port);
    let deadline = Instant::now() + SERVER_TIMEOUT;
    loop {
        if tokio::net::TcpStream::connect(("127.0.0.1", port))
            .await
            .is_ok()
            || tokio::net::TcpStream::connect(("::1", port)).await.is_ok()
        {
            break;
        }
        let exited = servers
            .list(&caller.cwd)
            .servers
            .iter()
            .any(|server| server.name == name && server.status == ServerStatus::Exited);
        if exited {
            let logs = servers.logs(&root(caller), name).unwrap_or_default();
            return Err(fail(format!(
                "{name} s'est arrêté au démarrage. Fin des logs :\n{}",
                tail(&strip_ansi(&logs), 30)
            )));
        }
        if Instant::now() > deadline {
            return Err(fail(format!(
                "{name} ne répond toujours pas sur le port {port} après 60 s (voir preview_logs)"
            )));
        }
        tokio::time::sleep(Duration::from_millis(300)).await;
    }
    Ok(info
        .url
        .unwrap_or_else(|| format!("http://localhost:{port}")))
}

fn preview_logs(app: &AppHandle, caller: &Caller, args: &Value) -> Result<String, AppError> {
    let name = str_arg(args, "name")
        .or_else(|| str_arg(args, "serverId"))
        .ok_or_else(|| fail("`name` manquant"))?;
    let logs = app
        .state::<ServerService>()
        .logs(&root(caller), name)
        .ok_or_else(|| fail(format!("{name} n'a pas été lancé depuis Nuée")))?;
    let errors = args["level"] == "error";
    let search = str_arg(args, "search").map(str::to_lowercase);
    let cleaned = strip_ansi(&logs);
    let kept: Vec<&str> = cleaned
        .lines()
        .filter(|line| !errors || is_error_line(line))
        .filter(|line| {
            search
                .as_ref()
                .is_none_or(|search| line.to_lowercase().contains(search))
        })
        .collect();
    let count = args["lines"].as_u64().unwrap_or(50) as usize;
    let start = kept.len().saturating_sub(count);
    let out = kept[start..].join("\n");
    Ok(if out.is_empty() {
        "(aucune ligne)".into()
    } else {
        out
    })
}

fn is_error_line(line: &str) -> bool {
    let lower = line.to_lowercase();
    ["error", "exception", "failed", "fatal"]
        .iter()
        .any(|word| lower.contains(word))
}

// ===== Onglets =====

fn tab_of(browser: &BrowserService, caller: &Caller, args: &Value) -> Result<String, AppError> {
    let wanted = str_arg(args, "tabId").map(str::to_owned);
    let tab = match wanted {
        Some(id) => browser
            .tab(&id)
            .filter(|tab| tab.chat_id == caller.chat_id)
            .map(|tab| tab.id)
            .ok_or_else(|| {
                fail(format!(
                    "pas d'onglet {id} dans cette session (voir tabs_context)"
                ))
            })?,
        None => browser
            .active_of(&caller.chat_id)
            .or_else(|| {
                browser
                    .tabs_of(&caller.chat_id)
                    .last()
                    .map(|tab| tab.id.clone())
            })
            .ok_or_else(|| {
                fail("aucun onglet ouvert : appeler navigate ou preview_start d'abord")
            })?,
    };
    Ok(tab)
}

fn tabs_context(browser: &BrowserService, caller: &Caller) -> String {
    let tabs = browser.tabs_of(&caller.chat_id);
    let active = browser.active_of(&caller.chat_id);
    let rows: Vec<Value> = tabs
        .iter()
        .map(|tab| {
            json!({
                "tabId": tab.id,
                "url": tab.url,
                "title": tab.title,
                "isActive": Some(&tab.id) == active.as_ref(),
            })
        })
        .collect();
    json!({ "browserOpen": !tabs.is_empty(), "tabs": rows }).to_string()
}

async fn navigate(app: &AppHandle, caller: &Caller, args: &Value) -> Result<Vec<Value>, AppError> {
    let browser = app.state::<BrowserService>();
    let url = str_arg(args, "url").ok_or_else(|| fail("`url` manquant"))?;
    let tab = match tab_of(&browser, caller, args) {
        Ok(tab) => tab,
        Err(_) if !matches!(url, "back" | "forward" | "reload") => {
            let tab = browser.open(app, &caller.chat_id, url).await?;
            browser.reveal(&caller.chat_id, &tab.id);
            let tab = settle(&browser, &tab.id).await;
            return Ok(vec![text(format!(
                "Onglet {} ouvert : {}",
                tab.id,
                describe(&tab)
            ))]);
        }
        Err(error) => return Err(error),
    };
    browser.agent_action(&tab, Some(format!("Ouvre {url}")));
    match url {
        "back" => browser.history(app, &tab, History::Back).await?,
        "forward" => browser.history(app, &tab, History::Forward).await?,
        "reload" => browser.history(app, &tab, History::Reload).await?,
        url => browser.navigate(app, &tab, url).await?,
    }
    // Laisser WebKit commencer le chargement avant d'attendre sa fin.
    tokio::time::sleep(Duration::from_millis(150)).await;
    let info = settle(&browser, &tab).await;
    browser.agent_action(&tab, None);
    Ok(vec![text(describe(&info))])
}

/// Attend la fin du chargement, au plus `LOAD_TIMEOUT`.
async fn settle(browser: &BrowserService, id: &str) -> BrowserTab {
    let deadline = Instant::now() + LOAD_TIMEOUT;
    loop {
        let Some(tab) = browser.tab(id) else {
            return BrowserTab {
                id: id.to_owned(),
                chat_id: String::new(),
                url: String::new(),
                title: String::new(),
                loading: false,
                can_back: false,
                can_forward: false,
                error: Some("onglet fermé".into()),
                viewport: None,
                color_scheme: None,
            };
        };
        if !tab.loading || Instant::now() > deadline {
            return tab;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
}

fn describe(tab: &BrowserTab) -> String {
    let mut text = format!(
        "{} — {}",
        if tab.title.is_empty() {
            "(sans titre)"
        } else {
            &tab.title
        },
        tab.url
    );
    if let Some(error) = &tab.error {
        text.push_str(&format!("\nÉchec du chargement : {error}"));
    } else if tab.loading {
        text.push_str("\n(encore en chargement)");
    }
    text
}

// ===== Page =====

/// `javascript_tool` : la valeur de la dernière expression, `await` permis au premier niveau.
async fn evaluate(
    app: &AppHandle,
    browser: &BrowserService,
    tab: &str,
    code: &str,
) -> Result<Value, AppError> {
    let wrap = |body: &str| {
        format!(
            "const __value = await (async () => {{\n{body}\n}})();\nreturn JSON.stringify(__value === undefined ? null : __value, (k, v) => typeof v === 'bigint' ? String(v) : v instanceof Element ? `<${{v.tagName.toLowerCase()}}>` : v)"
        )
    };
    let attempts = [
        format!("return (\n{code}\n)"),
        with_last_return(code),
        code.to_owned(),
    ];
    let mut last = None;
    for attempt in attempts {
        match browser.script(app, tab, wrap(&attempt), World::Page).await {
            Err(AppError::Browser(message)) if message.contains("SyntaxError") => {
                last = Some(message)
            }
            result => return result,
        }
    }
    Err(fail(last.unwrap_or_else(|| "script invalide".into())))
}

/// Ajoute `return` devant la dernière instruction quand c'est une expression.
fn with_last_return(code: &str) -> String {
    let trimmed = code.trim_end().trim_end_matches(';');
    let (head, last) = match trimmed.rfind(['\n', ';']) {
        Some(index) => trimmed.split_at(index + 1),
        None => ("", trimmed),
    };
    let statement = last.trim_start();
    let keywords = [
        "return", "const ", "let ", "var ", "if", "for", "while", "function", "class", "}",
        "throw", "try", "import", "export",
    ];
    if statement.is_empty() || keywords.iter().any(|word| statement.starts_with(word)) {
        return code.to_owned();
    }
    format!("{head}\nreturn ({statement})")
}

fn console(browser: &BrowserService, tab: &str, args: &Value) -> String {
    let only_errors = args["onlyErrors"] == true;
    let pattern = str_arg(args, "pattern").map(str::to_lowercase);
    let limit = args["limit"].as_u64().unwrap_or(50) as usize;
    let entries = browser.console(tab, args["clear"] == true);
    let kept: Vec<String> = entries
        .iter()
        .filter(|entry| !only_errors || entry.level == "error")
        .filter(|entry| {
            pattern
                .as_ref()
                .is_none_or(|pattern| entry.text.to_lowercase().contains(pattern))
        })
        .map(|entry| format!("[{}] {}", entry.level, entry.text))
        .collect();
    if kept.is_empty() {
        return if only_errors {
            "Aucune erreur dans la console.".into()
        } else {
            "Console vide.".into()
        };
    }
    let start = kept.len().saturating_sub(limit);
    let mut out = String::new();
    if start > 0 {
        out.push_str(&format!("({start} messages plus anciens non affichés)\n"));
    }
    out.push_str(&kept[start..].join("\n"));
    out
}

fn network(browser: &BrowserService, tab: &str, args: &Value) -> String {
    let entries = browser.network(tab, args["clear"] == true);
    if let Some(id) = str_arg(args, "requestId") {
        let Some(entry) = entries.iter().find(|entry| entry.id == id) else {
            return format!("Pas de requête {id} (déjà sortie de l'historique ?).");
        };
        return serde_json::to_string_pretty(entry).unwrap_or_default();
    }
    let pattern = str_arg(args, "urlPattern").map(str::to_lowercase);
    let failed = args["onlyFailed"] == true;
    let limit = args["limit"].as_u64().unwrap_or(50) as usize;
    let kept: Vec<String> = entries
        .iter()
        .filter(|entry| {
            pattern
                .as_ref()
                .is_none_or(|pattern| entry.url.to_lowercase().contains(pattern))
        })
        .filter(|entry| {
            !failed || entry.error.is_some() || entry.status.is_some_and(|status| status >= 400)
        })
        .map(|entry| {
            let status = match (&entry.error, entry.status) {
                (Some(error), _) => format!("ÉCHEC ({error})"),
                (None, Some(status)) => status.to_string(),
                (None, None) => "-".into(),
            };
            let duration = entry
                .duration_ms
                .map(|ms| format!(" {ms:.0} ms"))
                .unwrap_or_default();
            format!(
                "{} {} {} {} [{}]{}",
                entry.id, entry.method, status, entry.url, entry.kind, duration
            )
        })
        .collect();
    if kept.is_empty() {
        return "Aucune requête relevée.".into();
    }
    let start = kept.len().saturating_sub(limit);
    format!(
        "{}{}\n\nDétail et corps d'une requête : read_network_requests avec requestId.",
        if start > 0 {
            format!("({start} requêtes plus anciennes non affichées)\n")
        } else {
            String::new()
        },
        kept[start..].join("\n")
    )
}

async fn resize(
    app: &AppHandle,
    browser: &BrowserService,
    tab: &str,
    args: &Value,
) -> Result<Vec<Value>, AppError> {
    let preset = str_arg(args, "preset");
    let viewport = match (preset, args["width"].as_u64(), args["height"].as_u64()) {
        (Some("mobile"), ..) => Some(Viewport {
            width: 375,
            height: 812,
        }),
        (Some("tablet"), ..) => Some(Viewport {
            width: 768,
            height: 1024,
        }),
        (Some("desktop"), ..) => None,
        (None, Some(width), Some(height)) => Some(Viewport {
            width: width.clamp(200, 4000) as u32,
            height: height.clamp(200, 4000) as u32,
        }),
        (None, None, None) => browser.tab(tab).and_then(|tab| tab.viewport),
        _ => {
            return Err(fail(
                "donner `preset` (mobile, tablet, desktop) ou `width` et `height`",
            ));
        }
    };
    // Un écran étroit se présente comme un iPhone : les sites qui lisent le user-agent servent leur version mobile.
    let mobile = viewport.is_some_and(|viewport| viewport.width < 500);
    let scheme = match str_arg(args, "colorScheme") {
        Some("dark") => Some(Some(ColorScheme::Dark)),
        Some("light") => Some(Some(ColorScheme::Light)),
        Some(_) => Some(None),
        None => None,
    };
    browser.emulate(app, tab, viewport, scheme, mobile).await?;
    let size = browser.helper(app, tab, "viewport", json!({})).await?;
    Ok(vec![text(format!(
        "Viewport {}x{}{}",
        size["width"],
        size["height"],
        match scheme {
            Some(Some(ColorScheme::Dark)) => ", mode sombre",
            Some(Some(ColorScheme::Light)) => ", mode clair",
            _ => "",
        }
    ))])
}

// ===== Souris et clavier =====

async fn computer(
    app: &AppHandle,
    browser: &BrowserService,
    tab: &str,
    args: &Value,
) -> Result<Vec<Value>, AppError> {
    let action = str_arg(args, "action").ok_or_else(|| fail("`action` manquant"))?;
    let modifiers = modifiers_of(str_arg(args, "modifiers").unwrap_or_default());
    match action {
        "screenshot" => {
            let scale = args["scale"].as_f64().unwrap_or(1.0).clamp(0.1, 1.0);
            let shot = browser.screenshot(app, tab, None, scale).await?;
            Ok(vec![
                image(&shot.jpeg),
                text(format!(
                    "Capture {}x{} : un pixel = {} px CSS, coordonnées à partir du haut gauche de la page visible.",
                    shot.width,
                    shot.height,
                    1.0 / scale
                )),
            ])
        }
        "zoom" => {
            let region = args["region"]
                .as_array()
                .filter(|region| region.len() == 4)
                .ok_or_else(|| fail("`region` : [x0, y0, x1, y1]"))?;
            let values: Vec<f64> = region.iter().filter_map(Value::as_f64).collect();
            let [x0, y0, x1, y1] = values[..] else {
                return Err(fail("`region` : quatre nombres"));
            };
            let shot = browser
                .screenshot(
                    app,
                    tab,
                    Some([x0, y0, (x1 - x0).max(1.0), (y1 - y0).max(1.0)]),
                    2.0,
                )
                .await?;
            Ok(vec![
                image(&shot.jpeg),
                text(format!(
                    "Zone agrandie {}x{} (×2).",
                    shot.width, shot.height
                )),
            ])
        }
        "wait" => {
            let seconds = args["duration"].as_f64().unwrap_or(1.0).clamp(0.0, 10.0);
            tokio::time::sleep(Duration::from_secs_f64(seconds)).await;
            Ok(vec![text(format!("Attendu {seconds} s."))])
        }
        "type" => {
            let typed = str_arg(args, "text").ok_or_else(|| fail("`text` manquant"))?;
            let field = browser
                .helper(app, tab, "type", json!({ "text": typed }))
                .await?;
            Ok(vec![text(format!(
                "Tapé dans {} : {typed:?}",
                field.as_str().unwrap_or("le champ")
            ))])
        }
        "key" => {
            let keys = str_arg(args, "text")
                .ok_or_else(|| fail("`text` manquant (ex. \"Enter\", \"cmd+a\")"))?;
            let repeat = args["repeat"].as_u64().unwrap_or(1).clamp(1, 100);
            for _ in 0..repeat {
                for combo in keys.split_whitespace() {
                    let (key, combo_modifiers) = parse_combo(combo);
                    browser
                        .key(app, tab, key, merge(modifiers, combo_modifiers))
                        .await?;
                }
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
            Ok(vec![text(format!(
                "Touches {keys} envoyées{}.",
                if repeat > 1 {
                    format!(" ×{repeat}")
                } else {
                    String::new()
                }
            ))])
        }
        "scroll" => {
            let point = point_of(args, "coordinate");
            let done = browser
                .helper(
                    app,
                    tab,
                    "scroll",
                    json!({
                        "x": point.map(|p| p.0), "y": point.map(|p| p.1),
                        "direction": str_arg(args, "scroll_direction").unwrap_or("down"),
                        "amount": args["scroll_amount"].as_u64().unwrap_or(3),
                    }),
                )
                .await?;
            Ok(vec![text(done.as_str().unwrap_or_default())])
        }
        "scroll_to" => {
            let reference = str_arg(args, "ref").ok_or_else(|| fail("`ref` manquant"))?;
            let done = browser
                .helper(app, tab, "scroll_to", json!({ "ref": reference }))
                .await?;
            Ok(vec![text(done.as_str().unwrap_or_default())])
        }
        "left_click" | "right_click" | "double_click" | "triple_click" | "hover"
        | "left_click_drag" => {
            let (point, label, kind) = resolve(app, browser, tab, args).await?;
            let _ = browser
                .helper(
                    app,
                    tab,
                    "cursor",
                    json!({ "x": point.0, "y": point.1, "click": action != "hover" }),
                )
                .await;
            // Un <select> ou un sélecteur de fichier ouvrirait un menu natif modal qui bloque Nuée.
            if action != "hover"
                && let Some(kind) =
                    kind.filter(|kind| kind == "select" || kind.starts_with("input-"))
            {
                return Err(fail(format!(
                    "{label} ouvre un sélecteur natif ({kind}) : utiliser form_input avec sa ref pour choisir la valeur"
                )));
            }
            let mouse = match action {
                "hover" => MouseAction::Move,
                "right_click" => MouseAction::Click {
                    button: MouseButton::Right,
                    count: 1,
                },
                "double_click" => MouseAction::Click {
                    button: MouseButton::Left,
                    count: 2,
                },
                "triple_click" => MouseAction::Click {
                    button: MouseButton::Left,
                    count: 3,
                },
                "left_click_drag" => {
                    let from = point_of(args, "start_coordinate")
                        .ok_or_else(|| fail("`start_coordinate` manquant"))?;
                    MouseAction::Drag { from }
                }
                _ => MouseAction::Click {
                    button: MouseButton::Left,
                    count: 1,
                },
            };
            let before = browser.tab(tab).map(|tab| tab.url);
            browser.mouse(app, tab, mouse, point, modifiers).await?;
            tokio::time::sleep(Duration::from_millis(200)).await;
            let after = browser.tab(tab);
            let mut out = format!(
                "{} {} en ({:.0}, {:.0}).",
                verb(action),
                label,
                point.0,
                point.1
            );
            if let Some(after) = after.filter(|after| Some(&after.url) != before.as_ref()) {
                let after = settle(browser, &after.id).await;
                out.push_str(&format!("\nNouvelle page : {}", describe(&after)));
            }
            Ok(vec![text(out)])
        }
        other => Err(fail(format!("action inconnue : {other}"))),
    }
}

fn verb(action: &str) -> &'static str {
    match action {
        "hover" => "Survol de",
        "right_click" => "Clic droit sur",
        "double_click" => "Double-clic sur",
        "triple_click" => "Triple clic sur",
        "left_click_drag" => "Glissé jusqu'à",
        _ => "Clic sur",
    }
}

/// Point visé : `ref` (centre de l'élément, amené à l'écran) ou `coordinate` (px CSS de la capture).
async fn resolve(
    app: &AppHandle,
    browser: &BrowserService,
    tab: &str,
    args: &Value,
) -> Result<((f64, f64), String, Option<String>), AppError> {
    if let Some(reference) = str_arg(args, "ref") {
        let found = browser
            .helper(app, tab, "target", json!({ "ref": reference }))
            .await?;
        let point = (
            found["x"].as_f64().unwrap_or_default(),
            found["y"].as_f64().unwrap_or_default(),
        );
        return Ok((
            point,
            found["label"].as_str().unwrap_or(reference).to_owned(),
            found["kind"].as_str().map(str::to_owned),
        ));
    }
    let point = point_of(args, "coordinate").ok_or_else(|| fail("donner `ref` ou `coordinate`"))?;
    let found = browser
        .helper(app, tab, "at", json!({ "x": point.0, "y": point.1 }))
        .await?;
    Ok((
        point,
        found["label"].as_str().unwrap_or("la page").to_owned(),
        found["kind"].as_str().map(str::to_owned),
    ))
}

fn point_of(args: &Value, key: &str) -> Option<(f64, f64)> {
    let pair = args[key].as_array()?;
    Some((pair.first()?.as_f64()?, pair.get(1)?.as_f64()?))
}

fn modifiers_of(text: &str) -> Modifiers {
    let mut modifiers = Modifiers::default();
    for part in text.split('+').map(|part| part.trim().to_ascii_lowercase()) {
        match part.as_str() {
            "cmd" | "meta" | "command" | "super" => modifiers.meta = true,
            "ctrl" | "control" => modifiers.ctrl = true,
            "alt" | "option" | "opt" => modifiers.alt = true,
            "shift" => modifiers.shift = true,
            _ => {}
        }
    }
    modifiers
}

/// « cmd+shift+z » : la touche et ses modificateurs.
fn parse_combo(combo: &str) -> (String, Modifiers) {
    let parts: Vec<&str> = combo.split('+').collect();
    let (key, rest) = parts
        .split_last()
        .map_or((combo, &[][..]), |(key, rest)| (*key, rest));
    (key.to_owned(), modifiers_of(&rest.join("+")))
}

fn merge(a: Modifiers, b: Modifiers) -> Modifiers {
    Modifiers {
        meta: a.meta || b.meta,
        ctrl: a.ctrl || b.ctrl,
        alt: a.alt || b.alt,
        shift: a.shift || b.shift,
    }
}

fn label_of(name: &str, args: &Value) -> String {
    match name {
        "computer" => str_arg(args, "action")
            .unwrap_or("action")
            .replace('_', " "),
        other => other.replace('_', " "),
    }
}

// ===== Lot =====

async fn batch(app: &AppHandle, caller: &Caller, args: &Value) -> Result<Vec<Value>, AppError> {
    let actions = args["actions"]
        .as_array()
        .ok_or_else(|| fail("`actions` : liste de {name, input}"))?;
    let mut content = Vec::new();
    for (index, action) in actions.iter().enumerate() {
        let name = action["name"].as_str().unwrap_or_default();
        if name == "browser_batch" {
            return Err(fail("browser_batch ne s'imbrique pas"));
        }
        match Box::pin(run(app, caller, name, &action["input"])).await {
            Ok(mut result) => {
                content.push(text(format!("[{}] {name}", index + 1)));
                content.append(&mut result);
            }
            Err(error) => {
                content.push(text(format!(
                    "[{}] {name} : ÉCHEC, lot arrêté. {error}",
                    index + 1
                )));
                return Ok(content);
            }
        }
    }
    Ok(content)
}

// ===== Utilitaires =====

fn str_arg<'a>(args: &'a Value, key: &str) -> Option<&'a str> {
    args.get(key)
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
}

fn pick(args: &Value, keys: &[&str]) -> Value {
    let mut out = serde_json::Map::new();
    for key in keys {
        if let Some(value) = args.get(*key).filter(|value| !value.is_null()) {
            out.insert((*key).to_owned(), value.clone());
        }
    }
    Value::Object(out)
}

fn origin_of(url: &str) -> String {
    let rest = url.split_once("://").map_or(url, |(_, rest)| rest);
    let host = rest.split(['/', '?', '#']).next().unwrap_or_default();
    host.replace("127.0.0.1", "localhost").to_ascii_lowercase()
}

fn tail(text: &str, lines: usize) -> String {
    let all: Vec<&str> = text.lines().collect();
    all[all.len().saturating_sub(lines)..].join("\n")
}

fn strip_ansi(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\u{1b}' {
            if chars.peek() == Some(&'[') {
                chars.next();
                for next in chars.by_ref() {
                    if next.is_ascii_alphabetic() {
                        break;
                    }
                }
            }
            continue;
        }
        if c != '\r' {
            out.push(c);
        }
    }
    out
}

// ===== Description pour l'agent =====

fn instructions(cwd: &Path) -> String {
    let mut text = String::from(BROWSER_INSTRUCTIONS);
    if server::auto_verify(cwd) {
        text.push_str(VERIFY_INSTRUCTIONS);
    }
    text
}

const BROWSER_INSTRUCTIONS: &str = "Nuée, the app running this session, has a built-in browser pane that the user sees beside the chat. \
Its tools (mcp__nuee__*) drive real web pages: open the project's dev server, click, type, read the page, take screenshots, \
read the console and network requests, measure elements, change the viewport size and color scheme. The user watches what you do \
and can take over at any time. Use these tools, never Bash, to run the dev servers of .claude/launch.json (preview_start) and to \
check web pages. Prefer read_page/find refs over coordinates; coordinates are CSS pixels of the last screenshot.";

const VERIFY_INSTRUCTIONS: &str = "\n\nWhen to verify: after editing code whose result the browser can show (something the dev server renders, serves \
or logs), verify it yourself and share proof; never ask the user to check manually. Skip it for changes the preview can't exercise \
(tests, types, tooling, another runtime). Workflow: 1. preview_start with the server name (reuses the running one). \
2. navigate \"reload\" if there is no hot reload. 3. read_console_messages (onlyErrors) and read_network_requests, preview_logs for the server. \
4. read_page for content and structure. 5. inspect for computed CSS and sizes. 6. computer clicks/type or form_input, then read_page. \
7. resize_window for responsive or dark mode, back to \"desktop\" after. 8. Proof: computer screenshot for visual changes, network or logs otherwise.";

fn tool_list() -> Vec<Value> {
    let tab = json!({ "type": "string", "description": "Tab to act on. Omit for the tab shown in the pane." });
    let tools = vec![
        tool(
            "preview_start",
            "Start a dev server from .claude/launch.json by `name` (or open a `url`) and show its page in the browser pane. Reuses a running server and its tab. Returns tabId and serverId.",
            json!({ "name": { "type": "string", "description": "Server name from .claude/launch.json." }, "url": { "type": "string", "description": "URL to open instead of a server." } }),
            &[],
        ),
        tool(
            "preview_list",
            "List the dev servers of .claude/launch.json with their status and port.",
            json!({}),
            &[],
        ),
        tool(
            "preview_stop",
            "Stop a dev server started with preview_start.",
            json!({ "name": { "type": "string" } }),
            &["name"],
        ),
        tool(
            "preview_logs",
            "Read the output of a dev server (stdout and stderr).",
            json!({ "name": { "type": "string" }, "level": { "type": "string", "enum": ["all", "error"] }, "search": { "type": "string" }, "lines": { "type": "number", "description": "Max lines (default 50)." } }),
            &["name"],
        ),
        tool(
            "navigate",
            "Open a URL in the browser pane (opens a tab if none), or \"back\", \"forward\", \"reload\". Waits for the page to load.",
            json!({ "url": { "type": "string" }, "tabId": tab }),
            &["url"],
        ),
        tool(
            "computer",
            "Mouse and keyboard on the page, as real macOS events. Click by `ref` (from read_page/find) or `coordinate` (CSS px of the last screenshot). Actions: left_click, right_click, double_click, triple_click, hover, left_click_drag (start_coordinate → coordinate), type (text into the focused field), key (\"Enter\", \"cmd+a\", space-separated sequence), scroll (scroll_direction, scroll_amount), scroll_to (ref), screenshot, zoom (region), wait (duration, max 10 s).",
            json!({
                "action": { "type": "string", "enum": ["left_click", "right_click", "double_click", "triple_click", "hover", "left_click_drag", "type", "key", "scroll", "scroll_to", "screenshot", "zoom", "wait"] },
                "coordinate": { "type": "array", "items": { "type": "number" }, "description": "[x, y]" },
                "start_coordinate": { "type": "array", "items": { "type": "number" } },
                "ref": { "type": "string" },
                "text": { "type": "string" },
                "modifiers": { "type": "string", "description": "e.g. \"cmd\", \"shift+alt\"" },
                "scroll_direction": { "type": "string", "enum": ["up", "down", "left", "right"] },
                "scroll_amount": { "type": "number" },
                "region": { "type": "array", "items": { "type": "number" }, "description": "[x0, y0, x1, y1]" },
                "duration": { "type": "number" },
                "repeat": { "type": "number" },
                "scale": { "type": "number", "description": "Screenshot scale in [0.1, 1]." },
                "action_summary": { "type": "string", "description": "A few words shown to the user, e.g. 'Opens the Settings menu'." },
                "tabId": tab,
            }),
            &["action"],
        ),
        tool(
            "read_page",
            "Accessibility tree of the page as YAML-like lines with refs (ref_N) for computer, form_input and inspect. Prefer it over screenshots to check text and structure.",
            json!({ "filter": { "type": "string", "enum": ["all", "interactive"] }, "depth": { "type": "number" }, "ref_id": { "type": "string", "description": "Only this element's subtree." }, "max_chars": { "type": "number" }, "tabId": tab }),
            &[],
        ),
        tool(
            "find",
            "Find elements whose role, name or text contains `query` (case-insensitive). Returns up to 20 refs.",
            json!({ "query": { "type": "string" }, "tabId": tab }),
            &["query"],
        ),
        tool(
            "form_input",
            "Set the value of an input, textarea, select (option text or value), checkbox or radio (true/false), firing input and change events.",
            json!({ "ref": { "type": "string" }, "value": {}, "tabId": tab }),
            &["ref", "value"],
        ),
        tool(
            "get_page_text",
            "Visible text of the page (main content first).",
            json!({ "max_chars": { "type": "number" }, "tabId": tab }),
            &[],
        ),
        tool(
            "inspect",
            "Measure elements: position and size (viewport and page), and computed styles (the listed `properties`, or a common set).",
            json!({ "ref": { "type": "string" }, "selector": { "type": "string", "description": "CSS selector, up to 10 matches." }, "properties": { "type": "array", "items": { "type": "string" } }, "tabId": tab }),
            &[],
        ),
        tool(
            "javascript_tool",
            "Run JavaScript in the page for debugging and inspection. The value of the last expression is returned as JSON; top-level await works.",
            json!({ "text": { "type": "string" }, "tabId": tab }),
            &["text"],
        ),
        tool(
            "read_console_messages",
            "Console messages, uncaught errors and failed loads of the page, oldest first.",
            json!({ "limit": { "type": "number" }, "onlyErrors": { "type": "boolean" }, "pattern": { "type": "string" }, "clear": { "type": "boolean" }, "tabId": tab }),
            &[],
        ),
        tool(
            "read_network_requests",
            "Requests of the page (fetch, XHR, WebSocket, document and resources) with status and timing; with `requestId`, headers and bodies.",
            json!({ "urlPattern": { "type": "string" }, "onlyFailed": { "type": "boolean" }, "limit": { "type": "number" }, "requestId": { "type": "string" }, "clear": { "type": "boolean" }, "tabId": tab }),
            &[],
        ),
        tool(
            "resize_window",
            "Emulate a viewport: preset mobile (375x812, iPhone user agent), tablet (768x1024) or desktop (the pane size), or width + height. colorScheme light/dark sets prefers-color-scheme for the page only; \"auto\" follows the app.",
            json!({ "preset": { "type": "string", "enum": ["mobile", "tablet", "desktop"] }, "width": { "type": "number" }, "height": { "type": "number" }, "colorScheme": { "type": "string", "enum": ["light", "dark", "auto"] }, "tabId": tab }),
            &[],
        ),
        tool(
            "tabs_context",
            "List the tabs of this session's browser pane.",
            json!({}),
            &[],
        ),
        tool(
            "tabs_create",
            "Open a new tab (about:blank if no url).",
            json!({ "url": { "type": "string" }, "foreground": { "type": "boolean" } }),
            &[],
        ),
        tool(
            "tabs_select",
            "Show a tab in the pane.",
            json!({ "tabId": { "type": "string" } }),
            &["tabId"],
        ),
        tool(
            "tabs_close",
            "Close a tab.",
            json!({ "tabId": { "type": "string" } }),
            &["tabId"],
        ),
        tool(
            "browser_batch",
            "Run several of these tools in one round trip, in order, stopping at the first error. Each item is {name, input}.",
            json!({ "actions": { "type": "array", "items": { "type": "object", "properties": { "name": { "type": "string" }, "input": { "type": "object" } }, "required": ["name", "input"] } } }),
            &["actions"],
        ),
    ];
    tools
}

fn tool(name: &str, description: &str, properties: Value, required: &[&str]) -> Value {
    json!({
        "name": name,
        "description": description,
        "inputSchema": { "type": "object", "properties": properties, "required": required },
        // Chargés d'office, comme dans l'app Claude : sinon l'agent doit d'abord les chercher.
        "_meta": { "anthropic/alwaysLoad": true },
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_last_expression_is_returned() {
        assert_eq!(
            with_last_return("const a = 1\na + 1"),
            "const a = 1\n\nreturn (a + 1)"
        );
        assert_eq!(
            with_last_return("document.title"),
            "\nreturn (document.title)"
        );
        assert_eq!(with_last_return("let x = 2;"), "let x = 2;");
    }

    #[test]
    fn key_combos_split_into_key_and_modifiers() {
        let (key, modifiers) = parse_combo("cmd+shift+z");
        assert_eq!(key, "z");
        assert!(modifiers.meta && modifiers.shift && !modifiers.ctrl);
        assert_eq!(parse_combo("Enter").0, "Enter");
    }

    #[test]
    fn same_server_whatever_the_loopback_name() {
        assert_eq!(
            origin_of("http://127.0.0.1:3000/a"),
            origin_of("http://localhost:3000")
        );
        assert_ne!(
            origin_of("http://localhost:3000"),
            origin_of("http://localhost:3001")
        );
    }

    #[test]
    fn ansi_colors_are_removed_from_logs() {
        assert_eq!(
            strip_ansi("\u{1b}[32mready\u{1b}[0m in 200ms\r"),
            "ready in 200ms"
        );
    }
}
