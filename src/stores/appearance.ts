import { defineStore } from 'pinia'
import { computed, reactive, ref, watch, watchEffect } from 'vue'
import { isMacosApp } from '@/ipc/system'
import { windowSetBlur } from '@/ipc/window'

export const windowStyles = ['transparent', 'mixed', 'opaque'] as const
export type WindowStyle = (typeof windowStyles)[number]

export const glassOptions = {
  opacity: ['low', 'medium', 'high'],
  centerOpacity: ['low', 'medium', 'high'],
  blur: ['none', 'low', 'medium', 'high'],
  lightness: ['dark', 'medium', 'light'],
  tint: ['none', 'light', 'strong'],
} as const
export type GlassSetting = keyof typeof glassOptions
export type Glass = { [K in GlassSetting]: (typeof glassOptions)[K][number] }

// Transparent garde un seul voile pour toute la fenêtre ; Opaque ne laisse rien voir, seul son fond se règle.
export function glassSettings(style: WindowStyle): GlassSetting[] {
  if (style === 'opaque') return ['lightness', 'tint']
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
// Part de la couleur d'accent dans le voile.
const TINT: Record<Glass['tint'], number> = { none: 0, light: 8, strong: 16 }

export interface GlassValues {
  chrome: number
  surface: number
  lightness: number
  tint: number
}

export function glassValues(style: WindowStyle, glass: Glass): GlassValues {
  const chrome = style === 'opaque' ? 100 : BARS_OPACITY[glass.opacity]
  const surface = style === 'mixed' ? CENTER_OPACITY[glass.centerOpacity] : chrome
  return { chrome, surface, lightness: LIGHTNESS[glass.lightness], tint: TINT[glass.tint] }
}

function blurRadius(glass: Glass) {
  return BLUR[glass.blur]
}

const STORAGE_KEY = 'nuee.appearance.v5'

function defaultGlass(): Glass {
  return { opacity: 'medium', centerOpacity: 'medium', blur: 'medium', lightness: 'medium', tint: 'none' }
}

interface AppearanceState {
  windowStyle: WindowStyle
  glass: Record<WindowStyle, Glass>
}

function defaults(): AppearanceState {
  return { windowStyle: 'mixed', glass: { transparent: defaultGlass(), mixed: defaultGlass(), opaque: defaultGlass() } }
}

function load(): AppearanceState {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (!saved) return defaults()
    const state = defaults()
    if (windowStyles.includes(saved.windowStyle)) state.windowStyle = saved.windowStyle
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
  const windowStyle = ref<WindowStyle>(state.windowStyle)
  const glass = reactive(state.glass)

  // Hors macOS, la fenêtre est toujours opaque : c'est le seul style qui s'applique.
  const effectiveStyle = computed<WindowStyle>(() => (isMacosApp() ? windowStyle.value : 'opaque'))
  const active = computed(() => glass[effectiveStyle.value])

  watchEffect(() => {
    const root = document.documentElement
    root.dataset.window = effectiveStyle.value
    const values = glassValues(effectiveStyle.value, active.value)
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
    [windowStyle, glass],
    () => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ windowStyle: windowStyle.value, glass }))
      } catch {
        // Stockage indisponible : le style reste valable pour la session.
      }
    },
    { deep: true },
  )

  function resetGlass(style: WindowStyle) {
    Object.assign(glass[style], defaultGlass())
  }

  return { windowStyle, effectiveStyle, glass, resetGlass }
})
