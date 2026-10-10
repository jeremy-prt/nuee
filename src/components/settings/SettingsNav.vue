<script setup lang="ts">
import { Archive, Bot, Keyboard, Palette, Plug, SlidersHorizontal, Sparkles } from '@lucide/vue'
import { onMounted, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import ShellRailItem from '@/components/shell/ShellRailItem.vue'
import { useLayoutStore } from '@/stores/layout'
import { useNavigationStore } from '@/stores/navigation'
import { type SettingsSection, settingsGroups } from '@/utils/settings'

const { t } = useI18n()
const layout = useLayoutStore()
const navigation = useNavigationStore()
const root = useTemplateRef('root')

const icons: Record<SettingsSection, typeof Archive> = {
  general: SlidersHorizontal,
  appearance: Palette,
  shortcuts: Keyboard,
  agents: Bot,
  connections: Plug,
  skills: Sparkles,
  archive: Archive,
}

// Le bouton Réglages qui avait le focus disparaît à l'ouverture : on le rend à la section affichée.
onMounted(() => root.value?.querySelector<HTMLElement>('[aria-current="page"]')?.focus())
</script>

<template>
  <div ref="root" class="flex flex-col gap-4">
    <div
      v-for="(group, index) in settingsGroups"
      :key="group.id"
      role="group"
      :aria-label="t(`settings.groups.${group.id}`)"
      class="flex flex-col gap-0.5"
    >
      <p v-if="layout.rail.expanded" class="truncate px-2 pb-1 text-xs font-medium whitespace-nowrap text-muted" aria-hidden="true">
        {{ t(`settings.groups.${group.id}`) }}
      </p>
      <div v-else-if="index > 0" class="mb-3 h-px shrink-0 bg-stroke" />
      <ShellRailItem
        v-for="section in group.sections"
        :key="section"
        :icon="icons[section]"
        :label="t(`settings.sections.${section}`)"
        :expanded="layout.rail.expanded"
        :active="navigation.settingsSection === section"
        @click="navigation.showSettingsSection(section)"
      />
    </div>
  </div>
</template>
