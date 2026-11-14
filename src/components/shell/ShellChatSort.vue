<script setup lang="ts">
import { SlidersHorizontal } from '@/components/ui/icons'
import { DropdownMenuContent, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger } from 'reka-ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { UiMenuSection } from '@/components/ui/UiMenu.vue'
import UiMenuChoices from '@/components/ui/UiMenuChoices.vue'
import UiMenuSeparator from '@/components/ui/UiMenuSeparator.vue'
import UiMenuSub from '@/components/ui/UiMenuSub.vue'
import UiMenuToggle from '@/components/ui/UiMenuToggle.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { menuPanel } from '@/components/ui/menuRow'
import { type SessionGroups, type SessionSort, useLayoutStore } from '@/stores/layout'

const { t } = useI18n()
const layout = useLayoutStore()

const section = computed<UiMenuSection>(() => ({
  id: 'sort',
  value: layout.sessionSort,
  options: [
    { value: 'activity', label: t('chats.sort.activity') },
    { value: 'created', label: t('chats.sort.created') },
    { value: 'name', label: t('chats.sort.name') },
  ],
}))

// Les intertitres de date n'ont pas de sens en tri par nom.
const groupSection = computed<UiMenuSection>(() => ({
  id: 'groups',
  value: layout.sessionGroups === 'date' && layout.sessionSort === 'name' ? 'none' : layout.sessionGroups,
  options: [
    { value: 'none', label: t('chats.sort.noGroups') },
    { value: 'date', label: t('chats.sort.byDate'), disabled: layout.sessionSort === 'name' },
    { value: 'status', label: t('chats.sort.byStatus') },
  ],
}))

const chosen = (menu: UiMenuSection) => menu.options.find((option) => option.value === menu.value)

let byPointer = false
const openedBy = (pointer: boolean) => {
  byPointer = pointer
}
</script>

<template>
  <UiTooltip :label="t('chats.sort.label')">
    <span class="flex">
      <DropdownMenuRoot :modal="false">
        <DropdownMenuTrigger
          class="grid size-7 shrink-0 place-items-center rounded-md text-muted hover:bg-selection-hover hover:text-content focus-visible:outline-2 focus-visible:outline-ring aria-expanded:bg-selection-hover aria-expanded:text-content"
          :aria-label="t('chats.sort.label')"
          @pointerdown="openedBy(true)"
          @keydown="openedBy(false)"
        >
          <SlidersHorizontal class="size-4" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent
            align="end"
            :side-offset="4"
            :collision-padding="8"
            :class="[menuPanel, 'min-w-56']"
            @close-auto-focus="byPointer && $event.preventDefault()"
          >
            <UiMenuSub :label="t('chats.sort.title')" :value="chosen(section)?.label">
              <UiMenuChoices :section="section" @select="layout.sessionSort = $event as SessionSort" />
            </UiMenuSub>
            <UiMenuSub :label="t('chats.sort.groupsTitle')" :value="chosen(groupSection)?.label">
              <UiMenuChoices :section="groupSection" @select="layout.sessionGroups = $event as SessionGroups" />
            </UiMenuSub>
            <UiMenuSeparator />
            <UiMenuToggle v-model="layout.sessionCompact" :label="t('chats.sort.compact')" />
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>
    </span>
  </UiTooltip>
</template>
