<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { dockIcons } from '@/components/shell/dockIcons'
import type { DockView } from '@/stores/layout'
import { useDockOpener } from '@/composables/useDockOpener'

// Panneau ouvert sans volet, comme T3 Code : la liste des volets, chacun avec sa lettre. Les lettres ne valent que hors
// d'un champ de saisie (le message en cours garde ses B et ses T).
const LAUNCHERS: { view: DockView; key: string }[] = [
  { view: 'browser', key: 'B' },
  { view: 'terminal', key: 'T' },
  { view: 'files', key: 'E' },
  { view: 'changes', key: 'D' },
  { view: 'tasks', key: 'K' },
]

const { t } = useI18n()
const open = useDockOpener()

function typing(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
}

function onKeydown(event: KeyboardEvent) {
  if (event.metaKey || event.ctrlKey || event.altKey || typing(event.target)) return
  if (document.querySelector('[role="menu"], [role="dialog"], [role="alertdialog"]')) return
  const launcher = LAUNCHERS.find((item) => item.key === event.key.toUpperCase())
  if (!launcher) return
  event.preventDefault()
  open(launcher.view)
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-6">
    <div class="w-full max-w-64 py-6">
      <h2 class="mb-3 text-center text-sm font-medium text-content">{{ t('dock.launcher') }}</h2>
      <ul class="flex flex-col gap-0.5">
        <li v-for="item in LAUNCHERS" :key="item.view">
          <button
            type="button"
            class="flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-start text-sm text-content/90 hover:bg-selection-hover focus-visible:outline-2 focus-visible:outline-ring"
            @click="open(item.view)"
          >
            <component :is="dockIcons[item.view]" class="size-4 shrink-0 text-muted" aria-hidden="true" />
            <span class="min-w-0 flex-1 truncate">{{ t(`dock.${item.view}.title`) }}</span>
            <kbd class="grid size-5 place-items-center rounded bg-content/8 font-sans text-[11px] text-muted">{{ item.key }}</kbd>
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>
