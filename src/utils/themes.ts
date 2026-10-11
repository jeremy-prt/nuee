// Un thème fixe la couleur d'accent : boutons principaux, liens, états (themeSignal) et le fond via « Couleur du fond ».
// Luminosités hautes : l'accent sert de texte (liens) sur le fond sombre et porte un texte sombre (boutons).
export const themes = {
  nuee: { hue: 240, saturation: 0, lightness: 92 },
  braise: { hue: 4, saturation: 80, lightness: 64 },
  ambre: { hue: 28, saturation: 90, lightness: 60 },
  // Trop clair pour un rond blanc d'interrupteur : il porte le fond sombre.
  soleil: { hue: 46, saturation: 92, lightness: 58, darkOnSignal: true },
  foret: { hue: 145, saturation: 52, lightness: 52 },
  azur: { hue: 211, saturation: 92, lightness: 62 },
  iris: { hue: 262, saturation: 80, lightness: 70 },
  pivoine: { hue: 330, saturation: 78, lightness: 67 },
} as const

export type ThemeId = keyof typeof themes
export const themeIds = Object.keys(themes) as ThemeId[]

export function themeAccent(id: ThemeId) {
  const { hue, saturation, lightness } = themes[id]
  return `hsl(${hue} ${saturation}% ${lightness}%)`
}

// Couleur des états (interrupteur allumé, focus, non lu) : un accent sans teinte se confondrait avec le texte.
const NEUTRAL_SIGNAL = 'hsl(211 92% 49%)'

export function themeSignal(id: ThemeId) {
  return themes[id].saturation === 0 ? NEUTRAL_SIGNAL : themeAccent(id)
}

// Ce qui se pose sur le signal (rond d'un interrupteur allumé) : blanc, sauf sur un signal trop clair (choix de Jérémy).
export function themeOnSignal(id: ThemeId) {
  return 'darkOnSignal' in themes[id] ? 'var(--color-canvas)' : 'hsl(0 0% 100%)'
}
