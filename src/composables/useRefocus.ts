import { nextTick } from 'vue'

// Validé au clavier, un bouton qui disparaît une fois son action finie laisserait le focus tomber sur la page :
// il passe à un voisin stable (règle d'archi). À la souris, rien ne bouge.
export function useRefocus() {
  return async function refocusAfter(event: MouseEvent, action: () => unknown, selector: string) {
    const byKeyboard = event.detail === 0
    await action()
    if (!byKeyboard) return
    await nextTick()
    const active = document.activeElement
    if (active && active !== document.body && active.isConnected) return
    document.querySelector<HTMLElement>(selector)?.focus()
  }
}
