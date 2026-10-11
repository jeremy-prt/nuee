import { useI18n } from 'vue-i18n'
import { useToastsStore } from '@/stores/toasts'

// Bouton « Rétablir » : tout ce qu'il change ne se voit pas d'un coup d'œil, le message le confirme.
export function useResetToast() {
  const { t } = useI18n()
  const toasts = useToastsStore()
  return (what: 'shortcuts' | 'section' | 'all') =>
    toasts.push({ kind: 'success', title: t(`feedback.reset.${what}`), body: t(`feedback.reset.${what}Body`) })
}
