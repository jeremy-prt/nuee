<script setup lang="ts">
import { computed } from 'vue'
import BrowserAddressBar from '@/components/browser/BrowserAddressBar.vue'
import BrowserPage from '@/components/browser/BrowserPage.vue'
import ServerCards from '@/components/server/ServerCards.vue'
import { useTerminalChat } from '@/composables/useTerminalChat'
import { useBrowserStore } from '@/stores/browser'

// Volet Navigateur : l'adresse, puis la page de l'onglet choisi ; sans page, les serveurs du projet à lancer.
const browser = useBrowserStore()
const { chat } = useTerminalChat()
const tab = computed(() => (chat.value ? browser.activeOf(chat.value.id) : null))
const blank = computed(() => !tab.value || tab.value.url === 'about:blank')
</script>

<template>
  <div v-if="chat" class="flex min-h-0 flex-1 flex-col">
    <BrowserAddressBar :chat-id="chat.id" :tab="tab" />
    <BrowserPage v-if="tab && !blank" :key="tab.id" :tab="tab" />
    <ServerCards v-else />
  </div>
</template>
