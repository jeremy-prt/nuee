<script setup lang="ts">
import { nextTick, onScopeDispose, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { agentTaskOutput } from '@/ipc/agent'

// Fin de la sortie d'une commande en arrière-plan, relue toutes les secondes tant qu'elle tourne. Le bas reste en vue
// tant que l'utilisateur n'est pas remonté.
const props = defineProps<{ chatId: string; taskId: string; running: boolean }>()

const POLL = 1000

const { t } = useI18n()
const output = ref<string | null | undefined>(undefined)
const box = useTemplateRef('box')

// Une lecture à la fois ; une réponse en retard ou en échec garde la sortie déjà affichée.
let reading = false
async function read() {
  if (reading) return
  reading = true
  const el = box.value
  const atEnd = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 16
  try {
    output.value = await agentTaskOutput(props.chatId, props.taskId)
  } catch {
    output.value ??= null
  } finally {
    reading = false
  }
  await nextTick()
  if (atEnd && box.value) box.value.scrollTop = box.value.scrollHeight
}

let timer = 0
watch(
  () => props.running,
  (running) => {
    clearInterval(timer)
    read()
    if (running) timer = window.setInterval(read, POLL)
  },
  { immediate: true },
)
onScopeDispose(() => clearInterval(timer))
</script>

<template>
  <pre
    v-if="output"
    ref="box"
    class="max-h-56 overflow-auto rounded-md bg-selection/40 p-2 font-mono text-[11px] whitespace-pre-wrap break-words text-muted select-text"
  >{{ output }}</pre>
  <p v-else-if="output === null" class="text-muted">{{ t('dock.tasks.outputGone') }}</p>
  <p v-else-if="output !== undefined || running" class="text-muted">{{ t('dock.tasks.noOutput') }}</p>
</template>
