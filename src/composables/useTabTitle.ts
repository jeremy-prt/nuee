import { useI18n } from 'vue-i18n'
import type { Tab } from '@/stores/workspace'

export function useTabTitle() {
  const { t } = useI18n()

  function tabTitle(tab: Tab) {
    return tab.title ?? t('workspace.chatTitle', { n: tab.number })
  }

  return { tabTitle }
}
