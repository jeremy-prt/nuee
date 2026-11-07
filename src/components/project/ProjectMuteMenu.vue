<script setup lang="ts">
import { Bell, BellOff } from '@/components/ui/icons'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import UiMenuChoices from '@/components/ui/UiMenuChoices.vue'
import UiMenuSub from '@/components/ui/UiMenuSub.vue'
import { type ContextSettings, type MuteKind, muteEnd, useProjectsStore } from '@/stores/projects'
import { formatUntil } from '@/utils/duration'

// Sous-menu Notifications d'un projet, ou de « Cet ordinateur » (projectId null).
const props = defineProps<{ settings: ContextSettings; projectId: string | null }>()

const { t, locale } = useI18n()
const projects = useProjectsStore()

const muted = computed(() => projects.isMuted(props.projectId))
const muteValue = computed(() => (muted.value ? (props.settings.muted?.kind ?? 'on') : 'on'))
// Sous chaque durée, l'heure de reprise : celle en cours pour le choix actif, sinon celle qu'il donnerait maintenant.
const muteOptions = computed(() =>
  (['on', 'hour', 'tomorrow', 'always'] as const).map((value) => {
    const until = value === 'on' ? null : value === muteValue.value ? props.settings.muted!.until : muteEnd(value, projects.now)
    const hint = until === null ? undefined : t('settings.projects.muteUntil', { time: formatUntil(until, projects.now, locale.value) })
    return { value, label: t(`settings.projects.mute.${value}`), hint }
  }),
)

function pickMute(value: string) {
  projects.mute(props.settings, value === 'on' ? null : (value as MuteKind))
}
</script>

<template>
  <UiMenuSub :label="t('settings.projects.notifications')" :icon="muted ? BellOff : Bell">
    <UiMenuChoices :section="{ id: 'mute', value: muteValue, options: muteOptions }" @select="pickMute" />
  </UiMenuSub>
</template>
