<script setup lang="ts">
import { ChevronRight } from '@/components/ui/icons'
import { DropdownMenuPortal, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger } from 'reka-ui'
import type { Component } from 'vue'
import { menuIcon, menuLabel, menuPanel, menuRow } from '@/components/ui/menuRow'

// `value` : le choix en cours, lu à droite du libellé.
defineProps<{ label: string; icon?: Component; value?: string }>()
</script>

<template>
  <DropdownMenuSub>
    <DropdownMenuSubTrigger
      :text-value="label"
      :class="[menuRow, 'py-1.5 pe-1.5 data-[state=open]:bg-selection-hover']"
    >
      <component :is="icon" v-if="icon" :class="menuIcon" aria-hidden="true" />
      <span :class="[menuLabel, 'min-w-0 flex-1']">{{ label }}</span>
      <span v-if="value" class="mt-0.5 truncate text-muted">{{ value }}</span>
      <ChevronRight class="mt-[3px] size-3.5 shrink-0 text-muted rtl:rotate-180" aria-hidden="true" />
    </DropdownMenuSubTrigger>
    <DropdownMenuPortal>
      <DropdownMenuSubContent
        :side-offset="6"
        :collision-padding="8"
        :class="[menuPanel, 'max-h-(--reka-dropdown-menu-content-available-height) max-w-72 min-w-44']"
      >
        <slot />
      </DropdownMenuSubContent>
    </DropdownMenuPortal>
  </DropdownMenuSub>
</template>
