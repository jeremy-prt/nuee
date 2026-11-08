use tauri::{Manager, PhysicalPosition, PhysicalSize, WebviewWindow};
use tauri_plugin_window_state::{AppHandleExt, StateFlags, WindowExt};

// Retenus d'une ouverture à l'autre. Pas VISIBLE : la fenêtre, créée invisible, s'affiche ici une fois placée.
pub const SAVED_STATE: StateFlags = StateFlags::SIZE
    .union(StateFlags::POSITION)
    .union(StateFlags::MAXIMIZED);

// Marge autour de la fenêtre au lancement, en points logiques.
const MARGIN: f64 = 16.0;

// Fenêtre remise comme à la dernière fermeture ; au premier lancement, elle occupe l'écran. Le plugin ne retrouve
// pas un écran débranché depuis : la position est alors laissée à l'OS.
pub fn restore_or_fit(window: &WebviewWindow) -> tauri::Result<()> {
    let app = window.app_handle();
    if app.path().app_config_dir()?.join(app.filename()).exists() {
        window.restore_state(SAVED_STATE)?;
        return window.show();
    }
    fit_to_screen(window)
}

// Occupe tout l'écran utile (hors barre des menus et Dock) moins la marge, puis affiche la fenêtre,
// créée invisible pour éviter un saut de taille.
fn fit_to_screen(window: &WebviewWindow) -> tauri::Result<()> {
    let monitor = match window.current_monitor()? {
        Some(monitor) => Some(monitor),
        None => window.primary_monitor()?,
    };

    if let Some(monitor) = monitor {
        let area = monitor.work_area();
        let margin = (MARGIN * monitor.scale_factor()).round() as u32;
        // set_size règle l'intérieur : on retire la barre de titre native (Windows, Linux).
        let (outer, inner) = (window.outer_size()?, window.inner_size()?);
        let decorations = PhysicalSize::new(
            outer.width.saturating_sub(inner.width),
            outer.height.saturating_sub(inner.height),
        );

        window.set_size(PhysicalSize::new(
            area.size
                .width
                .saturating_sub(2 * margin + decorations.width),
            area.size
                .height
                .saturating_sub(2 * margin + decorations.height),
        ))?;
        window.set_position(PhysicalPosition::new(
            area.position.x + margin as i32,
            area.position.y + margin as i32,
        ))?;
    }

    window.show()
}

// Flou du bureau derrière la fenêtre transparente : une NSVisualEffectView posée sous la webview, dont on règle le
// rayon (comme monocode). Le flou privé de WindowServer ne sert plus qu'en repli : avec lui, macOS redessinait sans
// flou la zone sous le curseur, et le texte de l'app transparaissait un instant dans les menus en verre.
#[cfg(target_os = "macos")]
pub fn set_blur(window: &WebviewWindow, radius: u8) {
    use std::ffi::{c_int, c_void};
    use std::sync::OnceLock;

    type ConnectionFn = unsafe extern "C" fn() -> c_int;
    type SetBlurFn = unsafe extern "C" fn(c_int, c_int, c_int) -> c_int;

    fn lookup(symbol: &std::ffi::CStr) -> Option<*mut c_void> {
        let ptr = unsafe { libc::dlsym(libc::RTLD_DEFAULT, symbol.as_ptr()) };
        (!ptr.is_null()).then_some(ptr)
    }

    let Ok(ns_window) = window.ns_window() else {
        return;
    };
    let native = unsafe { &*ns_window.cast::<objc2_app_kit::NSWindow>() };
    let raw = unsafe { &*ns_window.cast::<objc2::runtime::AnyObject>() };
    // Comme Brume : sur un fond tout à fait transparent, le flou déborde des coins arrondis de la fenêtre.
    unsafe {
        let color: *mut objc2::runtime::AnyObject =
            objc2::msg_send![objc2::class!(NSColor), colorWithWhite: 1.0f64, alpha: 0.001f64];
        let _: () = objc2::msg_send![raw, setBackgroundColor: color];
        let _: () = objc2::msg_send![raw, invalidateShadow];
    }
    if backdrop::apply(native, radius) {
        return;
    }

    static FUNCTIONS: OnceLock<Option<(ConnectionFn, SetBlurFn)>> = OnceLock::new();
    let functions = FUNCTIONS.get_or_init(|| {
        let connection = lookup(c"CGSMainConnectionID")?;
        let set_blur = lookup(c"CGSSetWindowBackgroundBlurRadius")?;
        Some(unsafe {
            (
                std::mem::transmute::<*mut c_void, ConnectionFn>(connection),
                std::mem::transmute::<*mut c_void, SetBlurFn>(set_blur),
            )
        })
    });
    let Some((connection, set_blur)) = functions else {
        return;
    };
    let number: isize = unsafe { objc2::msg_send![raw, windowNumber] };
    if number > 0 {
        unsafe { set_blur(connection(), number as c_int, c_int::from(radius)) };
    }
}

#[cfg(target_os = "macos")]
mod backdrop {
    use std::cell::Cell;

    use objc2::rc::Retained;
    use objc2::runtime::AnyObject;
    use objc2::{DefinedClass, MainThreadMarker, MainThreadOnly, define_class, msg_send};
    use objc2_app_kit::{
        NSAutoresizingMaskOptions, NSUserInterfaceItemIdentification, NSVisualEffectBlendingMode,
        NSVisualEffectMaterial, NSVisualEffectState, NSVisualEffectView, NSWindow,
        NSWindowOrderingMode,
    };
    use objc2_foundation::{NSArray, NSNumber, NSRect, NSString};
    use objc2_quartz_core::CALayer;

    const ID: &str = "nuee.window-backdrop";

    struct Ivars {
        radius: Cell<u8>,
    }

    define_class!(
        #[unsafe(super(NSVisualEffectView))]
        #[name = "NueeWindowBackdrop"]
        #[ivars = Ivars]
        struct Backdrop;

        impl Backdrop {
            // AppKit refait les calques du matériau à chaque changement d'apparence : rayon et teinte se reposent après.
            #[unsafe(method(updateLayer))]
            fn update_layer(&self) {
                unsafe {
                    let _: () = msg_send![super(self), updateLayer];
                }
                self.tune();
            }
        }
    );

    impl Backdrop {
        fn new(frame: NSRect, radius: u8, mtm: MainThreadMarker) -> Retained<Self> {
            let allocated = Self::alloc(mtm).set_ivars(Ivars {
                radius: Cell::new(radius),
            });
            let view: Retained<Self> = unsafe { msg_send![super(allocated), initWithFrame: frame] };
            view.setMaterial(NSVisualEffectMaterial::UnderWindowBackground);
            view.setBlendingMode(NSVisualEffectBlendingMode::BehindWindow);
            view.setState(NSVisualEffectState::Active);
            view.setWantsLayer(true);
            view
        }

        fn set_radius(&self, radius: u8) {
            self.ivars().radius.set(radius);
            self.tune();
            self.setNeedsDisplay(true);
        }

        fn tune(&self) {
            let Some(layer) = self.layer() else {
                return;
            };
            let radius = self.ivars().radius.get();
            // Filtres privés d'AppKit : une exception Objective-C levée par une autre version de macOS ne doit pas
            // traverser updateLayer.
            let _ = objc2::exception::catch(std::panic::AssertUnwindSafe(|| {
                tune_layer(&layer, radius)
            }));
        }
    }

    /// Garde le flou gaussien d'AppKit, à notre rayon, sans la teinte ni la saturation du matériau : la couleur vient
    /// des fonds CSS, comme avec l'ancien flou.
    fn tune_layer(layer: &CALayer, radius: u8) {
        layer.setBackgroundColor(None);
        if layer.class().name().to_bytes() == b"CAChameleonLayer" {
            layer.setHidden(true);
            return;
        }
        if let Some(filters) = layer.filters() {
            let mut kept = Vec::with_capacity(filters.len());
            let mut changed = false;
            for filter in filters.iter() {
                let description: Retained<NSString> = unsafe { msg_send![&*filter, description] };
                let description = description.to_string();
                if description.contains("Saturat") {
                    changed = true;
                    continue;
                }
                if description.contains("Blur") {
                    let key = NSString::from_str("inputRadius");
                    let current: Option<Retained<NSNumber>> =
                        unsafe { msg_send![&*filter, valueForKey: &*key] };
                    if current.map(|value| value.doubleValue()) != Some(f64::from(radius)) {
                        // Le filtre posé est partagé avec l'arbre de rendu déjà envoyé : le modifier sur place ne
                        // rafraîchit rien, il faut en poser une copie.
                        let copy: Retained<AnyObject> = unsafe { msg_send![&*filter, copy] };
                        let value = NSNumber::numberWithDouble(f64::from(radius));
                        unsafe {
                            let _: () = msg_send![&*copy, setValue: &*value, forKey: &*key];
                        }
                        kept.push(copy);
                        changed = true;
                        continue;
                    }
                }
                kept.push(filter);
            }
            if changed {
                unsafe { layer.setFilters(Some(&NSArray::from_retained_slice(&kept))) };
            }
        }
        if let Some(children) = unsafe { layer.sublayers() } {
            for child in children.iter() {
                tune_layer(&child, radius);
            }
        }
    }

    /// Pose la vue sous la webview, ou met à jour celle déjà posée ; faux si la fenêtre n'a pas de vue de contenu.
    pub fn apply(window: &NSWindow, radius: u8) -> bool {
        let Some(content) = window.contentView() else {
            return false;
        };
        let id = NSString::from_str(ID);
        let subviews = content.subviews();
        if let Some(view) = subviews
            .iter()
            .find(|view| view.identifier().as_deref() == Some(&*id))
        {
            view.setHidden(radius == 0);
            if let Some(backdrop) = view.downcast_ref::<Backdrop>() {
                backdrop.set_radius(radius);
            }
            return true;
        }
        if radius == 0 {
            return true;
        }
        let view = Backdrop::new(content.bounds(), radius, window.mtm());
        view.setIdentifier(Some(&id));
        view.setAutoresizingMask(
            NSAutoresizingMaskOptions::ViewWidthSizable
                | NSAutoresizingMaskOptions::ViewHeightSizable,
        );
        // Wry garde la vue de contenu et sa WKWebView : on ajoute une sœur dessous, sans rien remplacer.
        content.addSubview_positioned_relativeTo(&view, NSWindowOrderingMode::Below, None);
        true
    }
}
