export const colorModes = ['system', 'light', 'dark'] as const
export type ColorMode = (typeof colorModes)[number]
export type ResolvedMode = Exclude<ColorMode, 'system'>

// Un thème teinte les fonds et le texte (teinte et saturation, d'après les palettes de monocode) et propose un accent.
// Encre pousse les fonds vers le noir pur en sombre et le blanc pur en clair.
interface ThemeShape {
  hue: number
  dark: number
  light: number
  accent: AccentId
  shift?: number
}

export const themes = {
  nuee: { hue: 240, dark: 0, light: 0, accent: 'nuee' },
  ardoise: { hue: 215, dark: 30, light: 36, accent: 'azur' },
  mousse: { hue: 120, dark: 13, light: 20, accent: 'foret' },
  cuivre: { hue: 22, dark: 20, light: 38, accent: 'ambre' },
  orchidee: { hue: 268, dark: 24, light: 32, accent: 'iris' },
  sable: { hue: 40, dark: 19, light: 44, accent: 'soleil' },
  rose: { hue: 342, dark: 18, light: 40, accent: 'pivoine' },
  encre: { hue: 240, dark: 0, light: 0, accent: 'nuee', shift: 5 },
} as const satisfies Record<string, ThemeShape>

export type ThemeId = keyof typeof themes
export const themeIds = Object.keys(themes) as ThemeId[]

// Luminosités par mode : en sombre, l'accent sert de texte (liens) et porte un texte sombre (boutons) ; en clair,
// l'inverse, d'où une version bien plus foncée. Neutre suit le texte (blanc en sombre, noir en clair), états compris :
// un bleu à côté des boutons blancs se lisait comme un second accent (choix de Jérémy).
export const accents = {
  nuee: { hue: 240, saturation: 0, dark: 92, light: 12 },
  braise: { hue: 4, saturation: 80, dark: 64, light: 48 },
  ambre: { hue: 28, saturation: 90, dark: 60, light: 45 },
  // Trop clair en sombre pour un rond blanc d'interrupteur : il porte le fond sombre.
  soleil: { hue: 46, saturation: 92, dark: 58, light: 38, darkOnSignal: true },
  foret: { hue: 145, saturation: 52, dark: 52, light: 33 },
  azur: { hue: 211, saturation: 92, dark: 62, light: 46 },
  iris: { hue: 262, saturation: 80, dark: 70, light: 55 },
  pivoine: { hue: 330, saturation: 78, dark: 67, light: 48 },
} as const

export type AccentId = keyof typeof accents
export const accentIds = Object.keys(accents) as AccentId[]
export function accentColor(id: AccentId, mode: ResolvedMode) {
  const accent = accents[id]
  return `hsl(${accent.hue} ${accent.saturation}% ${accent[mode]}%)`
}

// Ce qui se pose sur le signal (rond d'un interrupteur allumé) : blanc, sauf sur un signal trop clair (choix de Jérémy)
// et sur Neutre, qui a la couleur du texte.
export function onSignalColor(id: AccentId, mode: ResolvedMode) {
  if (id === 'nuee' || (mode === 'dark' && 'darkOnSignal' in accents[id])) return 'var(--color-canvas)'
  return 'hsl(0 0% 100%)'
}

function surface(theme: ThemeId, mode: ResolvedMode, lightness: number) {
  const { hue, [mode]: saturation, shift = 0 }: ThemeShape = themes[theme]
  const value = mode === 'dark' ? lightness - shift : lightness + shift
  return `hsl(${hue} ${saturation}% ${Math.max(0, Math.min(100, value))}%)`
}

// Fonds de la fenêtre selon la luminosité choisie dans Transparence (`veil`), fonds pleins et texte.
export function palette(theme: ThemeId, mode: ResolvedMode, veilLightness: number) {
  const { hue, [mode]: saturation } = themes[theme]
  const dark = mode === 'dark'
  return {
    veil: surface(theme, mode, veilLightness),
    canvas: surface(theme, mode, dark ? 9 : 100),
    overlay: surface(theme, mode, dark ? 14 : 100),
    content: `hsl(${hue} ${Math.round(saturation * (dark ? 0.4 : 0.5))}% ${dark ? 92 : 10}%)`,
  }
}
