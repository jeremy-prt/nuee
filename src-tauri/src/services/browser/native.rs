//! Les WKWebView du volet, posées au-dessus de la webview de Nuée dans la vue de contenu de la fenêtre.
//! Tout se passe sur le thread principal : les vues vivent dans un `thread_local`, rangées par onglet.

use std::cell::{Cell, RefCell};
use std::collections::HashMap;

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::{AnyObject, Bool, NSObject, NSObjectProtocol, ProtocolObject};
use objc2::{DefinedClass, MainThreadMarker, MainThreadOnly, define_class, msg_send};
use objc2_app_kit::{
    NSAppearance, NSAppearanceCustomization, NSAppearanceNameAqua, NSAppearanceNameDarkAqua,
    NSBitmapImageFileType, NSBitmapImageRep, NSEvent, NSEventModifierFlags, NSEventType, NSImage,
    NSView, NSWindow,
};
use objc2_foundation::{
    NSCopying, NSDate, NSDictionary, NSError, NSHTTPURLResponse, NSPoint, NSProcessInfo, NSRect,
    NSSize, NSString, NSURL, NSURLRequest, NSUUID,
};
use objc2_web_kit::{
    WKContentWorld, WKFrameInfo, WKNavigation, WKNavigationAction, WKNavigationActionPolicy,
    WKNavigationDelegate, WKNavigationResponse, WKNavigationResponsePolicy, WKScriptMessage,
    WKScriptMessageHandler, WKSnapshotConfiguration, WKUIDelegate, WKUserContentController,
    WKUserScript, WKUserScriptInjectionTime, WKWebView, WKWebViewConfiguration, WKWebsiteDataStore,
    WKWindowFeatures,
};
use tauri::{AppHandle, Manager};
use tokio::sync::oneshot::Sender;

use super::{
    BrowserService, ColorScheme, Frame, History, Modifiers, MouseAction, MouseButton, PAGE_SCRIPT,
    PageState, Screenshot, World,
};

/// Nom du canal page → Nuée (`webkit.messageHandlers.nuee`).
const HANDLER: &str = "nuee";

struct View {
    webview: Retained<WKWebView>,
    // Retenu pour la vie de l'onglet : WebKit détruit un monde qu'on lâche, et les refs de l'agent avec.
    world: Retained<WKContentWorld>,
    // Gardé en vie : la WKWebView ne retient ses délégués que faiblement.
    _delegate: Retained<Delegate>,
    zoom: f64,
}

thread_local! {
    static VIEWS: RefCell<HashMap<String, View>> = RefCell::new(HashMap::new());
}

struct Ivars {
    tab: String,
    app: AppHandle,
}

define_class!(
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[name = "NueeBrowserDelegate"]
    #[ivars = Ivars]
    struct Delegate;

    unsafe impl NSObjectProtocol for Delegate {}

    unsafe impl WKScriptMessageHandler for Delegate {
        #[unsafe(method(userContentController:didReceiveScriptMessage:))]
        fn did_receive(&self, _controller: &WKUserContentController, message: &WKScriptMessage) {
            let body = unsafe { message.body() };
            let Ok(text) = body.downcast::<NSString>() else {
                return;
            };
            let text = text.to_string();
            // N'importe quelle page peut écrire ici : un raccourci n'est rejoué que si la page a vraiment le clavier.
            if text.contains(r#""t":"key""#)
                && !unsafe { message.webView() }.is_some_and(|webview| has_keyboard(&webview))
            {
                return;
            }
            self.service().message(&self.ivars().tab, &text);
        }
    }

    unsafe impl WKNavigationDelegate for Delegate {
        #[unsafe(method(webView:decidePolicyForNavigationAction:decisionHandler:))]
        fn decide(
            &self,
            _webview: &WKWebView,
            action: &WKNavigationAction,
            handler: &block2::DynBlock<dyn Fn(WKNavigationActionPolicy)>,
        ) {
            let request = unsafe { action.request() };
            let scheme = request
                .URL()
                .and_then(|url| url.scheme())
                .map(|scheme| scheme.to_string().to_ascii_lowercase())
                .unwrap_or_default();
            // Seul le web : ni `file:`, ni les protocoles de Nuée (`tauri:`, `asset:`, `ipc:`).
            let allowed = matches!(
                scheme.as_str(),
                "http" | "https" | "about" | "data" | "blob"
            );
            handler.call((if allowed {
                WKNavigationActionPolicy::Allow
            } else {
                WKNavigationActionPolicy::Cancel
            },));
        }

        // Statut HTTP de la page elle-même (404, 500) : le script de la page ne le voit pas.
        #[unsafe(method(webView:decidePolicyForNavigationResponse:decisionHandler:))]
        fn decide_response(
            &self,
            _webview: &WKWebView,
            navigation: &WKNavigationResponse,
            handler: &block2::DynBlock<dyn Fn(WKNavigationResponsePolicy)>,
        ) {
            let response = unsafe { navigation.response() };
            if unsafe { navigation.isForMainFrame() }
                && let Some(http) = response.downcast_ref::<NSHTTPURLResponse>()
            {
                let message = serde_json::json!({
                    "t": "net",
                    "kind": "document",
                    "method": "GET",
                    "url": http.URL().and_then(|url| url.absoluteString()).map(|url| url.to_string()),
                    "status": http.statusCode(),
                    "mime": http.MIMEType().map(|mime| mime.to_string()),
                });
                self.service()
                    .message(&self.ivars().tab, &message.to_string());
            }
            handler.call((WKNavigationResponsePolicy::Allow,));
        }

        #[unsafe(method(webView:didStartProvisionalNavigation:))]
        fn did_start(&self, webview: &WKWebView, _navigation: Option<&WKNavigation>) {
            self.changed(webview, Some(true), None);
        }

        #[unsafe(method(webView:didCommitNavigation:))]
        fn did_commit(&self, webview: &WKWebView, _navigation: Option<&WKNavigation>) {
            self.changed(webview, Some(true), None);
        }

        #[unsafe(method(webView:didFinishNavigation:))]
        fn did_finish(&self, webview: &WKWebView, _navigation: Option<&WKNavigation>) {
            self.changed(webview, Some(false), None);
        }

        #[unsafe(method(webView:didFailProvisionalNavigation:withError:))]
        fn did_fail_early(
            &self,
            webview: &WKWebView,
            _navigation: Option<&WKNavigation>,
            error: &NSError,
        ) {
            self.failed(webview, error);
        }

        #[unsafe(method(webView:didFailNavigation:withError:))]
        fn did_fail(
            &self,
            webview: &WKWebView,
            _navigation: Option<&WKNavigation>,
            error: &NSError,
        ) {
            self.failed(webview, error);
        }

        #[unsafe(method(webViewWebContentProcessDidTerminate:))]
        fn crashed(&self, webview: &WKWebView) {
            unsafe { webview.reload() };
        }
    }

    unsafe impl WKUIDelegate for Delegate {
        // `target=_blank` et `window.open` : un nouvel onglet de la même session.
        #[unsafe(method_id(webView:createWebViewWithConfiguration:forNavigationAction:windowFeatures:))]
        fn create_window(
            &self,
            _webview: &WKWebView,
            _configuration: &WKWebViewConfiguration,
            action: &WKNavigationAction,
            _features: &WKWindowFeatures,
        ) -> Option<Retained<WKWebView>> {
            let url = unsafe { action.request() }
                .URL()
                .and_then(|url| url.absoluteString())
                .map(|url| url.to_string());
            let app = self.ivars().app.clone();
            let chat = self.service().chat_of(&self.ivars().tab);
            if let (Some(url), Some(chat)) = (url, chat) {
                tauri::async_runtime::spawn(async move {
                    let browser = app.state::<BrowserService>();
                    if let Ok(tab) = browser.open(&app, &chat, &url).await {
                        browser.reveal(&chat, &tab.id);
                    }
                });
            }
            None
        }

        // Pas de fenêtre modale par-dessus Nuée : le message va dans la console, la page continue.
        #[unsafe(method(webView:runJavaScriptAlertPanelWithMessage:initiatedByFrame:completionHandler:))]
        fn alert(
            &self,
            _webview: &WKWebView,
            message: &NSString,
            _frame: &WKFrameInfo,
            done: &block2::DynBlock<dyn Fn()>,
        ) {
            self.log("alert", &message.to_string());
            done.call(());
        }

        #[unsafe(method(webView:runJavaScriptConfirmPanelWithMessage:initiatedByFrame:completionHandler:))]
        fn confirm(
            &self,
            _webview: &WKWebView,
            message: &NSString,
            _frame: &WKFrameInfo,
            done: &block2::DynBlock<dyn Fn(Bool)>,
        ) {
            self.log("confirm", &format!("{message} (accepté)"));
            done.call((Bool::YES,));
        }

        #[unsafe(method(webView:runJavaScriptTextInputPanelWithPrompt:defaultText:initiatedByFrame:completionHandler:))]
        fn prompt(
            &self,
            _webview: &WKWebView,
            prompt: &NSString,
            default: Option<&NSString>,
            _frame: &WKFrameInfo,
            done: &block2::DynBlock<dyn Fn(*mut NSString)>,
        ) {
            self.log("prompt", &prompt.to_string());
            let answer = default
                .map(|text| text.copy())
                .unwrap_or_else(|| NSString::from_str(""));
            done.call((Retained::as_ptr(&answer).cast_mut(),));
        }
    }
);

impl Delegate {
    fn new(tab: &str, app: &AppHandle, mtm: MainThreadMarker) -> Retained<Self> {
        let this = Self::alloc(mtm).set_ivars(Ivars {
            tab: tab.to_owned(),
            app: app.clone(),
        });
        unsafe { msg_send![super(this), init] }
    }

    fn service(&self) -> tauri::State<'_, BrowserService> {
        self.ivars().app.state::<BrowserService>()
    }

    fn changed(&self, webview: &WKWebView, loading: Option<bool>, error: Option<String>) {
        let state = unsafe {
            PageState {
                url: webview
                    .URL()
                    .and_then(|url| url.absoluteString())
                    .map(|url| url.to_string()),
                title: webview.title().map(|title| title.to_string()),
                can_back: webview.canGoBack(),
                can_forward: webview.canGoForward(),
                loading,
                error,
            }
        };
        self.service().navigated(&self.ivars().tab, state);
    }

    fn failed(&self, webview: &WKWebView, error: &NSError) {
        // -999 : chargement remplacé par un autre (clic pendant le chargement), rien de raté.
        if error.code() == -999 {
            return;
        }
        let message = error.localizedDescription().to_string();
        self.log("error", &message);
        self.changed(webview, Some(false), Some(message));
    }

    fn log(&self, level: &str, text: &str) {
        let message = serde_json::json!({ "t": "console", "level": level, "text": text });
        self.service()
            .message(&self.ivars().tab, &message.to_string());
    }
}

fn with_view<T>(tab: &str, job: impl FnOnce(&View) -> T) -> Option<T> {
    VIEWS.with(|views| views.borrow().get(tab).map(job))
}

fn content_view(app: &AppHandle) -> Option<Retained<NSView>> {
    let window = app.get_webview_window("main")?;
    let window = window.ns_window().ok()?;
    let window = unsafe { &*window.cast::<NSWindow>() };
    window.contentView()
}

pub fn create(
    app: &AppHandle,
    tab: &str,
    store: [u8; 16],
    url: &str,
    mtm: MainThreadMarker,
) -> Result<(), String> {
    let parent = content_view(app).ok_or("fenêtre introuvable")?;
    let delegate = Delegate::new(tab, app, mtm);
    let webview = unsafe {
        let configuration = WKWebViewConfiguration::new(mtm);
        let id = NSUUID::from_bytes(store);
        configuration.setWebsiteDataStore(&WKWebsiteDataStore::dataStoreForIdentifier(&id, mtm));
        let controller = configuration.userContentController();
        let script = WKUserScript::initWithSource_injectionTime_forMainFrameOnly_inContentWorld(
            WKUserScript::alloc(mtm),
            &NSString::from_str(PAGE_SCRIPT),
            WKUserScriptInjectionTime::AtDocumentStart,
            false,
            &WKContentWorld::pageWorld(mtm),
        );
        controller.addUserScript(&script);
        controller.addScriptMessageHandler_contentWorld_name(
            ProtocolObject::from_ref(&*delegate),
            &WKContentWorld::pageWorld(mtm),
            &NSString::from_str(HANDLER),
        );
        let webview = WKWebView::initWithFrame_configuration(
            WKWebView::alloc(mtm),
            NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(1.0, 1.0)),
            &configuration,
        );
        webview.setNavigationDelegate(Some(ProtocolObject::from_ref(&*delegate)));
        webview.setUIDelegate(Some(ProtocolObject::from_ref(&*delegate)));
        // Inspecteur de Safari (Développement › Nuée) : utile pour déboguer sa page comme dans un navigateur.
        webview.setInspectable(true);
        webview.setAllowsBackForwardNavigationGestures(true);
        webview.setHidden(true);
        webview
    };
    parent.addSubview(&webview);
    let request = request(url).ok_or("adresse invalide")?;
    unsafe { webview.loadRequest(&request) };
    VIEWS.with(|views| {
        views.borrow_mut().insert(
            tab.to_owned(),
            View {
                webview,
                world: unsafe { WKContentWorld::worldWithName(&NSString::from_str("nuee"), mtm) },
                _delegate: delegate,
                zoom: 1.0,
            },
        )
    });
    Ok(())
}

fn request(url: &str) -> Option<Retained<NSURLRequest>> {
    let url = NSURL::URLWithString(&NSString::from_str(url))?;
    Some(NSURLRequest::requestWithURL(&url))
}

pub fn close(tab: &str) {
    if let Some(view) = VIEWS.with(|views| views.borrow_mut().remove(tab)) {
        unsafe {
            view.webview.stopLoading();
            view.webview
                .configuration()
                .userContentController()
                .removeAllScriptMessageHandlers();
        }
        view.webview.removeFromSuperview();
    }
}

pub fn load(tab: &str, url: &str) {
    with_view(tab, |view| {
        if let Some(request) = request(url) {
            unsafe { view.webview.loadRequest(&request) };
        }
    });
}

pub fn history(tab: &str, step: History) {
    with_view(tab, |view| unsafe {
        match step {
            History::Back => drop(view.webview.goBack()),
            History::Forward => drop(view.webview.goForward()),
            History::Reload => drop(view.webview.reload()),
            History::Stop => view.webview.stopLoading(),
        }
    });
}

/// `None` cache la page. Les coordonnées partent du coin haut gauche de la fenêtre.
pub fn place(tab: &str, frame: Option<Frame>) {
    VIEWS.with(|views| {
        let mut views = views.borrow_mut();
        let Some(view) = views.get_mut(tab) else {
            return;
        };
        let Some(frame) = frame else {
            view.webview.setHidden(true);
            return;
        };
        let Some(parent) = (unsafe { view.webview.superview() }) else {
            return;
        };
        let y = if parent.isFlipped() {
            frame.y
        } else {
            parent.bounds().size.height - frame.y - frame.height
        };
        view.webview.setFrame(NSRect::new(
            NSPoint::new(frame.x, y),
            NSSize::new(frame.width.max(1.0), frame.height.max(1.0)),
        ));
        if (view.zoom - frame.zoom).abs() > f64::EPSILON {
            unsafe { view.webview.setPageZoom(frame.zoom) };
            view.zoom = frame.zoom;
        }
        view.webview.setHidden(false);
    });
}

pub fn user_agent(tab: &str, agent: Option<&str>) {
    with_view(tab, |view| unsafe {
        view.webview
            .setCustomUserAgent(agent.map(NSString::from_str).as_deref());
    });
}

/// Apparence de la seule page (`prefers-color-scheme`) ; `None` : celle de Nuée.
pub fn appearance(tab: &str, scheme: Option<ColorScheme>) {
    with_view(tab, |view| {
        let appearance = scheme.and_then(|scheme| {
            NSAppearance::appearanceNamed(unsafe {
                match scheme {
                    ColorScheme::Dark => NSAppearanceNameDarkAqua,
                    ColorScheme::Light => NSAppearanceNameAqua,
                }
            })
        });
        view.webview.setAppearance(appearance.as_deref());
    });
}

pub fn script(tab: &str, body: &str, world: World, sender: Sender<Result<String, String>>) {
    let Some(mtm) = MainThreadMarker::new() else {
        return;
    };
    let sender = Cell::new(Some(sender));
    let done = RcBlock::new(move |value: *mut AnyObject, error: *mut NSError| {
        let Some(sender) = sender.take() else {
            return;
        };
        let result = if let Some(error) = unsafe { error.as_ref() } {
            Err(script_error(error))
        } else {
            Ok(unsafe { value.as_ref() }
                .and_then(|value| value.downcast_ref::<NSString>())
                .map(|text| text.to_string())
                .unwrap_or_else(|| "null".into()))
        };
        let _ = sender.send(result);
    });
    with_view(tab, |view| unsafe {
        let world = match world {
            World::Page => WKContentWorld::pageWorld(mtm),
            World::Nuee => view.world.clone(),
        };
        view.webview
            .callAsyncJavaScript_arguments_inFrame_inContentWorld_completionHandler(
                &NSString::from_str(body),
                None,
                None,
                &world,
                Some(&done),
            );
    });
}

/// Message de l'exception levée par la page, plutôt que le « A JavaScript exception occurred » de WebKit.
fn script_error(error: &NSError) -> String {
    let info = error.userInfo();
    let message = info
        .objectForKey(&NSString::from_str("WKJavaScriptExceptionMessage"))
        .and_then(|value| value.downcast::<NSString>().ok())
        .map(|text| text.to_string());
    message.unwrap_or_else(|| error.localizedDescription().to_string())
}

/// `region` : zone en px CSS du haut gauche de la page ; `scale` : pixels de l'image par px CSS.
pub fn snapshot(
    tab: &str,
    region: Option<[f64; 4]>,
    scale: f64,
    sender: Sender<Result<Screenshot, String>>,
) {
    let Some(mtm) = MainThreadMarker::new() else {
        return;
    };
    let Some((webview, zoom)) = with_view(tab, |view| (view.webview.clone(), view.zoom)) else {
        return;
    };
    let bounds = webview.bounds();
    let backing = webview
        .window()
        .map_or(2.0, |window| window.backingScaleFactor());
    let rect = match region {
        Some([x, y, width, height]) => NSRect::new(
            NSPoint::new(x * zoom, y * zoom),
            NSSize::new(width * zoom, height * zoom),
        ),
        None => bounds,
    };
    // Largeur demandée en points : à l'échelle de l'écran, `scale` px CSS donne autant de pixels.
    let width_css = rect.size.width / zoom;
    let pixels = (width_css * scale).round().max(1.0);
    let configuration = unsafe {
        let configuration = WKSnapshotConfiguration::new(mtm);
        configuration.setRect(rect);
        configuration
            .setSnapshotWidth(Some(&objc2_foundation::NSNumber::new_f64(pixels / backing)));
        configuration.setAfterScreenUpdates(true);
        configuration
    };
    let sender = Cell::new(Some(sender));
    let done = RcBlock::new(move |image: *mut NSImage, error: *mut NSError| {
        let Some(sender) = sender.take() else {
            return;
        };
        let result = match (unsafe { image.as_ref() }, unsafe { error.as_ref() }) {
            (Some(image), _) => jpeg_of(image),
            (None, Some(error)) => Err(error.localizedDescription().to_string()),
            (None, None) => Err("capture vide".into()),
        };
        let _ = sender.send(result);
    });
    unsafe {
        webview.takeSnapshotWithConfiguration_completionHandler(Some(&configuration), &done);
    }
}

fn jpeg_of(image: &NSImage) -> Result<Screenshot, String> {
    let tiff = image.TIFFRepresentation().ok_or("image illisible")?;
    let rep = NSBitmapImageRep::imageRepWithData(&tiff).ok_or("image illisible")?;
    let data = unsafe {
        rep.representationUsingType_properties(NSBitmapImageFileType::JPEG, &NSDictionary::new())
    }
    .ok_or("encodage JPEG impossible")?;
    Ok(Screenshot {
        jpeg: data.to_vec(),
        width: u32::try_from(rep.pixelsWide()).unwrap_or_default(),
        height: u32::try_from(rep.pixelsHigh()).unwrap_or_default(),
    })
}

fn flags_of(modifiers: Modifiers) -> NSEventModifierFlags {
    let mut flags = NSEventModifierFlags::empty();
    if modifiers.meta {
        flags |= NSEventModifierFlags::Command;
    }
    if modifiers.ctrl {
        flags |= NSEventModifierFlags::Control;
    }
    if modifiers.alt {
        flags |= NSEventModifierFlags::Option;
    }
    if modifiers.shift {
        flags |= NSEventModifierFlags::Shift;
    }
    flags
}

/// La page reçoit l'événement comme d'un vrai clavier ou d'une vraie souris (`isTrusted`). Il lui
/// faut le focus de la fenêtre pour le traiter ; celui de Nuée lui est rendu ensuite, sauf si
/// l'utilisateur était déjà dans la page.
fn with_focus<T>(webview: &WKWebView, job: impl FnOnce(&NSWindow) -> T) -> Option<T> {
    let window = webview.window()?;
    let before = window.firstResponder();
    let was_page = before
        .as_ref()
        .is_some_and(|responder| is_inside(responder, webview));
    if !was_page {
        window.makeFirstResponder(Some(webview));
    }
    let result = job(&window);
    if !was_page && let Some(before) = before {
        window.makeFirstResponder(Some(&before));
    }
    Some(result)
}

fn has_keyboard(webview: &WKWebView) -> bool {
    let Some(window) = webview.window() else {
        return false;
    };
    window.isKeyWindow()
        && window
            .firstResponder()
            .is_some_and(|responder| is_inside(&responder, webview))
}

fn is_inside(responder: &objc2_app_kit::NSResponder, webview: &WKWebView) -> bool {
    let Some(view) = responder.downcast_ref::<NSView>() else {
        return false;
    };
    view.isDescendantOf(webview)
}

fn now() -> f64 {
    NSProcessInfo::processInfo().systemUptime()
}

pub fn mouse(
    tab: &str,
    action: MouseAction,
    point: (f64, f64),
    modifiers: Modifiers,
) -> Result<(), String> {
    let (webview, zoom) =
        with_view(tab, |view| (view.webview.clone(), view.zoom)).ok_or("onglet introuvable")?;
    let to_window =
        |(x, y): (f64, f64)| webview.convertPoint_toView(NSPoint::new(x * zoom, y * zoom), None);
    let flags = flags_of(modifiers);
    with_focus(&webview, |window| {
        let number = window.windowNumber();
        let event = |kind: NSEventType, at: NSPoint, clicks: isize| {
            NSEvent::mouseEventWithType_location_modifierFlags_timestamp_windowNumber_context_eventNumber_clickCount_pressure(
                kind, at, flags, now(), number, None, 0, clicks, if clicks > 0 { 1.0 } else { 0.0 },
            )
        };
        let at = to_window(point);
        match action {
            MouseAction::Move => {
                if let Some(moved) = event(NSEventType::MouseMoved, at, 0) {
                    webview.mouseMoved(&moved);
                }
            }
            MouseAction::Click { button, count } => {
                for clicks in 1..=isize::from(count.max(1)) {
                    let (down, up) = match button {
                        MouseButton::Left => (NSEventType::LeftMouseDown, NSEventType::LeftMouseUp),
                        MouseButton::Right => (NSEventType::RightMouseDown, NSEventType::RightMouseUp),
                    };
                    if let (Some(down), Some(up)) = (event(down, at, clicks), event(up, at, clicks)) {
                        match button {
                            MouseButton::Left => {
                                webview.mouseDown(&down);
                                webview.mouseUp(&up);
                            }
                            MouseButton::Right => {
                                webview.rightMouseDown(&down);
                                webview.rightMouseUp(&up);
                            }
                        }
                    }
                }
            }
            MouseAction::Drag { from } => {
                let start = to_window(from);
                if let Some(down) = event(NSEventType::LeftMouseDown, start, 1) {
                    webview.mouseDown(&down);
                }
                for step in 1..=10 {
                    let t = f64::from(step) / 10.0;
                    let between = NSPoint::new(start.x + (at.x - start.x) * t, start.y + (at.y - start.y) * t);
                    if let Some(dragged) = event(NSEventType::LeftMouseDragged, between, 1) {
                        webview.mouseDragged(&dragged);
                    }
                }
                if let Some(up) = event(NSEventType::LeftMouseUp, at, 1) {
                    webview.mouseUp(&up);
                }
            }
        }
    })
    .ok_or_else(|| "la page n'est pas dans la fenêtre".into())
}

/// Touche nommée façon Playwright (« Enter », « ArrowDown », « a ») : code virtuel de macOS et caractère produit.
fn key_of(name: &str) -> Option<(u16, String)> {
    let named = match name.to_ascii_lowercase().as_str() {
        "enter" | "return" => Some((36, "\r")),
        "tab" => Some((48, "\t")),
        "space" | " " => Some((49, " ")),
        "backspace" | "delete" => Some((51, "\u{7f}")),
        "forwarddelete" => Some((117, "\u{f728}")),
        "escape" | "esc" => Some((53, "\u{1b}")),
        "arrowleft" | "left" => Some((123, "\u{f702}")),
        "arrowright" | "right" => Some((124, "\u{f703}")),
        "arrowdown" | "down" => Some((125, "\u{f701}")),
        "arrowup" | "up" => Some((126, "\u{f700}")),
        "home" => Some((115, "\u{f729}")),
        "end" => Some((119, "\u{f72b}")),
        "pageup" => Some((116, "\u{f72c}")),
        "pagedown" => Some((121, "\u{f72d}")),
        _ => None,
    };
    if let Some((code, text)) = named {
        return Some((code, text.to_owned()));
    }
    let mut chars = name.chars();
    let single = chars.next().filter(|_| chars.next().is_none())?;
    let code = match single.to_ascii_lowercase() {
        'a' => 0,
        's' => 1,
        'd' => 2,
        'f' => 3,
        'h' => 4,
        'g' => 5,
        'z' => 6,
        'x' => 7,
        'c' => 8,
        'v' => 9,
        'b' => 11,
        'q' => 12,
        'w' => 13,
        'e' => 14,
        'r' => 15,
        'y' => 16,
        't' => 17,
        '1' => 18,
        '2' => 19,
        '3' => 20,
        '4' => 21,
        '6' => 22,
        '5' => 23,
        '=' => 24,
        '9' => 25,
        '7' => 26,
        '-' => 27,
        '8' => 28,
        '0' => 29,
        ']' => 30,
        'o' => 31,
        'u' => 32,
        '[' => 33,
        'i' => 34,
        'p' => 35,
        'l' => 37,
        'j' => 38,
        '\'' => 39,
        'k' => 40,
        ';' => 41,
        '\\' => 42,
        ',' => 43,
        '/' => 44,
        'n' => 45,
        'm' => 46,
        '.' => 47,
        _ => 0,
    };
    Some((code, single.to_string()))
}

pub fn key(tab: &str, name: &str, modifiers: Modifiers) -> Result<(), String> {
    let webview = with_view(tab, |view| view.webview.clone()).ok_or("onglet introuvable")?;
    let (code, text) = key_of(name).ok_or_else(|| format!("touche inconnue : {name}"))?;
    let flags = flags_of(modifiers);
    with_focus(&webview, |window| {
        let number = window.windowNumber();
        let characters = NSString::from_str(&text);
        let event = |kind: NSEventType| {
            NSEvent::keyEventWithType_location_modifierFlags_timestamp_windowNumber_context_characters_charactersIgnoringModifiers_isARepeat_keyCode(
                kind, NSPoint::new(0.0, 0.0), flags, now(), number, None, &characters, &characters, false, code,
            )
        };
        if let (Some(down), Some(up)) = (event(NSEventType::KeyDown), event(NSEventType::KeyUp)) {
            // Avec ⌘, AppKit passe par les équivalents clavier (⌘A sélectionne tout, ⌘C copie).
            if modifiers.meta {
                if !webview.performKeyEquivalent(&down) {
                    webview.keyDown(&down);
                }
            } else {
                webview.keyDown(&down);
            }
            webview.keyUp(&up);
        }
    })
    .ok_or_else(|| "la page n'est pas dans la fenêtre".into())
}

pub fn clear_store(store: [u8; 16], sender: Sender<Result<(), String>>, mtm: MainThreadMarker) {
    let sender = Cell::new(Some(sender));
    let done = RcBlock::new(move || {
        if let Some(sender) = sender.take() {
            let _ = sender.send(Ok(()));
        }
    });
    unsafe {
        let store = WKWebsiteDataStore::dataStoreForIdentifier(&NSUUID::from_bytes(store), mtm);
        store.removeDataOfTypes_modifiedSince_completionHandler(
            &WKWebsiteDataStore::allWebsiteDataTypes(mtm),
            &NSDate::distantPast(),
            &done,
        );
    }
}
