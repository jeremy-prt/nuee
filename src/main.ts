import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from '@/App.vue'
import { setupI18n } from '@/i18n'
import { isMacosApp } from '@/ipc/system'
import '@/assets/css/main.css'

document.documentElement.classList.toggle('is-macos', isMacosApp())

// Pas de menu natif de la webview (Recharger, Inspecter) : un champ de saisie ou un texte sélectionné garde le sien
// (copier, coller). Les menus de l'app (UiContextMenu) s'ouvrent quand même, reka écoute avant ce point.
document.addEventListener('contextmenu', (event) => {
  const editable = event.target instanceof Element && event.target.closest('input, textarea, [contenteditable="true"]')
  if (!editable && document.getSelection()?.isCollapsed !== false) event.preventDefault()
})

setupI18n().then((i18n) => {
  createApp(App).use(createPinia()).use(i18n).mount('#app')
})
