import { defineStore } from 'pinia'
import { computed, reactive, ref, watch, watchEffect } from 'vue'
import { isMacosApp, isTauriApp } from '@/ipc/system'
import { windowSetBlur, windowSetTheme, windowSetZoom } from '@/ipc/window'
import {
  type AccentId,
  accentColor,
  accentIds,
  type ColorMode,
  colorModes,
  onSignalColor,
  palette,
  type ResolvedMode,
  solidEdgeColor,
  type ThemeId,
  themeIds,
  themes,
} from '@/utils/themes'
import { hslColor, measure, type Pixels, pickLook, TARGET, type View } from '@/utils/legibility'

export const windowStyles = ['transparent', 'mixed', 'opaque'] as const
export type WindowStyle = (typeof windowStyles)[number]

export const glassOptions = {
  opacity: ['low', 'medium', 'high'],
  centerOpacity: ['low', 'medium', 'high'],
  blur: ['none', 'low', 'medium', 'high'],
  lightness: ['dark', 'medium', 'light'],
} as const
export type GlassSetting = keyof typeof glassOptions
export type Glass = { [K in GlassSetting]: (typeof glassOptions)[K][number] }

// Transparent garde un seul voile pour toute la fenêtre ; Opaque ne laisse rien voir, seul son fond se règle.
export function glassSettings(style: WindowStyle): GlassSetting[] {
  if (style === 'opaque') return ['lightness']
  const all = Object.keys(glassOptions) as GlassSetting[]
  return style === 'transparent' ? all.filter((setting) => setting !== 'centerOpacity') : all
}

// Part de fond gardée dans le cadre (barres, liste des chats, terminal, panneau de droite) et au centre.
// Moyenne laisse voir un peu plus d'un quart du bureau (monocode Focused : un cinquième) : à 66 %, un fond d'écran
// sombre assombrissait toute l'app (choix de Jérémy). Le centre de Mixte reste au-dessus du cadre, sinon Mixte
// deviendrait un second Transparent. Ses crans, sous l'ancien 80/88/94, laissent ressortir l'image de fond sans
// gêner la lecture. En clair, un bureau sombre grise le voile blanc bien plus qu'il n'assombrit le voile sombre :
// les mêmes crans y couvrent davantage, sinon le texte atténué passait sous 3:1.
const BARS_OPACITY: Record<ResolvedMode, Record<Glass['opacity'], number>> = {
  dark: { low: 45, medium: 72, high: 82 },
  light: { low: 70, medium: 80, high: 90 },
}
const CENTER_OPACITY: Record<ResolvedMode, Record<Glass['centerOpacity'], number>> = {
  dark: { low: 60, medium: 74, high: 88 },
  light: { low: 80, medium: 88, high: 94 },
}
const BLUR: Record<Glass['blur'], number> = { none: 0, low: 24, medium: 48, high: 72 }
const LIGHTNESS: Record<ResolvedMode, Record<Glass['lightness'], number>> = {
  dark: { dark: 5, medium: 10, light: 14 },
  light: { dark: 92, medium: 96, light: 99 },
}
// Part du texte dans `--color-muted` (main.css), pour le calcul de lisibilité.
const MUTED: Record<ResolvedMode, number> = { dark: 0.55, light: 0.62 }

export interface GlassValues {
  chrome: number
  surface: number
}

function glassValues(style: WindowStyle, glass: Glass, mode: ResolvedMode): GlassValues {
  const chrome = style === 'opaque' ? 100 : BARS_OPACITY[mode][glass.opacity]
  const surface = style === 'mixed' ? CENTER_OPACITY[mode][glass.centerOpacity] : chrome
  return { chrome, surface }
}

function blurRadius(glass: Glass) {
  return BLUR[glass.blur]
}

// Ce que donnent des crans dans un mode, pour le calcul de lisibilité (utils/legibility.ts).
function legibilityView(
  style: WindowStyle,
  glass: Glass,
  visibility: Background['visibility'],
  fade: Background['blur'],
  theme: ThemeId,
  mode: ResolvedMode,
): View {
  const values = glassValues(style, glass, mode)
  const colors = palette(theme, mode, LIGHTNESS[mode][glass.lightness])
  return {
    look: {
      chrome: values.chrome / 100,
      surface: values.surface / 100,
      veil: hslColor(colors.veil),
      image: BACKGROUND_OPACITY[mode][visibility] / 100,
      fade: fade !== 'none',
    },
    scene: { canvas: hslColor(colors.canvas), content: hslColor(colors.content), muted: MUTED[mode] },
  }
}

// Image de fond de la zone centrale : effets décrits dans utils/backgroundEffects.ts.
export const backgroundEffects = ['none', 'dither', 'ascii', 'halftone', 'scanlines', 'pixelate'] as const
export type BackgroundEffect = (typeof backgroundEffects)[number]
export const backgroundOptions = {
  where: ['chats', 'everywhere'],
  visibility: ['low', 'medium', 'high'],
  intensity: ['low', 'medium', 'high'],
  blur: ['none', 'low', 'medium', 'high'],
  effect: backgroundEffects,
} as const
export const INTENSITY_LEVEL = { low: 0, medium: 1, high: 2 } as const
type BackgroundSetting = keyof typeof backgroundOptions
export interface Background {
  path: string | null
  effect: (typeof backgroundOptions)['effect'][number]
  where: (typeof backgroundOptions)['where'][number]
  visibility: (typeof backgroundOptions)['visibility'][number]
  intensity: (typeof backgroundOptions)['intensity'][number]
  // Flou du bas de l'image, sous la conversation et la zone de saisie (voir ShellBackgroundImage).
  blur: (typeof backgroundOptions)['blur'][number]
}
// Discrète = l'opacité par défaut de monocode, dont Jérémy aime le rendu. En clair, les zones sombres d'une photo
// tiraient tout le fond vers le gris : l'image y est plus discrète à cran égal.
const BACKGROUND_OPACITY: Record<ResolvedMode, Record<Background['visibility'], number>> = {
  dark: { low: 24, medium: 36, high: 52 },
  light: { low: 16, medium: 24, high: 36 },
}

export interface FitChanges {
  glass: GlassSetting[]
  background: ('visibility' | 'blur')[]
}

function defaultBackground(path: string | null): Background {
  return { path, effect: 'none', where: 'everywhere', visibility: 'medium', intensity: 'medium', blur: 'medium' }
}

export const zoomLevels = [80, 90, 100, 110, 125, 150] as const
export type ZoomLevel = (typeof zoomLevels)[number]

export const chatWidths = ['normal', 'wide', 'full'] as const
export type ChatWidth = (typeof chatWidths)[number]
// Largeur fixe, comme la colonne de 832 px de monocode : ouvrir ou fermer un panneau ne la change pas, elle ne
// rétrécit que si la zone devient plus étroite qu'elle. Une largeur en % suivait chaque panneau.
const CHAT_WIDTH: Record<ChatWidth, string> = {
  normal: 'min(52rem, 100%)',
  wide: 'min(72rem, 100%)',
  full: '100%',
}

// Projets dans la colonne de gauche, ou dans un menu en haut à gauche avec l'espace de travail en carte.
export const appLayouts = ['columns', 'menu'] as const
export type AppLayout = (typeof appLayouts)[number]

export const animationKinds = ['background', 'scenes', 'interface'] as const
export type AnimationKind = (typeof animationKinds)[number]
export type Animations = Record<AnimationKind, boolean>

const STORAGE_KEY = 'nuee.appearance.v9'
// Avant la v9, le thème n'était qu'un accent : il devient le choix d'accent.
const LEGACY_KEY = 'nuee.appearance.v8'

function defaultGlass(): Glass {
  return { opacity: 'medium', centerOpacity: 'medium', blur: 'medium', lightness: 'medium' }
}

interface AppearanceState {
  mode: ColorMode
  theme: ThemeId
  accent: AccentId
  windowStyle: WindowStyle
  glass: Record<WindowStyle, Glass>
  background: Background
  zoom: ZoomLevel
  chatWidth: ChatWidth
  layout: AppLayout
  animations: Animations
}

function defaults(): AppearanceState {
  return {
    mode: 'dark',
    theme: 'nuee',
    accent: 'azur',
    windowStyle: 'mixed',
    glass: { transparent: defaultGlass(), mixed: defaultGlass(), opaque: defaultGlass() },
    background: defaultBackground(null),
    zoom: 100,
    chatWidth: 'normal',
    layout: 'menu',
    animations: { background: true, scenes: true, interface: true },
  }
}

function load(): AppearanceState {
  try {
    let saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (!saved) {
      saved = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? 'null')
      if (saved) saved = { ...saved, theme: 'nuee', accent: saved.theme }
    }
    if (!saved) return defaults()
    const state = defaults()
    if (colorModes.includes(saved.mode)) state.mode = saved.mode
    if (themeIds.includes(saved.theme)) state.theme = saved.theme
    if (accentIds.includes(saved.accent)) state.accent = saved.accent
    if (windowStyles.includes(saved.windowStyle)) state.windowStyle = saved.windowStyle
    if (zoomLevels.includes(saved.zoom)) state.zoom = saved.zoom
    if (chatWidths.includes(saved.chatWidth)) state.chatWidth = saved.chatWidth
    if (appLayouts.includes(saved.layout)) state.layout = saved.layout
    // Un seul interrupteur `effects` coupait autrefois les trois.
    for (const kind of animationKinds) {
      const value = saved.animations?.[kind] ?? saved.effects
      if (typeof value === 'boolean') state.animations[kind] = value
    }
    const background = saved.background ?? {}
    if (typeof background.path === 'string') state.background.path = background.path
    for (const setting of Object.keys(backgroundOptions) as BackgroundSetting[]) {
      if ((backgroundOptions[setting] as readonly string[]).includes(background[setting])) {
        ;(state.background as unknown as Record<BackgroundSetting, string>)[setting] = background[setting]
      }
    }
    for (const style of windowStyles) {
      for (const setting of Object.keys(glassOptions) as GlassSetting[]) {
        const value = saved.glass?.[style]?.[setting]
        if ((glassOptions[setting] as readonly string[]).includes(value)) {
          ;(state.glass[style] as Record<GlassSetting, string>)[setting] = value
        }
      }
    }
    return state
  } catch {
    return defaults()
  }
}

export const useAppearanceStore = defineStore('appearance', () => {
  const state = load()
  const mode = ref<ColorMode>(state.mode)
  const theme = ref<ThemeId>(state.theme)
  const accent = ref<AccentId>(state.accent)
  const windowStyle = ref<WindowStyle>(state.windowStyle)
  const glass = reactive(state.glass)
  const background = reactive(state.background)
  const zoom = ref<ZoomLevel>(state.zoom)
  const chatWidth = ref<ChatWidth>(state.chatWidth)
  const layout = ref<AppLayout>(state.layout)
  const animations = reactive(state.animations)

  watchEffect(() => document.documentElement.style.setProperty('--chat-width', CHAT_WIDTH[chatWidth.value]))
  // Facteur réellement appliqué : hors de l'app (navigateur), la webview n'est pas zoomée.
  const zoomFactor = computed(() => (isTauriApp() ? zoom.value / 100 : 1))

  watch(
    zoomFactor,
    (factor) => {
      document.documentElement.style.setProperty('--ui-zoom', String(factor))
      if (isTauriApp()) windowSetZoom(factor).catch(() => {})
    },
    { immediate: true },
  )

  // En mode Système, la fenêtre suit macOS (thème natif à null) et la webview le reflète dans prefers-color-scheme.
  const systemDark = matchMedia('(prefers-color-scheme: dark)')
  const prefersDark = ref(systemDark.matches)
  systemDark.addEventListener('change', (event) => (prefersDark.value = event.matches))
  const resolvedMode = computed<ResolvedMode>(() => (mode.value === 'system' ? (prefersDark.value ? 'dark' : 'light') : mode.value))

  watch(
    mode,
    (value) => {
      if (isTauriApp()) windowSetTheme(value === 'system' ? null : value).catch(() => {})
    },
    { immediate: true },
  )

  // Hors macOS, la fenêtre est toujours opaque : c'est le seul style qui s'applique.
  const effectiveStyle = computed<WindowStyle>(() => (isMacosApp() ? windowStyle.value : 'opaque'))
  const active = computed(() => glass[effectiveStyle.value])
  const backgroundOpacity = computed(() => BACKGROUND_OPACITY[resolvedMode.value][background.visibility] / 100)

  watchEffect(() => {
    const root = document.documentElement
    const resolved = resolvedMode.value
    root.dataset.window = effectiveStyle.value
    root.dataset.effects = animations.interface ? 'on' : 'off'
    root.dataset.mode = resolved
    const colors = palette(theme.value, resolved, LIGHTNESS[resolved][active.value.lightness])
    root.style.setProperty('--color-canvas', colors.canvas)
    root.style.setProperty('--color-overlay', colors.overlay)
    root.style.setProperty('--color-content', colors.content)
    root.style.setProperty('--color-veil', colors.veil)
    root.style.setProperty('--color-accent', accentColor(accent.value, resolved))
    root.style.setProperty('--color-on-signal', onSignalColor(accent.value, resolved))
    root.style.setProperty('--control-solid-edge', solidEdgeColor(accent.value, resolved))
    const values = glassValues(effectiveStyle.value, active.value, resolved)
    root.style.setProperty('--chrome-alpha', `${values.chrome}%`)
    root.style.setProperty('--surface-alpha', `${values.surface}%`)
  })

  watch(
    () => (effectiveStyle.value === 'opaque' ? 0 : blurRadius(active.value)),
    (radius) => {
      if (isMacosApp()) windowSetBlur(radius).catch(() => {})
    },
    { immediate: true },
  )

  watch(
    [mode, theme, accent, windowStyle, glass, background, zoom, chatWidth, layout, animations],
    () => {
      const saved = {
        mode: mode.value,
        theme: theme.value,
        accent: accent.value,
        windowStyle: windowStyle.value,
        glass,
        background,
        zoom: zoom.value,
        chatWidth: chatWidth.value,
        layout: layout.value,
        animations,
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
      } catch {
        // Stockage indisponible : le style reste valable pour la session.
      }
    },
    { deep: true },
  )

  function stepZoom(step: -1 | 1) {
    const index = zoomLevels.indexOf(zoom.value) + step
    zoom.value = zoomLevels[Math.max(0, Math.min(zoomLevels.length - 1, index))]!
  }

  function resetGlass(style: WindowStyle) {
    Object.assign(glass[style], defaultGlass())
  }

  function resetBackground() {
    Object.assign(background, defaultBackground(background.path))
  }

  // Une première image repart des réglages par défaut ; un changement d'image garde ceux en place.
  function setBackground(path: string | null) {
    if (path && !background.path) Object.assign(background, defaultBackground(path))
    else background.path = path
  }

  // « Ajuster automatiquement » : parmi les crans du style en vigueur et de l'image, le premier jeu lisible dans le mode
  // affiché. Ordre de préférence : l'image la plus opaque, la luminosité inchangée (elle teinte toute la fenêtre), le
  // moins de flou du bas, puis le moins de changements.
  function fitToImage(pixels: Pixels): FitChanges {
    const style = effectiveStyle.value
    const mode = resolvedMode.value
    const other: ResolvedMode = mode === 'dark' ? 'light' : 'dark'
    const current = { ...glass[style] }
    const settings = glassSettings(style)
    const view = (target: ResolvedMode, next: Glass, visibility: Background['visibility'], fade: Background['blur']) =>
      legibilityView(style, next, visibility, fade, theme.value, target)
    // Les crans valent pour les deux modes : l'autre ne perd rien, il garde le seuil voulu ou au moins son contraste
    // d'avant.
    const kept = view(other, current, background.visibility, background.blur)
    const before = measure(pixels, kept.look, kept.scene)
    const otherTarget = { text: Math.min(TARGET.text, before.text), muted: Math.min(TARGET.muted, before.muted) }
    // Le flou du bureau ne change pas le contraste moyen, mais à « Aucun » le texte des fenêtres de derrière reste net.
    const blur = style !== 'opaque' && current.blur === 'none' ? 'low' : current.blur
    const choices = <K extends 'opacity' | 'centerOpacity' | 'lightness'>(setting: K) =>
      (settings.includes(setting) ? glassOptions[setting] : [current[setting]]) as readonly Glass[K][]
    const step = <K extends GlassSetting>(setting: K, value: Glass[K]) =>
      Math.abs((glassOptions[setting] as readonly string[]).indexOf(value) - (glassOptions[setting] as readonly string[]).indexOf(current[setting]))
    const candidates = []
    for (const opacity of choices('opacity')) {
      for (const centerOpacity of choices('centerOpacity')) {
        for (const lightness of choices('lightness')) {
          for (const visibility of backgroundOptions.visibility) {
            for (const fade of backgroundOptions.blur) {
              const next: Glass = { opacity, centerOpacity, blur, lightness }
              const views = [view(mode, next, visibility, fade), { ...view(other, next, visibility, fade), target: otherTarget }]
              const rank = [
                -backgroundOptions.visibility.indexOf(visibility),
                step('lightness', lightness),
                backgroundOptions.blur.indexOf(fade),
                Number(opacity !== current.opacity) + Number(centerOpacity !== current.centerOpacity),
                step('opacity', opacity) + step('centerOpacity', centerOpacity),
              ]
              candidates.push({ next, visibility, fade, views, rank })
            }
          }
        }
      }
    }
    candidates.sort((a, b) => {
      const index = a.rank.findIndex((value, position) => value !== b.rank[position])
      return index === -1 ? 0 : a.rank[index]! - b.rank[index]!
    })
    let pick = pickLook(candidates.map((candidate) => candidate.views), pixels)
    if (!pick.legible) pick = pickLook(candidates.map((candidate) => candidate.views.slice(0, 1)), pixels)
    const chosen = candidates[pick.index]!
    const changes: FitChanges = {
      glass: (Object.keys(chosen.next) as GlassSetting[]).filter((setting) => chosen.next[setting] !== current[setting]),
      background: (['visibility', 'blur'] as const).filter((setting) => (setting === 'blur' ? chosen.fade : chosen.visibility) !== background[setting]),
    }
    Object.assign(glass[style], chosen.next)
    background.visibility = chosen.visibility
    background.blur = chosen.fade
    return changes
  }

  // Un thème pose l'accent qu'il propose, que l'on peut ensuite changer.
  function applyTheme(id: ThemeId) {
    theme.value = id
    accent.value = themes[id].accent
  }

  function resetZoom() {
    zoom.value = defaults().zoom
  }

  // Le fichier de l'image de fond reste à supprimer par l'appelant (commande background_remove).
  function resetAll() {
    const initial = defaults()
    mode.value = initial.mode
    theme.value = initial.theme
    accent.value = initial.accent
    windowStyle.value = initial.windowStyle
    Object.assign(glass, initial.glass)
    Object.assign(background, initial.background)
    zoom.value = initial.zoom
    chatWidth.value = initial.chatWidth
    layout.value = initial.layout
    Object.assign(animations, initial.animations)
  }

  return {
    mode,
    theme,
    accent,
    resolvedMode,
    windowStyle,
    effectiveStyle,
    glass,
    background,
    backgroundOpacity,
    zoom,
    zoomFactor,
    chatWidth,
    layout,
    animations,
    applyTheme,
    fitToImage,
    stepZoom,
    resetZoom,
    resetGlass,
    resetBackground,
    resetAll,
    setBackground,
  }
})
