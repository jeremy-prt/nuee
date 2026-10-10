import { createI18n } from 'vue-i18n'
import { systemLocales } from '@/ipc/system'
import en from './locales/en'
import es from './locales/es'
import fr from './locales/fr'
import ja from './locales/ja'
import ptBR from './locales/pt-BR'
import zhCN from './locales/zh-CN'

const messages = { en, es, fr, ja, 'pt-BR': ptBR, 'zh-CN': zhCN }

export type Locale = keyof typeof messages

export const locales = Object.keys(messages) as Locale[]

// Chaque langue sous son propre nom : on doit pouvoir retrouver la sienne depuis n'importe laquelle.
export const localeNames: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  ja: '日本語',
  'pt-BR': 'Português (Brasil)',
  'zh-CN': '简体中文',
}

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

function create(locale: Locale) {
  return createI18n<[typeof en], Locale, false>({
    legacy: false,
    locale,
    fallbackLocale: 'en',
    messages,
  })
}

let instance: ReturnType<typeof create> | null = null
let systemLocale: Locale = 'en'

export async function setupI18n() {
  // Hors Tauri (pnpm dev dans un navigateur), invoke échoue : on se rabat sur le navigateur.
  const tags = await systemLocales().catch(() => navigator.languages)
  systemLocale = matchLocale(tags)
  document.documentElement.lang = systemLocale
  instance = create(systemLocale)
  return instance
}

export function getSystemLocale() {
  return systemLocale
}

// Pour les stores, qui vivent hors des composants et n'ont pas accès à useI18n.
export function i18nGlobal() {
  if (!instance) throw new Error('i18n non initialisé')
  return instance.global
}

export function setLocale(choice: Locale | 'auto') {
  const locale = choice === 'auto' ? systemLocale : choice
  i18nGlobal().locale.value = locale
  document.documentElement.lang = locale
}
