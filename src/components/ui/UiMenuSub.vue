<script setup lang="ts">
import { ChevronRight } from '@lucide/vue'
import { DropdownMenuPortal, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger } from 'reka-ui'
import type { Component } from 'vue'

// `value` : le choix en cours, lu à droite du libellé.
defineProps<{ label: string; icon?: Component; value?: string }>()
</script>

<template>
  <DropdownMenuSub>
    <DropdownMenuSubTrigger
      :text-value="label"
      class="flex cursor-pointer items-center gap-2 rounded-md py-1.5 ps-2 pe-1.5 text-content/75 outline-none data-[highlighted]:bg-selection data-[highlighted]:text-content data-[state=open]:bg-selection data-[state=open]:text-content"
    >
      <component :is="icon" v-if="icon" class="size-3.5 shrink-0" aria-hidden="true" />
      <span class="min-w-0 flex-1 truncate">{{ label }}</span>
      <span v-if="value" class="truncate text-muted">{{ value }}</span>
      <ChevronRight class="size-3 shrink-0 text-muted rtl:rotate-180" aria-hidden="true" />
    </DropdownMenuSubTrigger>
    <DropdownMenuPortal>
      <DropdownMenuSubContent
        :side-offset="6"
        :collision-padding="8"
        class="ui-pop z-50 max-h-(--reka-dropdown-menu-content-available-height) max-w-72 min-w-44 overflow-y-auto p-1 text-xs text-content select-none"
      >
        <slot />
      </DropdownMenuSubContent>
    </DropdownMenuPortal>
  </DropdownMenuSub>
</template>
