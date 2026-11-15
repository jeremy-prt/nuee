import { nextTick, watch } from 'vue'
import { backgroundReady } from '@/composables/useBackgroundImage'
import { anyPending } from '@/composables/useSlow'
import { isTauriApp } from '@/ipc/system'
import { INTENSITY_LEVEL, useAppearanceStore } from '@/stores/appearance'
import { useConversationsStore } from '@/stores/conversations'
import { useWorkspaceStore } from '@/stores/workspace'

// Le temps que l'éventail s'ouvre : sur un Mac rapide, le logo part dès ce moment.
const MIN_SHOWN = 700
// Jamais bloqué derrière le logo : passé ce délai, l'app s'affiche avec ce qui est chargé.
const MAX_SHOWN = 10000
// Montée de l'app puis fondu du cache (index.html).
const EXIT = 800

function until(condition: () => boolean) {
  if (condition()) return Promise.resolve()
  return new Promise<void>((resolve) => {
    const stop = watch(condition, (met) => {
      if (!met) return
      stop()
      resolve()
    })
  })
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

// Rust pose `boot-shown` sur <html> juste après avoir affiché la fenêtre (lib.rs) : l'animation du logo et sa durée
// minimale partent de là. Hors de l'app, pas de fenêtre à attendre.
export function whenShown() {
  const root = document.documentElement
  if (!isTauriApp()) root.classList.add('boot-shown')
  if (root.classList.contains('boot-shown')) return Promise.resolve()
  return new Promise<void>((resolve) => window.addEventListener('boot-shown', () => resolve(), { once: true }))
}

async function shownFor(ms: number) {
  await whenShown()
  await delay(ms)
}

async function appReady() {
  const workspace = useWorkspaceStore()
  const conversations = useConversationsStore()
  const { path, effect, intensity } = useAppearanceStore().background
  await Promise.all([until(() => workspace.ready), path && backgroundReady(path, effect, INTENSITY_LEVEL[intensity]), document.fonts.ready])
  // Les chats affichés lisent leur historique au montage, qui suit le chargement des onglets.
  await nextTick()
  await until(() => workspace.panes.every((id) => conversations.find(id)?.loaded !== false))
  // Ce qui se monte une fois l'historique lu (champ de saisie et son sélecteur de modèle) lance ses propres
  // chargements : on attend qu'aucun squelette ne reste, deux images de suite.
  do {
    await nextTick()
    await until(() => !anyPending())
    await new Promise(requestAnimationFrame)
  } while (anyPending())
}

// Retire en fondu le logo d'index.html une fois l'app chargée et peinte dessous, au lieu de montrer des squelettes.
export function useBootSplash() {
  const splash = document.getElementById('boot-splash')
  if (!splash) return
  Promise.race([Promise.all([appReady(), shownFor(MIN_SHOWN)]), delay(MAX_SHOWN)]).then(() => {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        // Les lames se replient depuis l'endroit où l'animation les a laissées, pas depuis l'éventail ouvert.
        for (const element of splash.querySelectorAll<SVGElement>('.lead, .blade')) element.style.transform = getComputedStyle(element).transform
        splash.classList.add('boot-out')
        setTimeout(() => splash.remove(), EXIT)
      }),
    )
  })
}
