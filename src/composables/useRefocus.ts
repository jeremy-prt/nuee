import { nextTick } from 'vue'

// Validé au clavier, un bouton qui disparaît une fois son action finie laisserait le focus tomber sur la page :
// il passe à un voisin stable (règle d'archi). À la souris, rien ne bouge. `event` : le clic, ou si l'action vient
// du clavier (entrée de menu).
export function useRefocus() {
  return async function refocusAfter(event: MouseEvent | boolean, action: () => unknown, selector: string) {
    const byKeyboard = typeof event === 'boolean' ? event : event.detail === 0
    await action()
    if (!byKeyboard) return
    await nextTick()
    const active = document.activeElement
    if (active && active !== document.body && active.isConnected) return
    document.querySelector<HTMLElement>(selector)?.focus()
  }
}
