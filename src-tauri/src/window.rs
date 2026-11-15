use std::sync::Mutex;

use tauri::{Manager, PhysicalPosition, PhysicalSize, WebviewWindow};
use tauri_plugin_window_state::{AppHandleExt, StateFlags, WindowExt};

// Retenus d'une ouverture à l'autre. Pas VISIBLE : la fenêtre, créée invisible, s'affiche ici une fois placée.
pub const SAVED_STATE: StateFlags = StateFlags::SIZE
    .union(StateFlags::POSITION)
    .union(StateFlags::MAXIMIZED);

// Fenêtre remise comme à la dernière fermeture ; au premier lancement, presque plein écran. Le plugin ne retrouve
// pas un écran débranché depuis : la position est alors laissée à l'OS.
pub fn restore_or_fit(window: &WebviewWindow) -> tauri::Result<()> {
    let app = window.app_handle();
    if app.path().app_config_dir()?.join(app.filename()).exists() {
        window.restore_state(SAVED_STATE)?;
    } else if let Some(target) = fill_target(window)? {
        // Créée invisible : pas d'animation ni de saut de taille.
        set_outer_frame(window, target, false)?;
    }
    window.show()
}

// « Presque plein écran » : petite marge sur un portable ; sur un grand écran, le plafond laisse une marge bien plus
// large pour ne pas étirer l'app. En points logiques.
const FILL_MARGIN: f64 = 24.0;
const FILL_MAX: (f64, f64) = (1800.0, 1200.0);

// Cadre d'avant le remplissage, rendu à la frappe suivante.
static BEFORE_FILL: Mutex<Option<Frame>> = Mutex::new(None);

type Frame = (PhysicalPosition<i32>, PhysicalSize<u32>);

// Cadre extérieur centré dans la zone utile `area` (pixels physiques).
fn fill_frame(area: Frame, scale: f64) -> Frame {
    let (origin, size) = area;
    let fit = |available: u32, max: f64| {
        let margin = (FILL_MARGIN * scale).round() as u32;
        available
            .saturating_sub(2 * margin)
            .min((max * scale).round() as u32)
    };
    let (width, height) = (fit(size.width, FILL_MAX.0), fit(size.height, FILL_MAX.1));
    (
        PhysicalPosition::new(
            origin.x + ((size.width - width) / 2) as i32,
            origin.y + ((size.height - height) / 2) as i32,
        ),
        PhysicalSize::new(width, height),
    )
}

// Zone utile (hors barre des menus et Dock) de l'écran de la fenêtre.
fn fill_target(window: &WebviewWindow) -> tauri::Result<Option<Frame>> {
    let monitor = match window.current_monitor()? {
        Some(monitor) => Some(monitor),
        None => window.primary_monitor()?,
    };
    Ok(monitor.map(|monitor| {
        let area = monitor.work_area();
        fill_frame((area.position, area.size), monitor.scale_factor())
    }))
}

fn same_frame(a: Frame, b: Frame, tolerance: u32) -> bool {
    a.0.x.abs_diff(b.0.x) <= tolerance
        && a.0.y.abs_diff(b.0.y) <= tolerance
        && a.1.width.abs_diff(b.1.width) <= tolerance
        && a.1.height.abs_diff(b.1.height) <= tolerance
}

// Garde la transparence, que le plein écran de macOS perd. Une fenêtre déjà remplie reprend son cadre d'avant.
pub fn toggle_fill(window: &WebviewWindow) -> tauri::Result<()> {
    if window.is_fullscreen()? {
        return Ok(());
    }
    let Some(target) = fill_target(window)? else {
        return Ok(());
    };
    let current = (window.outer_position()?, window.outer_size()?);
    let tolerance = (2.0 * window.scale_factor()?).round() as u32;

    let mut before = BEFORE_FILL
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    if same_frame(current, target, tolerance) {
        if let Some(frame) = before.take() {
            set_outer_frame(window, frame, true)?;
        }
        return Ok(());
    }
    if window.is_maximized()? {
        window.unmaximize()?;
    }
    *before = Some(current);
    set_outer_frame(window, target, true)
}

fn set_outer_frame(
    window: &WebviewWindow,
    (position, size): Frame,
    animate: bool,
) -> tauri::Result<()> {
    #[cfg(target_os = "macos")]
    if animate && animate_frame(window, (position, size))? {
        return Ok(());
    }
    #[cfg(not(target_os = "macos"))]
    let _ = animate;
    // set_size règle l'intérieur : on retire la barre de titre native (Windows, Linux).
    let (outer, inner) = (window.outer_size()?, window.inner_size()?);
    window.set_size(PhysicalSize::new(
        size.width
            .saturating_sub(outer.width.saturating_sub(inner.width)),
        size.height
            .saturating_sub(outer.height.saturating_sub(inner.height)),
    ))?;
    window.set_position(position)
}

// Par Core Animation, qui laisse le thread principal libre : WebKit redessine à chaque image, là où
// setFrame:display:animate: le bloquait. Cocoa compte y depuis le bas de l'écran principal : le décalage se déduit
// du cadre actuel, connu dans les deux repères.
#[cfg(target_os = "macos")]
fn animate_frame(window: &WebviewWindow, (position, size): Frame) -> tauri::Result<bool> {
    use objc2::runtime::AnyObject;
    use objc2::{class, msg_send};
    use objc2_foundation::{NSPoint, NSRect, NSSize};

    // Réglage « Réduire les animations » de macOS : changement d'un coup.
    let reduce_motion: bool = unsafe {
        let workspace: *mut AnyObject = msg_send![class!(NSWorkspace), sharedWorkspace];
        msg_send![workspace, accessibilityDisplayShouldReduceMotion]
    };
    let Ok(ns_window) = window.ns_window() else {
        return Ok(false);
    };
    if reduce_motion {
        return Ok(false);
    }
    let native = unsafe { &*ns_window.cast::<objc2_app_kit::NSWindow>() };
    let scale = window.scale_factor()?;
    let current = native.frame();
    let flip =
        current.origin.y + current.size.height + f64::from(window.outer_position()?.y) / scale;
    let (width, height) = (
        f64::from(size.width) / scale,
        f64::from(size.height) / scale,
    );
    let frame = NSRect::new(
        NSPoint::new(
            f64::from(position.x) / scale,
            flip - f64::from(position.y) / scale - height,
        ),
        NSSize::new(width, height),
    );
    unsafe {
        let context = class!(NSAnimationContext);
        let _: () = msg_send![context, beginGrouping];
        let current: *mut AnyObject = msg_send![context, currentContext];
        let _: () = msg_send![current, setDuration: 0.3f64];
        // Courbe « default » de Core Animation : départ franc, arrivée douce.
        let name = objc2_foundation::NSString::from_str("default");
        let timing: *mut AnyObject =
            msg_send![class!(CAMediaTimingFunction), functionWithName: &*name];
        let _: () = msg_send![current, setTimingFunction: timing];
        let animator: *mut AnyObject = msg_send![native, animator];
        let _: () = msg_send![animator, setFrame: frame, display: true];
        let _: () = msg_send![context, endGrouping];
    }
    Ok(true)
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

#[cfg(test)]
mod tests {
    use super::*;

    fn frame(x: i32, y: i32, width: u32, height: u32) -> Frame {
        (
            PhysicalPosition::new(x, y),
            PhysicalSize::new(width, height),
        )
    }

    #[test]
    fn fill_keeps_a_small_margin_on_a_laptop() {
        // MacBook Air 13 pouces, Retina, barre des menus de 33 points et Dock masqué.
        let area = frame(0, 66, 2940, 1846);
        assert_eq!(fill_frame(area, 2.0), frame(48, 114, 2844, 1750));
    }

    #[test]
    fn fill_caps_the_window_on_a_large_screen() {
        // Écran 27 pouces en 2560 x 1440 points, Dock en bas.
        let area = frame(0, 25, 2560, 1340);
        assert_eq!(fill_frame(area, 1.0), frame(380, 95, 1800, 1200));
    }

    #[test]
    fn fill_follows_a_secondary_screen() {
        let area = frame(-1920, -200, 1920, 1080);
        assert_eq!(fill_frame(area, 1.0), frame(-1860, -176, 1800, 1032));
    }

    #[test]
    fn same_frame_tolerates_rounding() {
        assert!(same_frame(
            frame(10, 10, 100, 100),
            frame(11, 9, 102, 100),
            2
        ));
        assert!(!same_frame(
            frame(10, 10, 100, 100),
            frame(10, 10, 104, 100),
            2
        ));
    }
}
