<script setup lang="ts">
import { Search } from '@/components/ui/icons'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { useDockFocus } from '@/composables/useDockFocus'
import { useSlow } from '@/composables/useSlow'
import { useTerminalChat } from '@/composables/useTerminalChat'
import { useFilesStore } from '@/stores/files'
import { useLayoutStore } from '@/stores/layout'
import { useSessionGitStore } from '@/stores/sessionGit'
import { useShortcutsStore } from '@/stores/shortcuts'

// Comme monocode : le total des changements et la loupe de l'Explorateur, visibles panneau fermé. Ils affichent leur
// volet sans bascule, un second clic ne ferme rien.
const { t } = useI18n()
const layout = useLayoutStore()
const files = useFilesStore()
const shortcuts = useShortcutsStore()
const sessionGit = useSessionGitStore()
const dockFocus = useDockFocus()
const { chat, place } = useTerminalChat()

// Pas d'état sans dossier git : `sessionGit.refresh` l'efface.
const changes = computed(() => (chat.value ? sessionGit.states[chat.value.id]?.changes : undefined))
const clean = computed(() => !changes.value?.files)
// Première lecture plus lente que 150 ms : une pastille de squelette tient la place du compteur.
const slow = useSlow(() => !!chat.value && !changes.value && sessionGit.loading.has(chat.value.id))
const counter = computed(() =>
  changes.value
    ? t('dock.changes.counter', {
        added: t('dock.changes.additions', changes.value.added),
        removed: t('dock.changes.deletions', changes.value.removed),
      })
    : '',
)

function openChanges() {
  layout.setGitMode(chat.value?.projectId ?? null, 'changes')
  layout.showView('changes')
  dockFocus.focusView('changes')
}

// Session vierge sans projet : l'Explorateur n'a rien à chercher et le dit.
function openSearch() {
  layout.showView('files')
  if (chat.value && (place.value?.cwd || chat.value.started)) files.openSearch(chat.value.id)
}
</script>

<template>
  <span v-if="chat" class="flex shrink-0 items-center gap-0.5">
    <UiTooltip v-if="changes" :label="t('dock.changes.modes.changes')" :shortcut="shortcuts.label('toggleChanges')">
      <button
        type="button"
        class="flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] leading-4 tabular-nums focus-visible:outline-2 focus-visible:outline-ring"
        :class="layout.isShown('changes') ? 'bg-selection' : 'hover:bg-selection-inner'"
        :aria-label="counter"
        @click="openChanges"
      >
        <span :class="clean ? 'text-muted' : 'text-success'">+{{ changes.added }}</span>
        <span :class="clean ? 'text-muted' : 'text-danger'">−{{ changes.removed }}</span>
      </button>
    </UiTooltip>
    <span v-else-if="slow" class="skeleton mx-1.5 h-2.5 w-12 rounded-full" role="status" :aria-label="t('dock.changes.modes.changes')" />
    <UiIconButton :label="t('dock.files.searchFiles')" @click="openSearch">
      <Search class="size-4" aria-hidden="true" />
    </UiIconButton>
  </span>
</template>
