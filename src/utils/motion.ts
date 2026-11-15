// Durée et courbe d'un mouvement lancé en JS, définies dans main.css (`--motion-*`). `prefers-reduced-motion` y met
// les durées à 0 : une durée nulle veut dire pas d'animation.
export type MotionSpeed = 'open' | 'close' | 'quick' | 'move' | 'launch'

// Le build minifie `240ms` en `.24s` : l'unité compte.
function toMs(value: string) {
  const n = parseFloat(value) || 0
  return value.trim().endsWith('ms') ? n : n * 1000
}

export function motion(speed: MotionSpeed): { duration: number; easing: string } {
  const style = getComputedStyle(document.documentElement)
  return {
    duration: toMs(style.getPropertyValue(`--motion-${speed}`)),
    easing: style.getPropertyValue('--motion-ease').trim() || 'ease-out',
  }
}
