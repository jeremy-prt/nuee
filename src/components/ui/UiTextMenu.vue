<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { menuLabel } from '@/components/ui/menuRow'
import { clipboardText } from '@/ipc/clipboard'
import { isMac } from '@/utils/shortcuts'

// Clic droit sur un champ ou du texte sélectionné : remplace le menu de WebKit (Look Up, Writing Tools, Services…) par
// couper, copier, coller, tout sélectionner. Ailleurs, `main.ts` a déjà coupé le menu natif ; un menu propre à
// l'élément (session, fichier…) passe avant.
type Field = HTMLInputElement | HTMLTextAreaElement

const { t } = useI18n()
const panel = useTemplateRef('panel')
const shown = ref<{ x: number; y: number } | null>(null)
let field: Field | HTMLElement | null = null
let range: { start: number; end: number } | Range | null = null
let selected = ''

const editable = computed(() => !!shown.value && !!field)
const items = computed(() => {
  const mod = isMac ? '⌘' : 'Ctrl+'
  const list: { id: 'cut' | 'copy' | 'paste' | 'selectAll'; key: string }[] = []
  if (editable.value && selected) list.push({ id: 'cut', key: `${mod}X` })
  if (selected) list.push({ id: 'copy', key: `${mod}C` })
  if (editable.value) list.push({ id: 'paste', key: `${mod}V` }, { id: 'selectAll', key: `${mod}A` })
  return list
})

function isField(element: Element): element is Field {
  return element instanceof HTMLTextAreaElement || (element instanceof HTMLInputElement && /^(text|search|url|email|password|number|)$/.test(element.type))
}

async function onContextMenu(event: MouseEvent) {
  if (event.defaultPrevented) return
  event.preventDefault()
  const target = event.target instanceof Element ? event.target : null
  const input = target?.closest('input, textarea')
  const rich = target?.closest<HTMLElement>('[contenteditable="true"]')
  field = input && isField(input) && !input.readOnly && !input.disabled ? input : (rich ?? null)
  const selection = window.getSelection()
  if (field && isField(field)) {
    range = { start: field.selectionStart ?? 0, end: field.selectionEnd ?? 0 }
    selected = field.value.slice(range.start, range.end)
  } else {
    range = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null
    selected = selection?.toString() ?? ''
  }
  if (!field && !selected) return close()
  shown.value = { x: event.clientX, y: event.clientY }
  await nextTick()
  // Gardé dans la fenêtre : un clic près du bord ouvre le menu de l'autre côté du pointeur.
  const box = panel.value?.getBoundingClientRect()
  if (box && shown.value) {
    shown.value = {
      x: Math.min(shown.value.x, window.innerWidth - box.width - 8),
      y: shown.value.y + box.height > window.innerHeight - 8 ? Math.max(8, shown.value.y - box.height) : shown.value.y,
    }
  }
  panel.value?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true })
}

// Rend le champ et sa sélection d'avant le clic droit : les commandes d'édition agissent sur eux.
function restore() {
  if (field) field.focus({ preventScroll: true })
  if (field && isField(field) && range && !(range instanceof Range)) field.setSelectionRange(range.start, range.end)
  else if (range instanceof Range) {
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }
}

async function run(id: 'cut' | 'copy' | 'paste' | 'selectAll') {
  close()
  if (id === 'paste') {
    const text = await clipboardText()
    restore()
    if (text) document.execCommand('insertText', false, text)
    return
  }
  restore()
  if (id === 'selectAll') {
    if (field && isField(field)) field.select()
    else document.execCommand('selectAll')
    return
  }
  if (!document.execCommand(id) && id === 'copy') await navigator.clipboard.writeText(selected).catch(() => {})
}

function close() {
  shown.value = null
}

function onKeydown(event: KeyboardEvent) {
  const buttons = [...(panel.value?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
  const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
    restore()
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    const next = (at + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
    buttons[next]?.focus()
  }
}

function onPointerDown(event: PointerEvent) {
  if (shown.value && !panel.value?.contains(event.target as Node)) close()
}

onMounted(() => {
  document.addEventListener('contextmenu', onContextMenu)
  document.addEventListener('pointerdown', onPointerDown, true)
  window.addEventListener('blur', close)
  window.addEventListener('resize', close)
  document.addEventListener('scroll', close, true)
})
onBeforeUnmount(() => {
  document.removeEventListener('contextmenu', onContextMenu)
  document.removeEventListener('pointerdown', onPointerDown, true)
  window.removeEventListener('blur', close)
  window.removeEventListener('resize', close)
  document.removeEventListener('scroll', close, true)
})
</script>

<template>
  <div
    v-if="shown && items.length"
    ref="panel"
    role="menu"
    :aria-label="t('textMenu.label')"
    class="ui-glass fixed z-50 flex min-w-40 flex-col gap-0.5 rounded-xl p-1 text-xs text-content select-none"
    :style="{ left: `${shown.x}px`, top: `${shown.y}px` }"
    @keydown="onKeydown"
  >
    <button
      v-for="item in items"
      :key="item.id"
      type="button"
      role="menuitem"
      class="flex h-7 w-full items-center gap-4 rounded-lg px-2 text-start outline-none hover:bg-selection-hover focus-visible:bg-selection-hover"
      @mousedown.prevent
      @click="run(item.id)"
    >
      <span :class="[menuLabel, 'flex-1']">{{ t(`textMenu.${item.id}`) }}</span>
      <span class="shrink-0 text-muted">{{ item.key }}</span>
    </button>
  </div>
</template>
