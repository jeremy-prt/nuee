<script setup lang="ts">
import { RotateCcw } from '@lucide/vue'
import { nextTick, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsGroup from '@/components/settings/SettingsGroup.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import { type ComboProblem, useShortcutsStore } from '@/stores/shortcuts'
import {
  type Combo,
  comboFromEvent,
  defaultShortcuts,
  isMac,
  type Shortcut,
  type ShortcutId,
  shortcutIds,
  shortcutKeys,
  shortcutLabel,
} from '@/utils/shortcuts'

const KEY_CLASS = 'flex h-6 min-w-6 items-center justify-center rounded-md border px-1.5 text-xs'
const KEY_IDLE = 'border-stroke bg-content/5 text-content/80'

const { t } = useI18n()
const shortcuts = useShortcutsStore()
const root = useTemplateRef('root')

const groups = new Map<Shortcut['group'], ShortcutId[]>()
for (const id of shortcutIds) {
  const { group } = defaultShortcuts[id]
  groups.set(group, [...(groups.get(group) ?? []), id])
}

const recording = ref<ShortcutId | null>(null)
const held = ref<string[]>([])
// Reste affichée après la sortie du champ : le bouton Remplacer doit rester cliquable.
const refused = ref<{ id: ShortcutId; combo: Combo; problem: ComboProblem } | null>(null)

watch(() => shortcuts.overrides, () => (refused.value = null), { deep: true })

const base = (id: ShortcutId): Shortcut => defaultShortcuts[id]
const name = (id: ShortcutId) => t(`settings.shortcuts.items.${id}`)

function keys(id: ShortcutId) {
  if (recording.value === id) return refused.value?.id === id ? shortcutKeys(refused.value.combo) : held.value
  const shortcut = shortcuts.get(id)
  return shortcut ? shortcutKeys(shortcut) : []
}

// Le survol et l'enregistrement se lisent sur les touches elles-mêmes, pas sur un fond plus large qu'elles.
function keyState(id: ShortcutId) {
  if (recording.value !== id) return `${KEY_IDLE} group-hover:border-content/25 group-hover:bg-content/10`
  return refused.value?.id === id ? 'border-danger bg-danger/10 text-danger' : 'border-ring bg-content/5 text-content'
}

function heldModifiers(event: KeyboardEvent) {
  return shortcutKeys({ key: '', mod: isMac ? event.metaKey : event.ctrlKey, alt: event.altKey, shift: event.shiftKey })
}

function start(id: ShortcutId, event: MouseEvent) {
  if (recording.value === id) return stop()
  // WebKit ne donne pas le focus à un bouton cliqué : les touches n'arriveraient pas jusqu'ici.
  ;(event.currentTarget as HTMLElement).focus()
  refused.value = null
  held.value = []
  recording.value = id
}

function stop() {
  recording.value = null
  held.value = []
}

function onKeydown(event: KeyboardEvent, id: ShortcutId) {
  if (recording.value !== id) return
  const bare = !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey
  if (bare && event.key === 'Tab') return stop()
  // Ni les raccourcis de la fenêtre ni l'Échap qui ferme les réglages ne doivent partir pendant l'enregistrement.
  event.preventDefault()
  event.stopPropagation()
  if (bare && event.key === 'Escape') {
    refused.value = null
    return stop()
  }
  if (bare && (event.key === 'Backspace' || event.key === 'Delete')) {
    shortcuts.set(id, null)
    return stop()
  }
  const combo = comboFromEvent(event)
  if (!combo) {
    held.value = heldModifiers(event)
    return
  }
  const problem = shortcuts.check(id, combo)
  if (problem) {
    refused.value = { id, combo, problem }
    return
  }
  shortcuts.set(id, combo)
  stop()
}

function message({ combo, problem }: NonNullable<typeof refused.value>) {
  const keys = shortcutLabel(combo)
  if (problem.kind === 'taken') return t('settings.shortcuts.taken', { keys, name: name(problem.by) })
  if (problem.kind === 'reserved') return t('settings.shortcuts.reserved', { keys })
  return t('settings.shortcuts.needsMod', { mod: isMac ? '⌘' : 'Ctrl' })
}

// L'autre raccourci est désactivé, pas échangé : l'utilisateur voit lequel il a perdu.
async function replace(event: MouseEvent) {
  const current = refused.value
  if (current?.problem.kind !== 'taken') return
  shortcuts.set(current.problem.by, null)
  shortcuts.set(current.id, current.combo)
  stop()
  if (event.detail !== 0) return
  await nextTick()
  root.value?.querySelector<HTMLElement>(`[data-shortcut="${current.id}"]`)?.focus()
}
</script>

<template>
  <div ref="root">
    <SettingsGroup v-for="[group, ids] in groups" :key="group" :title="t(`settings.shortcuts.groups.${group}`)">
      <dl>
        <div v-for="id in ids" :key="id" class="border-b border-stroke px-4 py-2 last:border-b-0">
          <div class="flex min-h-7 items-center gap-4">
            <dt class="min-w-0 flex-1 text-sm">{{ name(id) }}</dt>
            <dd class="flex items-center gap-1">
              <UiIconButton
                v-if="id in shortcuts.overrides"
                :label="t('settings.shortcuts.resetOne', { name: name(id) })"
                @click="shortcuts.reset(id)"
              >
                <RotateCcw class="size-3.5" aria-hidden="true" />
              </UiIconButton>
              <kbd v-if="base(id).fixed" class="flex gap-1 font-sans">
                <kbd v-for="(key, index) in keys(id)" :key="index" :class="[KEY_CLASS, KEY_IDLE]">{{ key }}</kbd>
              </kbd>
              <button
                v-else
                type="button"
                :data-shortcut="id"
                class="group flex cursor-pointer items-center gap-1 rounded-md font-sans focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                :aria-label="t('settings.shortcuts.edit', { name: name(id), keys: shortcuts.label(id) ?? t('settings.shortcuts.disabled') })"
                :aria-invalid="refused?.id === id || undefined"
                @click="start(id, $event)"
                @keydown="onKeydown($event, id)"
                @keyup="recording === id && (held = heldModifiers($event))"
                @blur="recording === id && stop()"
              >
                <kbd v-for="(key, index) in keys(id)" :key="index" :class="[KEY_CLASS, keyState(id)]">{{ key }}</kbd>
                <span
                  v-if="!keys(id).length"
                  class="flex h-6 items-center rounded-md border px-2 text-xs text-muted"
                  :class="recording === id ? 'border-ring' : 'border-dashed border-stroke group-hover:border-content/25'"
                >
                  {{ recording === id ? t('settings.shortcuts.recording') : t('settings.shortcuts.disabled') }}
                </span>
              </button>
            </dd>
          </div>
          <div v-if="refused?.id === id" class="mt-1 flex flex-wrap items-center justify-end gap-x-2 text-xs">
            <p role="alert" class="text-danger">{{ message(refused) }}</p>
            <button
              v-if="refused.problem.kind === 'taken' && !base(refused.problem.by).fixed"
              type="button"
              class="cursor-pointer rounded font-medium text-content underline underline-offset-2 hover:text-accent focus-visible:outline-2 focus-visible:outline-ring"
              @click="replace($event)"
            >
              {{ t('settings.shortcuts.replace') }}
            </button>
          </div>
          <p v-else-if="recording === id" class="mt-1 text-end text-xs text-muted">{{ t('settings.shortcuts.recordingHint') }}</p>
        </div>
      </dl>
    </SettingsGroup>
  </div>
</template>

