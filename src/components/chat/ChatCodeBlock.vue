<script setup lang="ts">
import { Play, Stop } from '@/components/ui/icons'
import { computed, inject, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatCodeOutput from '@/components/chat/ChatCodeOutput.vue'
import ChatCopyButton from '@/components/chat/ChatCopyButton.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import { codeRunPlaceKey, useCodeRunsStore } from '@/stores/codeRuns'
import { runnableCommand } from '@/utils/shellCommand'

// Bloc de code d'une réponse. `block` : sa clé dans la réponse, donnée seulement quand ses commandes peuvent être
// lancées (réponse finie, dans une conversation). Le bouton Lancer n'existe que sur un bloc shell d'une seule commande,
// et la commande ne part que sur un clic.
const props = defineProps<{ code: string; lang?: string; block?: string }>()

const { t } = useI18n()
const runs = useCodeRunsStore()
const context = inject(codeRunPlaceKey, null)

const chatId = computed(() => (props.block && context ? context.value.chatId : null))
const command = computed(() => (chatId.value ? runnableCommand(props.lang, props.code) : null))
const run = computed(() => (chatId.value && props.block ? runs.get(chatId.value, props.block) : null))
const busy = computed(() => run.value?.status === 'running' || run.value?.status === 'stopping')
// Largeur des boutons du coin (28 px chacun, 2 px entre eux) : le texte s'estompe dessous.
const actionsWidth = computed(() => `${(command.value ? 58 : 28) + 8}px`)
// Texte brut (récapitulatif, markdown cité) : il revient à la ligne. Le vrai code garde ses lignes et défile.
const PROSE = new Set(['', 'text', 'txt', 'plaintext', 'markdown', 'md'])
const prose = computed(() => PROSE.has(props.lang?.trim().toLowerCase() ?? ''))

const actions = useTemplateRef('actions')

function dismiss(keyboard: boolean) {
  if (chatId.value && props.block) runs.dismiss(chatId.value, props.block)
  if (keyboard) actions.value?.querySelector('button')?.focus()
}

function toggle() {
  if (!context || !props.block || !command.value) return
  if (busy.value) runs.stop(context.value.chatId, props.block)
  else runs.start(context.value.chatId, context.value.place, props.block, command.value)
}
</script>

<template>
  <div class="my-2" dir="ltr">
    <div class="group/code relative rounded-md bg-selection/60">
      <!-- Texte qui revient à la ligne : une cale flottante sous les boutons, la première ligne passe à côté. -->
      <pre
        class="code-veil p-3 font-mono text-xs leading-relaxed group-hover/code:[--veil:0] group-focus-within/code:[--veil:0]"
        :class="[prose ? 'whitespace-pre-wrap wrap-anywhere' : 'overflow-x-auto', { '[--veil:0]': busy }]"
        :style="{ '--veil-width': actionsWidth }"
      ><span v-if="prose" class="float-end h-6" :style="{ width: actionsWidth }" aria-hidden="true" /><code>{{ code }}</code></pre>
      <div
        ref="actions"
        class="absolute end-2 top-2 flex gap-0.5 transition-opacity duration-(--hover-duration) group-hover/code:opacity-100 focus-within:opacity-100 motion-reduce:transition-none"
        :class="busy ? 'opacity-100' : 'opacity-0'"
      >
        <UiIconButton
          v-if="command"
          inner
          :label="busy ? t('chat.run.stop') : t('chat.run.start')"
          :loading="run?.status === 'stopping'"
          @click="toggle"
        >
          <Stop v-if="busy" class="size-3.5" aria-hidden="true" />
          <Play v-else class="size-3.5" aria-hidden="true" />
        </UiIconButton>
        <ChatCopyButton inner :text="() => code" :label="t('chat.copy.code')" />
      </div>
    </div>
    <ChatCodeOutput v-if="run && chatId && block" :run="run" @dismiss="dismiss" />
  </div>
</template>
