<script setup lang="ts">
import { type Component, computed } from 'vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { type ProjectColor, rowTint } from '@/utils/projects'

defineOptions({ inheritAttrs: false })
// Le slot `icon` remplace l'icône (celle d'un projet), `end` ajoute un indicateur à droite du libellé.
// state : un état lu avec le libellé (« notifications coupées »), que l'indicateur ne dit qu'à l'œil.
// endSpace : au survol, le libellé s'estompe sous le bouton « … » posé par-dessus la ligne.
// tint : couleur de fond d'un projet (voir rowTint).
const props = defineProps<{
  icon?: Component
  label: string
  expanded: boolean
  active?: boolean
  shortcut?: string
  state?: string
  endSpace?: boolean
  tint?: ProjectColor
  // Menu de la ligne ouvert : elle garde son fond de survol.
  held?: boolean
}>()

const tintVars = computed(() => (props.tint ? rowTint(props.tint) : undefined))
</script>

<template>
  <!-- Icône à la même place dans les deux états : seule la largeur du rail change, le libellé est masqué. -->
  <UiTooltip :label="label" :shortcut="shortcut" side="right" :side-offset="8" :disabled="expanded">
    <button
      v-bind="$attrs"
      type="button"
      class="flex h-8 w-full shrink-0 items-center gap-2.5 overflow-hidden rounded-md text-sm whitespace-nowrap focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      :class="[
        active || held ? 'text-content' : 'text-muted hover:text-content',
        tint
          ? active ? 'bg-(--row-active)' : held ? 'bg-(--row-hover)' : 'bg-(--row-rest) hover:bg-(--row-hover)'
          : active ? 'bg-selection' : held ? 'bg-selection-hover' : 'hover:bg-selection-hover',
        'px-2',
      ]"
      :style="tintVars"
      :aria-label="state ? `${label}, ${state}` : label"
      :aria-current="active ? 'page' : undefined"
    >
      <slot name="icon"><component :is="icon" class="size-4 shrink-0" aria-hidden="true" /></slot>
      <span
        class="min-w-0 flex-1 truncate text-start"
        :class="[
          { 'opacity-0': !expanded },
          endSpace && expanded && (held ? 'fade-under-one' : 'group-focus-within:fade-under-one group-hover:fade-under-one'),
        ]"
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
