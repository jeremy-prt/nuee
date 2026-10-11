<script setup lang="ts">
import type { Component } from 'vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'

defineOptions({ inheritAttrs: false })
// Le slot `icon` remplace l'icône (celle d'un projet), `end` ajoute un indicateur à droite du libellé.
// state : un état lu avec le libellé (« notifications coupées »), que l'indicateur ne dit qu'à l'œil.
defineProps<{ icon?: Component; label: string; expanded: boolean; active?: boolean; shortcut?: string; state?: string }>()
</script>

<template>
  <!-- Icône à la même place dans les deux états : seule la largeur du rail change, le libellé est masqué. -->
  <UiTooltip :label="label" :shortcut="shortcut" side="right" :side-offset="8" :disabled="expanded">
    <button
      v-bind="$attrs"
      type="button"
      class="flex h-8 w-full shrink-0 items-center gap-2.5 overflow-hidden rounded-md px-2 text-sm whitespace-nowrap focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      :class="active ? 'bg-selection text-content' : 'text-muted hover:bg-selection-hover hover:text-content'"
      :aria-label="state ? `${label}, ${state}` : label"
      :aria-current="active ? 'page' : undefined"
    >
      <slot name="icon"><component :is="icon" class="size-4 shrink-0" aria-hidden="true" /></slot>
      <span
        class="min-w-0 flex-1 truncate text-start"
        :class="{ 'opacity-0': !expanded }"
      >
        {{ label }}
      </span>
      <slot v-if="expanded" name="end" />
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
