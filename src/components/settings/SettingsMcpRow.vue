<script setup lang="ts">
import { SlidersHorizontal, X } from '@/components/ui/icons'
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import UiButton from '@/components/ui/UiButton.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import { useRefocus } from '@/composables/useRefocus'
import { useNavigationStore } from '@/stores/navigation'
import { type McpServer, useSkillsStore } from '@/stores/skills'
import { mcpStatus } from '@/utils/mcp'

const props = defineProps<{ server: McpServer }>()

const { t } = useI18n()
const store = useSkillsStore()
const refocusAfter = useRefocus()
const navigation = useNavigationStore()
const hintId = useId()
const on = computed(() => store.serverOn(props.server))

const status = computed(() => mcpStatus(props.server, on.value, t))

const origin = computed(() => {
  const { scope, transport } = props.server
  if (!transport) return null
  return scope === 'plugin' ? `plugin · ${transport}` : transport
})
const action = computed(() => on.value && (props.server.status === 'needsAuth' || props.server.status === 'failed'))

// Connecté, le bouton disparaît : validé au clavier, le focus passe au bouton de réglages de la ligne.
function act(event: MouseEvent) {
  const { name, status } = props.server
  refocusAfter(event, () => (status === 'needsAuth' ? store.connect(name) : store.reconnect(name)), `[data-customize="mcp:${CSS.escape(name)}"]`)
}
</script>

<template>
  <div class="flex items-center gap-4 border-b border-stroke px-4 py-2 last:border-b-0">
    <div class="min-w-0 flex-1 transition-opacity motion-reduce:transition-none" :class="{ 'opacity-40': !on }">
      <p class="flex min-w-0 items-center gap-2">
        <span class="size-1.5 shrink-0 rounded-full" :class="status.tone" aria-hidden="true" />
        <span class="truncate text-sm font-medium" :title="server.target || undefined">{{ server.name }}</span>
      </p>
      <p :id="hintId" class="line-clamp-2 ps-3.5 text-xs/relaxed wrap-break-word text-muted" :title="server.error ?? (server.target || undefined)">
        <span :class="{ 'text-danger': on && server.status === 'failed' }">{{ status.text }}</span>
        <template v-if="origin"> · {{ origin }}</template>
      </p>
    </div>
    <template v-if="action">
      <UiIconButton v-if="store.logins.has(server.name)" :label="t('settings.skills.cancelConnect', { name: server.name })" @click="store.connect(server.name)">
        <X class="size-3.5" aria-hidden="true" />
      </UiIconButton>
      <UiButton
        size="xs"
        :loading="store.pending.has(server.name)"
        :aria-describedby="hintId"
        @click="act($event)"
      >
        {{ server.status === 'needsAuth' ? t('settings.skills.connect') : t('settings.skills.reconnect') }}
      </UiButton>
    </template>
    <UiIconButton
      :label="t('settings.skills.configure', { name: server.name })"
      :data-customize="`mcp:${server.name}`"
      @click="navigation.showSettingsDetail(`mcp:${server.name}`)"
    >
      <SlidersHorizontal class="size-3.5" aria-hidden="true" />
    </UiIconButton>
    <UiSwitch
      :model-value="on"
      :disabled="store.serverLocked(server) || store.pending.has(server.name)"
      :label="t('settings.skills.use', { name: server.name })"
      :aria-describedby="hintId"
      @update:model-value="store.setServer(server, $event)"
    />
  </div>
</template>
