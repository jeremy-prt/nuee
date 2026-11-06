import { ref } from 'vue'
import { systemMachineName } from '@/ipc/system'

// Lu une fois par lancement : le nom de la machine ne change pas pendant que l'app tourne. Vide si le système le tait.
const name = ref('')
let loading: Promise<void> | null = null

export function useMachineName() {
  loading ??= systemMachineName()
    .catch(() => '')
    .then((value) => void (name.value = value))
  return name
}
