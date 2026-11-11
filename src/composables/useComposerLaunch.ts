import { nextTick } from 'vue'
import { motion } from '@/utils/motion'

// Premier message d'une session vierge, comme monocode : le champ descend de l'accueil centré jusqu'au bas de la
// conversation et le message monte de là à sa place, au lieu d'un saut. Le champ d'arrivée peut être un autre élément
// (« Nouvel espace de travail » bascule sur la vue des sessions) : il se retrouve par l'id de la session.
function composerOf(chatId: string) {
  return [...document.querySelectorAll<HTMLElement>(`[data-composer="${chatId}"]`)].find((element) => !element.closest('.view-parked'))
}

export function useComposerLaunch() {
  // À appeler avant que le DOM ne change : la place de départ se lit tout de suite, l'arrivée après la mise à jour.
  return function launch(chatId: string) {
    const timing = motion('move')
    const from = timing.duration ? composerOf(chatId)?.getBoundingClientRect() : undefined
    if (!from) return
    nextTick(() => {
      const composer = composerOf(chatId)
      if (!composer) return
      const to = composer.getBoundingClientRect()
      const dx = from.left + from.width / 2 - (to.left + to.width / 2)
      const dy = from.top - to.top
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return
      composer.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], timing)
      const message = [...(composer.closest('[data-chat-pane]')?.querySelectorAll<HTMLElement>('[data-user-row]') ?? [])].at(-1)
      if (!message) return
      const rise = from.top - message.getBoundingClientRect().top
      message.animate([{ opacity: 0, transform: `translateY(${rise}px)` }, { opacity: 1, transform: 'none' }], timing)
    })
  }
}
