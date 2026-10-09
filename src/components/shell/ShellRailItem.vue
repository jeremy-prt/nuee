<script setup lang="ts">
import type { Component } from 'vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'

defineOptions({ inheritAttrs: false })
defineProps<{ icon: Component; label: string; expanded: boolean; active?: boolean; shortcut?: string }>()
</script>

<template>
  <!-- Icône à la même place dans les deux états : seule la largeur du rail change, le libellé est masqué. -->
  <UiTooltip :label="label" :shortcut="shortcut" side="right" :side-offset="8" :disabled="expanded">
    <button
      v-bind="$attrs"
      type="button"
      class="flex h-8 w-full shrink-0 items-center gap-2.5 overflow-hidden rounded-md px-2 text-sm whitespace-nowrap focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
      :class="active ? 'bg-selection text-content' : 'text-muted hover:bg-selection-hover hover:text-content'"
      :aria-label="label"
      :aria-current="active ? 'page' : undefined"
    >
      <component :is="icon" class="size-4 shrink-0" aria-hidden="true" />
      <span
        class="min-w-0 flex-1 truncate text-start"
        :class="{ 'opacity-0': !expanded }"
      >
        {{ label }}
      </span>
      <kbd
        v-if="shortcut"
        class="font-sans text-xs text-muted"
        :class="{ 'opacity-0': !expanded }"
      >
        {{ shortcut }}
      </kbd>
    </button>
  </UiTooltip>
</template>
