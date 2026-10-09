import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from '@/App.vue'
import { setupI18n } from '@/i18n'
import { isMacosApp } from '@/ipc/system'
import '@/assets/css/main.css'

document.documentElement.classList.toggle('is-macos', isMacosApp())

setupI18n().then((i18n) => {
  createApp(App).use(createPinia()).use(i18n).mount('#app')
})
