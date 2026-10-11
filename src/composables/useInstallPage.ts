import { useI18n } from 'vue-i18n'
import { isAppError } from '@/ipc/agent'
import { type InstallTool, installOpen } from '@/ipc/install'
import { useToastsStore } from '@/stores/toasts'

// Bouton « Installer » d'un outil absent : ouvre sa page officielle, et le dit si le navigateur ne s'ouvre pas.
export function useInstallPage() {
  const { t } = useI18n()
  const toasts = useToastsStore()

  return function open(tool: InstallTool) {
    installOpen(tool).catch((error) => {
      toasts.push({ kind: 'error', title: t('settings.install.openFailed'), body: isAppError(error) ? error.message : String(error) })
    })
  }
}
