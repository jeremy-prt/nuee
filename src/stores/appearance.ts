import { defineStore } from 'pinia'
import { computed, reactive, ref, watch, watchEffect } from 'vue'
import { isMacosApp, isTauriApp } from '@/ipc/system'
import { windowSetBlur, windowSetZoom } from '@/ipc/window'
import { type ThemeId, themeAccent, themeIds } from '@/utils/themes'

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
// Moyenne est calée sur monocode à ~67 % de voile : on voit le bureau, le texte reste lisible. Le centre
// de Mixte reste au-dessus du cadre, sinon Mixte deviendrait un second Transparent.
const BARS_OPACITY: Record<Glass['opacity'], number> = { low: 45, medium: 66, high: 82 }
const CENTER_OPACITY: Record<Glass['centerOpacity'], number> = { low: 76, medium: 82, high: 92 }
const BLUR: Record<Glass['blur'], number> = { none: 0, low: 24, medium: 48, high: 72 }
// Luminosité du voile, en % (celle du fond opaque est de 9 %).
const LIGHTNESS: Record<Glass['lightness'], number> = { dark: 5, medium: 9, light: 14 }

// Le thème colore l'accent seul, ou toute l'interface : le voile du fond et les éléments actifs ou survolés.
export const themeScopes = ['accent', 'full'] as const
export type ThemeScope = (typeof themeScopes)[number]
export const themeIntensities = ['light', 'strong'] as const
export type ThemeIntensity = (typeof themeIntensities)[number]
// Part de l'accent dans le voile du fond et dans les fonds d'éléments actifs (survol un cran en dessous).
const THEME_TINT: Record<ThemeIntensity, { veil: number; selection: number; hover: number }> = {
  light: { veil: 8, selection: 18, hover: 12 },
  strong: { veil: 16, selection: 26, hover: 18 },
}

export function veilTint(scope: ThemeScope, intensity: ThemeIntensity) {
  return scope === 'full' ? THEME_TINT[intensity].veil : 0
}

export interface GlassValues {
  chrome: number
  surface: number
  lightness: number
  tint: number
}

function glassValues(style: WindowStyle, glass: Glass, tint: number): GlassValues {
  const chrome = style === 'opaque' ? 100 : BARS_OPACITY[glass.opacity]
  const surface = style === 'mixed' ? CENTER_OPACITY[glass.centerOpacity] : chrome
  return { chrome, surface, lightness: LIGHTNESS[glass.lightness], tint }
}

function blurRadius(glass: Glass) {
  return BLUR[glass.blur]
}

// Image de fond de la zone centrale : effets décrits dans utils/backgroundEffects.ts.
export const backgroundEffects = ['none', 'blur', 'fade', 'dither', 'ascii', 'halftone', 'scanlines', 'pixelate'] as const
export type BackgroundEffect = (typeof backgroundEffects)[number]
export const backgroundOptions = {
  where: ['chats', 'everywhere'],
  visibility: ['low', 'medium', 'high'],
  intensity: ['low', 'medium', 'high'],
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
}
export const BACKGROUND_OPACITY: Record<Background['visibility'], number> = { low: 18, medium: 32, high: 50 }

function defaultBackground(path: string | null): Background {
  return { path, effect: 'none', where: 'everywhere', visibility: 'low', intensity: 'medium' }
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

const STORAGE_KEY = 'nuee.appearance.v8'

function defaultGlass(): Glass {
  return { opacity: 'medium', centerOpacity: 'medium', blur: 'medium', lightness: 'medium' }
}

interface AppearanceState {
  theme: ThemeId
  themeScope: ThemeScope
  themeIntensity: ThemeIntensity
  windowStyle: WindowStyle
  glass: Record<WindowStyle, Glass>
  background: Background
  zoom: ZoomLevel
  chatWidth: ChatWidth
}

function defaults(): AppearanceState {
  return {
    theme: 'nuee',
    themeScope: 'accent',
    themeIntensity: 'light',
    windowStyle: 'mixed',
    glass: { transparent: defaultGlass(), mixed: defaultGlass(), opaque: defaultGlass() },
    background: defaultBackground(null),
    zoom: 100,
    chatWidth: 'normal',
  }
}

function load(): AppearanceState {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (!saved) return defaults()
    const state = defaults()
    if (themeIds.includes(saved.theme)) state.theme = saved.theme
    if (themeScopes.includes(saved.themeScope)) state.themeScope = saved.themeScope
    if (themeIntensities.includes(saved.themeIntensity)) state.themeIntensity = saved.themeIntensity
    if (windowStyles.includes(saved.windowStyle)) state.windowStyle = saved.windowStyle
    if (zoomLevels.includes(saved.zoom)) state.zoom = saved.zoom
    if (chatWidths.includes(saved.chatWidth)) state.chatWidth = saved.chatWidth
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
  const theme = ref<ThemeId>(state.theme)
  const themeScope = ref<ThemeScope>(state.themeScope)
  const themeIntensity = ref<ThemeIntensity>(state.themeIntensity)
  const windowStyle = ref<WindowStyle>(state.windowStyle)
  const glass = reactive(state.glass)
  const background = reactive(state.background)
  const zoom = ref<ZoomLevel>(state.zoom)
  const chatWidth = ref<ChatWidth>(state.chatWidth)

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

  // Hors macOS, la fenêtre est toujours opaque : c'est le seul style qui s'applique.
  const effectiveStyle = computed<WindowStyle>(() => (isMacosApp() ? windowStyle.value : 'opaque'))
  const active = computed(() => glass[effectiveStyle.value])

  watchEffect(() => {
    const root = document.documentElement
    root.dataset.window = effectiveStyle.value
    root.dataset.themeScope = themeScope.value
    root.style.setProperty('--color-accent', themeAccent(theme.value))
    root.style.setProperty('--selection-tint', `${THEME_TINT[themeIntensity.value].selection}%`)
    root.style.setProperty('--selection-hover-tint', `${THEME_TINT[themeIntensity.value].hover}%`)
    const values = glassValues(effectiveStyle.value, active.value, veilTint(themeScope.value, themeIntensity.value))
    root.style.setProperty('--chrome-alpha', `${values.chrome}%`)
    root.style.setProperty('--surface-alpha', `${values.surface}%`)
    root.style.setProperty('--veil-lightness', `${values.lightness}%`)
    root.style.setProperty('--veil-tint', `${values.tint}%`)
  })

  watch(
    () => (effectiveStyle.value === 'opaque' ? 0 : blurRadius(active.value)),
    (radius) => {
      if (isMacosApp()) windowSetBlur(radius).catch(() => {})
    },
    { immediate: true },
  )

  watch(
    [theme, themeScope, themeIntensity, windowStyle, glass, background, zoom, chatWidth],
    () => {
      const saved = {
        theme: theme.value,
        themeScope: themeScope.value,
        themeIntensity: themeIntensity.value,
        windowStyle: windowStyle.value,
        glass,
        background,
        zoom: zoom.value,
        chatWidth: chatWidth.value,
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

  function resetTheme() {
    themeScope.value = 'accent'
    themeIntensity.value = 'light'
  }

  // Le fichier de l'image de fond reste à supprimer par l'appelant (commande background_remove).
  function resetAll() {
    const initial = defaults()
    theme.value = initial.theme
    themeScope.value = initial.themeScope
    themeIntensity.value = initial.themeIntensity
    windowStyle.value = initial.windowStyle
    Object.assign(glass, initial.glass)
    Object.assign(background, initial.background)
    zoom.value = initial.zoom
    chatWidth.value = initial.chatWidth
  }

  return {
    theme,
    themeScope,
    themeIntensity,
    windowStyle,
    effectiveStyle,
    glass,
    background,
    zoom,
    zoomFactor,
    chatWidth,
    stepZoom,
    resetGlass,
    resetTheme,
    resetBackground,
    resetAll,
    setBackground,
  }
})
