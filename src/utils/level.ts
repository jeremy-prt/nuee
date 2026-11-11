// Ton d'une jauge (contexte, quota) : neutre, puis avertissement, puis danger. `bar` pour un fond, `text` pour un
// texte ou un trait en currentColor ; `alert` dit si le chiffre affiché doit prendre la couleur.
const TONES = {
  normal: { bar: 'bg-muted', text: 'text-muted', alert: false },
  warning: { bar: 'bg-warning', text: 'text-warning', alert: true },
  danger: { bar: 'bg-danger', text: 'text-danger', alert: true },
}

function levelTone(ratio: number, warnAt: number, dangerAt: number) {
  return ratio >= dangerAt ? TONES.danger : ratio >= warnAt ? TONES.warning : TONES.normal
}

export const contextTone = (ratio: number) => levelTone(ratio, 0.75, 0.9)

// Même seuil que le bandeau de limite (`ChatLimitSoon`) ; rouge seulement une fois le quota épuisé.
export const quotaTone = (ratio: number) => levelTone(ratio, 0.8, 1)
