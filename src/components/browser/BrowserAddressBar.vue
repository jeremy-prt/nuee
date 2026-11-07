<script setup lang="ts">
import { ChevronLeft, ChevronRight, MousePointer, RefreshCw, X } from '@/components/ui/icons'
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import type { BrowserTab } from '@/ipc/bindings/BrowserTab'
import { useBrowserStore } from '@/stores/browser'
import { useConversationsStore } from '@/stores/conversations'
import { agents } from '@/utils/agents'

// Précédent, suivant, recharger et l'adresse de l'onglet ; sans onglet, l'adresse tapée en ouvre un.
const props = defineProps<{ chatId: string; tab: BrowserTab | null }>()

const { t } = useI18n()
const browser = useBrowserStore()
const conversations = useConversationsStore()
const input = ref<HTMLInputElement | null>(null)
const draft = ref('')
const editing = ref(false)

const shown = computed(() => {
  const url = props.tab?.url ?? ''
  return url === 'about:blank' ? '' : url
})
watch(shown, (url) => {
  if (!editing.value) draft.value = url
}, { immediate: true })

watch(
  () => browser.focusAddress,
  () => nextTick(() => input.value?.select()),
)

const action = computed(() => (props.tab ? (browser.agent[props.tab.id] ?? null) : null))
const agentName = computed(() => agents[conversations.find(props.chatId)?.agent ?? 'claude'].name)

function submit() {
  const url = draft.value.trim()
  if (!url) return
  editing.value = false
  input.value?.blur()
  if (props.tab) browser.navigate(props.tab.id, url)
  else browser.open(props.chatId, url)
}

function cancel() {
  editing.value = false
  draft.value = shown.value
  input.value?.blur()
}

function reload() {
  if (props.tab) browser.history(props.tab.id, props.tab.loading ? 'stop' : 'reload')
}
</script>

<template>
  <div class="flex h-10 shrink-0 items-center gap-0.5 border-b border-stroke ps-2 pe-3.5">
    <UiIconButton :label="t('dock.browser.back')" :disabled="!tab?.canBack" @click="tab && browser.history(tab.id, 'back')">
      <ChevronLeft class="size-4 rtl:rotate-180" aria-hidden="true" />
    </UiIconButton>
    <UiIconButton :label="t('dock.browser.forward')" :disabled="!tab?.canForward" @click="tab && browser.history(tab.id, 'forward')">
      <ChevronRight class="size-4 rtl:rotate-180" aria-hidden="true" />
    </UiIconButton>
    <UiIconButton :label="tab?.loading ? t('dock.browser.stop') : t('dock.browser.reload')" :disabled="!tab" @click="reload">
      <X v-if="tab?.loading" class="size-3.5" aria-hidden="true" />
      <RefreshCw v-else class="size-3.5" aria-hidden="true" />
    </UiIconButton>
    <form class="ms-1 flex min-w-0 flex-1" @submit.prevent="submit">
      <input
        ref="input"
        v-model="draft"
        data-control
        type="text"
        inputmode="url"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        spellcheck="false"
        class="h-7 min-w-24 flex-1 rounded-md border border-stroke bg-selection/50 px-2.5 text-xs text-content outline-none placeholder:text-muted focus:border-stroke-focus"
        :placeholder="t('dock.browser.address')"
        :aria-label="t('dock.browser.addressLabel')"
        @focus="editing = true; input?.select()"
        @blur="editing = false"
        @keydown.escape.stop="cancel"
      />
    </form>
    <!-- L'agent agit dans la page : on le suit sans quitter le volet, et on peut reprendre la main à tout moment. -->
    <span
      v-if="action"
      class="ms-1.5 flex max-w-36 min-w-0 items-center gap-1.5 rounded-md bg-signal/15 px-2 py-1 text-xs text-signal-text"
      role="status"
      :title="t('dock.browser.agentActs', { agent: agentName, action })"
    >
      <MousePointer class="size-3.5 shrink-0" aria-hidden="true" />
      <span class="truncate">{{ action }}</span>
      <span class="sr-only">{{ agentName }}</span>
    </span>
  </div>
</template>
