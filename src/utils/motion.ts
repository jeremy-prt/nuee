// Durée et courbe d'un mouvement lancé en JS, définies dans main.css (`--motion-*`). `prefers-reduced-motion` y met
// les durées à 0 : une durée nulle veut dire pas d'animation.
export type MotionSpeed = 'open' | 'close' | 'quick' | 'move' | 'launch'

export function motion(speed: MotionSpeed): { duration: number; easing: string } {
  const style = getComputedStyle(document.documentElement)
  return {
    duration: parseFloat(style.getPropertyValue(`--motion-${speed}`)) || 0,
    easing: style.getPropertyValue('--motion-ease').trim() || 'ease-out',
  }
}
