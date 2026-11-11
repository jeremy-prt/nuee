<script setup lang="ts">
import { ChevronRight } from '@/components/ui/icons'
import { DropdownMenuContent, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger } from 'reka-ui'
import { provide, useId, useTemplateRef, watch } from 'vue'
import { menuPanel } from '@/components/ui/menuRow'
import { hoverMenuArea, useHoverMenu } from '@/composables/useHoverMenu'

// Ligne du volet Environnement qui ouvre un sous-menu sur le côté, comme l'app Claude : au survol, au clic, à Entrée
// ou →, aligné sur la ligne, à gauche du volet (collé au bord droit) ou du côté qui a la place. `split` : la ligne
// garde son action (`run`), seule sa partie droite ⟩ ouvre le menu, nommé par `menuLabel`.
const props = defineProps<{ label?: string; menuLabel?: string; disabled?: boolean; split?: boolean; runDisabled?: boolean }>()
const emit = defineEmits<{ run: [event: MouseEvent]; open: [open: boolean] }>()

const row = useTemplateRef('row')
const trigger = useTemplateRef('trigger')
const key = useId()
const side = document.documentElement.dir === 'rtl' ? 'right' : 'left'
const menu = useHoverMenu(
  () => trigger.value,
  () => document.querySelector<HTMLElement>(`[data-hover-menu="${key}"]`),
  () => !!props.disabled,
)
watch(menu.open, (value) => emit('open', value))
// Le second niveau garde le côté du premier : tout l'écran sauf le volet.
provide(hoverMenuArea, () => {
  const panel = row.value?.closest('[data-reka-popper-content-wrapper]')?.getBoundingClientRect()
  if (!panel) return null
  return side === 'left' ? { x: 0, y: 0, width: panel.left, height: innerHeight } : { x: panel.right, y: 0, width: innerWidth - panel.right, height: innerHeight }
})

// reka bascule le menu à l'appui sur son déclencheur : ouvert au survol, un clic doit le laisser ouvert.
let pressing = false
function onPress() {
  pressing = true
  setTimeout(() => (pressing = false))
}
function onOpenChange(value: boolean) {
  if (value) menu.show(pressing)
  else if (!pressing) menu.hide('other')
}

function firstItem() {
  return document.querySelector<HTMLElement>(`[data-hover-menu="${key}"] [role^="menuitem"]:not([data-disabled])`)
}
// Entrée, Espace et → ouvrent (ou rejoignent) le menu sur son premier élément ; ↓ garde le comportement de reka.
function onTriggerKey(event: KeyboardEvent) {
  if (!['Enter', ' ', side === 'left' ? 'ArrowRight' : 'ArrowLeft'].includes(event.key) || props.disabled) return
  event.preventDefault()
  event.stopImmediatePropagation()
  if (menu.open.value) firstItem()?.focus()
  else menu.show(false)
}
// ← referme et rend le focus à la ligne, comme un sous-menu.
function onContentKey(event: KeyboardEvent) {
  if (event.defaultPrevented || event.key !== (side === 'left' ? 'ArrowLeft' : 'ArrowRight')) return
  event.preventDefault()
  menu.hide('other')
}

function onOpenAutoFocus(event: Event) {
  if (menu.byPointer.value) event.preventDefault()
}
// Fermé par le pointeur parti ailleurs : le focus ne saute pas sur la ligne, sauf s'il était dans le menu qui disparaît.
function onCloseAutoFocus(event: Event) {
  const { reason, focusInside } = menu.closed()
  if (reason === 'other') return
  event.preventDefault()
  if (reason === 'pointer' && focusInside) trigger.value?.focus({ preventScroll: true, focusVisible: false } as FocusOptions)
}

const ring = 'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring'
</script>

<template>
  <div
    ref="row"
    class="group/sub flex h-8 w-full min-w-0 shrink-0 items-center rounded-lg text-[13px] has-[[aria-expanded=true]]:bg-selection-hover"
    :class="{ 'hover:bg-selection-hover': !(disabled && (!split || runDisabled)) }"
  >
    <button
      v-if="split"
      type="button"
      :disabled="runDisabled"
      :class="[ring, 'flex h-full min-w-0 flex-1 items-center gap-2.5 rounded-s-lg ps-2 pe-1 text-start enabled:hover:bg-selection-hover disabled:text-muted']"
      @click="emit('run', $event)"
    >
      <slot />
    </button>
    <span v-if="split" class="h-4 w-px shrink-0 group-hover/sub:bg-stroke group-has-[[aria-expanded=true]]/sub:bg-stroke" aria-hidden="true" />
    <DropdownMenuRoot :open="menu.open.value" :modal="false" @update:open="onOpenChange">
      <DropdownMenuTrigger as-child :disabled="disabled">
        <button
          ref="trigger"
          type="button"
          :aria-label="split ? menuLabel : label"
          :class="[
            ring,
            'flex h-full items-center disabled:text-muted',
            split
              ? 'w-8 shrink-0 justify-center rounded-e-lg text-muted enabled:hover:bg-selection-hover enabled:hover:text-content aria-expanded:text-content disabled:opacity-40'
              : 'min-w-0 flex-1 gap-2.5 rounded-lg px-2 text-start',
          ]"
          @pointerdown.capture="onPress"
          @keydown.capture="onTriggerKey"
          @pointerenter="menu.onEnter"
          @pointermove="menu.onMove"
          @pointerleave="menu.onLeave"
        >
          <slot v-if="!split" />
          <ChevronRight class="size-4 shrink-0 text-muted rtl:rotate-180" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent
          :data-hover-menu="key"
          :reference="row ?? undefined"
          :side="side"
          align="start"
          :side-offset="12"
          :align-offset="-6"
          :collision-padding="8"
          :class="[menuPanel, 'max-h-(--reka-dropdown-menu-content-available-height) max-w-72 min-w-52']"
          @open-auto-focus="onOpenAutoFocus"
          @close-auto-focus="onCloseAutoFocus"
          @keydown="onContentKey"
          @pointerenter="menu.onContentEnter"
        >
          <!-- `keyboard` : ouvert au clavier, une action qui fait disparaître la ligne déplace le focus. -->
          <slot name="menu" :keyboard="!menu.byPointer.value" />
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenuRoot>
  </div>
</template>
