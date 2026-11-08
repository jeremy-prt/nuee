<script setup lang="ts">
import { ChevronDown, NoProject, Server } from '@/components/ui/icons'
import { DropdownMenuContent, DropdownMenuLabel, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger } from 'reka-ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { UiMenuSection } from '@/components/ui/UiMenu.vue'
import UiMenuChoices from '@/components/ui/UiMenuChoices.vue'
import UiMenuItem from '@/components/ui/UiMenuItem.vue'
import UiMenuSeparator from '@/components/ui/UiMenuSeparator.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { menuPanel, menuTitle } from '@/components/ui/menuRow'
import { useMachineName } from '@/composables/useMachineName'

// Machine où l'agent travaille, comme Paseo. Seule celle-ci pour l'instant : l'hôte SSH est annoncé, pas branché.
defineOptions({ inheritAttrs: false })

const { t } = useI18n()
const machineName = useMachineName()

const section = computed<UiMenuSection>(() => ({
  id: 'host',
  value: 'local',
  options: [{ value: 'local', label: machineName.value || t('composer.hosts.local'), icon: NoProject }],
}))
</script>

<template>
  <UiTooltip :label="t('composer.machine')">
    <span class="flex min-w-0">
      <DropdownMenuRoot :modal="false">
        <DropdownMenuTrigger v-bind="$attrs">
          <span class="size-2 shrink-0 rounded-full bg-success" aria-hidden="true" />
          <span class="sr-only">{{ t('composer.machine') }}</span>
          <span class="truncate">{{ machineName || t('composer.hosts.local') }}</span>
          <ChevronDown
            class="size-3 shrink-0 text-muted transition-transform duration-150 ease-out group-aria-expanded:rotate-180 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent side="bottom" align="start" :side-offset="6" :collision-padding="8" :class="[menuPanel, 'w-64']">
            <DropdownMenuLabel :class="menuTitle">{{ t('composer.hosts.title') }}</DropdownMenuLabel>
            <UiMenuChoices :section="section" />
            <UiMenuSeparator />
            <UiMenuItem :label="t('composer.hosts.addSsh')" :icon="Server" disabled />
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>
    </span>
  </UiTooltip>
</template>
