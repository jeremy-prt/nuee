import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from '@/App.vue'
import { whenShown } from '@/composables/useBootSplash'
import { setupI18n } from '@/i18n'
import { isMacosApp } from '@/ipc/system'
import { bootAppearance } from '@/stores/appearance'
import '@/assets/css/main.css'

document.documentElement.classList.toggle('is-macos', isMacosApp())
const boot = bootAppearance()
document.documentElement.dataset.mode = boot.mode
document.documentElement.dataset.window = boot.window
document.documentElement.style.setProperty('--color-veil', boot.veil)

// Pas de menu natif de la webview (Recharger, Inspecter). Un champ de saisie ou un texte sélectionné ouvre celui de
// l'app (`UiTextMenu`). Les menus propres à un élément (UiContextMenu) passent avant, reka écoute avant ce point.
document.addEventListener('contextmenu', (event) => {
  const editable = event.target instanceof Element && event.target.closest('input, textarea, [contenteditable="true"]')
  if (!editable && document.getSelection()?.isCollapsed !== false) event.preventDefault()
})

// Le montage occupe la page plusieurs centaines de millisecondes : il attend que la fenêtre affiche l'écran de
// démarrage, sinon elle s'ouvre grise.
const splashPainted = whenShown().then(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))

Promise.all([setupI18n(), splashPainted]).then(([i18n]) => {
  createApp(App).use(createPinia()).use(i18n).mount('#app')
})
