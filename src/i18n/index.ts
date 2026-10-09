import { createI18n } from 'vue-i18n'
import { systemLocales } from '@/ipc/system'
import en from './locales/en'
import es from './locales/es'
import fr from './locales/fr'
import ja from './locales/ja'
import ptBR from './locales/pt-BR'
import zhCN from './locales/zh-CN'

const messages = { en, es, fr, ja, 'pt-BR': ptBR, 'zh-CN': zhCN }

type Locale = keyof typeof messages

const locales = Object.keys(messages) as Locale[]

// Correspondance exacte d'abord (pt-BR), sinon par langue (fr-CA -> fr). Linux peut renvoyer fr_FR.UTF-8.
function matchLocale(tags: readonly string[]): Locale {
  for (const tag of tags) {
    const normalized = (tag.replace('_', '-').split(/[.@]/)[0] ?? '').toLowerCase()
    const language = normalized.split('-')[0]
    const match =
      locales.find((locale) => locale.toLowerCase() === normalized) ??
      locales.find((locale) => locale.split('-')[0]?.toLowerCase() === language)
    if (match) return match
  }
  return 'en'
}

export async function setupI18n() {
  // Hors Tauri (pnpm dev dans un navigateur), invoke échoue : on se rabat sur le navigateur.
  const tags = await systemLocales().catch(() => navigator.languages)
  const locale = matchLocale(tags)
  document.documentElement.lang = locale

  return createI18n<[typeof en], Locale, false>({
    legacy: false,
    locale,
    fallbackLocale: 'en',
    messages,
  })
}
