<script setup lang="ts">
import { ArrangeAZ, CalendarAdd, Clock, RowsCompact, SlidersHorizontal } from '@/components/ui/icons'
import { DropdownMenuContent, DropdownMenuLabel, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger } from 'reka-ui'
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import type { UiMenuSection } from '@/components/ui/UiMenu.vue'
import UiMenuChoices from '@/components/ui/UiMenuChoices.vue'
import UiMenuSeparator from '@/components/ui/UiMenuSeparator.vue'
import UiMenuToggle from '@/components/ui/UiMenuToggle.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { menuPanel, menuTitle } from '@/components/ui/menuRow'
import { type SessionSort, useLayoutStore } from '@/stores/layout'

const { t } = useI18n()
const layout = useLayoutStore()
const id = useId()

const section = computed<UiMenuSection>(() => ({
  id: 'sort',
  value: layout.sessionSort,
  options: [
    { value: 'activity', label: t('chats.sort.activity'), icon: Clock },
    { value: 'created', label: t('chats.sort.created'), icon: CalendarAdd },
    { value: 'name', label: t('chats.sort.name'), icon: ArrangeAZ },
  ],
}))

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
            :class="[menuPanel, 'min-w-48']"
            @close-auto-focus="byPointer && $event.preventDefault()"
          >
            <DropdownMenuLabel :id="`${id}-label`" :class="menuTitle">{{ t('chats.sort.title') }}</DropdownMenuLabel>
            <UiMenuChoices :section="section" :labelledby="`${id}-label`" @select="layout.sessionSort = $event as SessionSort" />
            <UiMenuSeparator />
            <!-- Les intertitres de date n'ont pas de sens en tri par nom. -->
            <UiMenuToggle
              v-model="layout.sessionGroups"
              :label="t('chats.sort.byDate')"
              :icon="CalendarAdd"
              :disabled="layout.sessionSort === 'name'"
            />
            <UiMenuToggle v-model="layout.sessionCompact" :label="t('chats.sort.compact')" :icon="RowsCompact" />
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>
    </span>
  </UiTooltip>
</template>
