import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from '@/App.vue'
import { setupI18n } from '@/i18n'
import '@/assets/css/main.css'

setupI18n().then((i18n) => {
  createApp(App).use(createPinia()).use(i18n).mount('#app')
})
