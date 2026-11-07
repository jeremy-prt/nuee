<script setup lang="ts">
import { Globe, LoaderCircle, Plus, X } from '@/components/ui/icons'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import { useTerminalChat } from '@/composables/useTerminalChat'
import type { BrowserTab } from '@/ipc/bindings/BrowserTab'
import { useBrowserStore } from '@/stores/browser'

// Onglets du navigateur de la session, dans l'en-tête du volet ; « + » ouvre un onglet vide, prêt à recevoir une adresse.
const { t } = useI18n()
const browser = useBrowserStore()
const { chat } = useTerminalChat()

const list = computed(() => (chat.value ? browser.tabsOf(chat.value.id) : []))
const activeId = computed(() => (chat.value ? (browser.active[chat.value.id] ?? null) : null))

function label(tab: BrowserTab) {
  if (tab.title) return tab.title
  try {
    const url = new URL(tab.url)
    return url.protocol === 'about:' ? t('dock.browser.newTab') : url.host
  } catch {
    return tab.url
  }
}

async function create() {
  if (!chat.value) return
  const tab = await browser.open(chat.value.id, 'about:blank')
  if (tab) browser.focusAddress++
}
</script>

<template>
  <div class="flex min-w-0 shrink items-center gap-0.5" role="group" :aria-label="t('dock.browser.tabs')">
    <div
      v-for="tab in list"
      :key="tab.id"
      class="group/row relative flex h-7 max-w-40 min-w-20 shrink items-center rounded-md text-xs"
      :class="tab.id === activeId ? 'bg-selection text-content' : 'text-muted hover:bg-selection-hover hover:text-content'"
    >
      <button
        type="button"
        class="flex h-full min-w-0 items-center gap-1.5 rounded-md ps-2 pe-7 focus-visible:outline-2 focus-visible:outline-ring"
        :aria-current="tab.id === activeId ? 'true' : undefined"
        :title="tab.url"
        @click="chat && browser.select(chat.id, tab.id)"
      >
        <LoaderCircle v-if="tab.loading" class="size-3.5 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        <Globe v-else class="size-3.5 shrink-0" aria-hidden="true" />
        <span class="truncate">{{ label(tab) }}</span>
      </button>
      <UiIconButton
        inner
        class="absolute end-1 size-5! opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
        :class="{ 'opacity-100': tab.id === activeId }"
        :label="t('dock.browser.closeTab')"
        @click="browser.close(tab.id)"
      >
        <X class="size-3" aria-hidden="true" />
      </UiIconButton>
    </div>
    <UiIconButton v-if="chat" :label="t('dock.browser.newTab')" @click="create">
      <Plus class="size-4" aria-hidden="true" />
    </UiIconButton>
  </div>
</template>
