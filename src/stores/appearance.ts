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
  type ThemeId,
  themeIds,
  themes,
} from '@/utils/themes'

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
// deviendrait un second Transparent.
const BARS_OPACITY: Record<Glass['opacity'], number> = { low: 45, medium: 72, high: 82 }
const CENTER_OPACITY: Record<Glass['centerOpacity'], number> = { low: 80, medium: 88, high: 94 }
const BLUR: Record<Glass['blur'], number> = { none: 0, low: 24, medium: 48, high: 72 }
const LIGHTNESS: Record<ResolvedMode, Record<Glass['lightness'], number>> = {
  dark: { dark: 5, medium: 10, light: 14 },
  light: { dark: 92, medium: 96, light: 99 },
}

export interface GlassValues {
  chrome: number
  surface: number
}

function glassValues(style: WindowStyle, glass: Glass): GlassValues {
  const chrome = style === 'opaque' ? 100 : BARS_OPACITY[glass.opacity]
  const surface = style === 'mixed' ? CENTER_OPACITY[glass.centerOpacity] : chrome
  return { chrome, surface }
}

function blurRadius(glass: Glass) {
  return BLUR[glass.blur]
}

// Image de fond de la zone centrale : effets décrits dans utils/backgroundEffects.ts.
export const backgroundEffects = ['none', 'dither', 'ascii', 'halftone', 'scanlines', 'pixelate'] as const
export type BackgroundEffect = (typeof backgroundEffects)[number]
export const backgroundOptions = {
  where: ['chats', 'everywhere'],
  visibility: ['low', 'medium', 'high'],
  intensity: ['low', 'medium', 'high'],
  blur: ['low', 'medium', 'high'],
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
// Discrète = l'opacité par défaut de monocode, dont Jérémy aime le rendu.
export const BACKGROUND_OPACITY: Record<Background['visibility'], number> = { low: 24, medium: 36, high: 52 }

function defaultBackground(path: string | null): Background {
  return { path, effect: 'scanlines', where: 'everywhere', visibility: 'low', intensity: 'low', blur: 'medium' }
}

export const zoomLevels = [80, 90, 100, 110, 125, 150] as const
export type ZoomLevel = (typeof zoomLevels)[number]

export const chatWidths = ['normal', 'wide', 'full'] as const
export type ChatWidth = (typeof chatWidths)[number]
// En proportion de la zone du chat (le % d'un max-width se rapporte au parent), bornée : jamais sous
// 640 px tant que la zone le permet, pour qu'une petite fenêtre ne donne pas une colonne minuscule,
// ni trop large sur un grand écran. La fenêtre elle-même ne descend pas sous 800 × 500 (tauri.conf.json).
const CHAT_WIDTH: Record<ChatWidth, string> = {
  normal: 'clamp(40rem, 60%, 56rem)',
  wide: 'clamp(40rem, 80%, 80rem)',
  full: '100%',
}

// Projets dans la colonne de gauche, ou dans un menu en haut à gauche avec l'espace de travail en carte.
export const appLayouts = ['columns', 'menu'] as const
export type AppLayout = (typeof appLayouts)[number]

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
}

function defaults(): AppearanceState {
  return {
    mode: 'dark',
    theme: 'nuee',
    accent: 'nuee',
    windowStyle: 'mixed',
    glass: { transparent: defaultGlass(), mixed: defaultGlass(), opaque: defaultGlass() },
    background: defaultBackground(null),
    zoom: 100,
    chatWidth: 'normal',
    layout: 'menu',
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

  watchEffect(() => {
    const root = document.documentElement
    const resolved = resolvedMode.value
    root.dataset.window = effectiveStyle.value
    root.dataset.mode = resolved
    const colors = palette(theme.value, resolved, LIGHTNESS[resolved][active.value.lightness])
    root.style.setProperty('--color-canvas', colors.canvas)
    root.style.setProperty('--color-overlay', colors.overlay)
    root.style.setProperty('--color-content', colors.content)
    root.style.setProperty('--color-veil', colors.veil)
    root.style.setProperty('--color-accent', accentColor(accent.value, resolved))
    root.style.setProperty('--color-on-signal', onSignalColor(accent.value, resolved))
    const values = glassValues(effectiveStyle.value, active.value)
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
    [mode, theme, accent, windowStyle, glass, background, zoom, chatWidth, layout],
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
    zoom,
    zoomFactor,
    chatWidth,
    layout,
    applyTheme,
    stepZoom,
    resetZoom,
    resetGlass,
    resetBackground,
    resetAll,
    setBackground,
  }
})
