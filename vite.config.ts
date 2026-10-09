import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite'

// TAURI_DEV_HOST n'est défini que pour `tauri android|ios dev` sur un appareil physique.
const host = process.env.TAURI_DEV_HOST

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    // Traductions précompilées au build : le compilateur de messages ne part pas dans le bundle.
    VueI18nPlugin({
      include: [fileURLToPath(new URL('./src/i18n/locales/**', import.meta.url))],
      compositionOnly: true,
      dropMessageCompiler: true,
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // Garde les erreurs Rust visibles dans le terminal de `tauri dev`.
  clearScreen: false,
  server: {
    // Tauri attend ce port fixe (devUrl dans tauri.conf.json).
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
})
