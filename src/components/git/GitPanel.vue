<script setup lang="ts">
import { FileDiff, History, RefreshCw, Search, SendHorizontal, Undo } from '@/components/ui/icons'
import { computed, provide, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import GitChanges from '@/components/git/GitChanges.vue'
import GitDiffPane from '@/components/git/GitDiffPane.vue'
import GitHistory from '@/components/git/GitHistory.vue'
import ShellDockToolbar from '@/components/shell/ShellDockToolbar.vue'
import ShellDockToolbarButton from '@/components/shell/ShellDockToolbarButton.vue'
import ShellResizeHandle from '@/components/shell/ShellResizeHandle.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { useDockEditor } from '@/composables/useDockEditor'
import { GIT_CHANGES, useGitChanges } from '@/composables/useGitChanges'
import { EXPLORER } from '@/stores/files'
import { useGitPanelStore } from '@/stores/gitPanel'
import { type GitMode, useLayoutStore } from '@/stores/layout'
import { useToastsStore } from '@/stores/toasts'

// Volet Git, comme VS Code et monocode : modes Changements et Historique, retenus par projet. Un diff s'ouvre à gauche
// de la liste, ou se déplie sous sa ligne si le panneau est partagé ou trop étroit.
const { t } = useI18n()
const layout = useLayoutStore()
const gitPanel = useGitPanelStore()
const toasts = useToastsStore()
const changes = useGitChanges()
provide(GIT_CHANGES, changes)
const { chat, files } = changes

// Assez pour lire un diff à côté d'une liste de largeur minimale.
const SIDE_MIN = 560

const mode = computed<GitMode>({
  get: () => layout.gitMode(chat.value?.projectId ?? null),
  set: (value) => layout.setGitMode(chat.value?.projectId ?? null, value),
})
// Un fichier demandé depuis Environnement se montre dans les changements.
watch(
  () => layout.changesFocus,
  (focus) => {
    if (focus) mode.value = 'changes'
  },
  { immediate: true },
)

const tabs = computed(() => (chat.value ? gitPanel.of(chat.value.id).tabs : []))
const { area, listWidth, room, track } = useDockEditor('changes')
// Panneau partagé, même empilé : le diff reste dans la liste, sinon la largeur d'édition ferait passer les zones
// côte à côte puis les empilerait à nouveau.
const sideMode = computed(() => layout.spans('changes') && !layout.right.aside && room.value >= SIDE_MIN)
const sideShown = computed(() => sideMode.value && tabs.value.length > 0)
track(() => sideShown.value)

// ===== Ligne d'outils =====
// Les boutons des modes restent en place d'un mode à l'autre : le focus clavier ne se perd pas en changeant de mode.
const usable = computed(() => !!changes.project.value && !changes.pending.value && changes.status.value !== 'notRepo')
const history = useTemplateRef('history')
const searching = ref(false)
watch(mode, () => (searching.value = false))

async function refreshChanges() {
  await changes.refresh()
  toasts.push({ title: t('feedback.listRefreshed'), body: t('dock.session.files', { n: files.value.length }, files.value.length) })
}
</script>

<template>
  <div ref="area" class="flex min-h-0 flex-1" @pointerenter="changes.freshen">
    <template v-if="sideShown">
      <GitDiffPane class="min-w-0 flex-1" />
      <ShellResizeHandle v-model="listWidth" v-bind="EXPLORER" orientation="vertical" invert :label="t('dock.files.resize')" data-explorer-handle />
    </template>
    <section
      class="flex min-h-0 flex-col"
      :class="sideShown ? 'shrink-0' : 'min-w-0 flex-1'"
      :style="sideShown ? { width: `${listWidth}px` } : undefined"
      :aria-label="t('dock.changes.title')"
    >
      <ShellDockToolbar :label="t('dock.changes.title')">
        <ShellDockToolbarButton :label="t('dock.changes.modes.changes')" :pressed="mode === 'changes'" @click="mode = 'changes'">
          <FileDiff class="size-3.5" aria-hidden="true" />
        </ShellDockToolbarButton>
        <ShellDockToolbarButton :label="t('dock.changes.modes.history')" :pressed="mode === 'history'" @click="mode = 'history'">
          <History class="size-3.5" aria-hidden="true" />
        </ShellDockToolbarButton>
        <template v-if="mode === 'changes'">
          <ShellDockToolbarButton :label="t('dock.changes.revertAll')" :disabled="!usable || !files.length || changes.acting.value" @click="changes.revertAll()">
            <Undo class="size-3.5" aria-hidden="true" />
          </ShellDockToolbarButton>
          <ShellDockToolbarButton :label="t('dock.changes.refresh')" :disabled="!usable" :loading="changes.loading.value" @click="refreshChanges">
            <RefreshCw class="size-3.5" aria-hidden="true" />
          </ShellDockToolbarButton>
        </template>
        <template v-else>
          <ShellDockToolbarButton :label="t('dock.changes.history.search')" :pressed="searching" :disabled="!usable" @click="searching = !searching">
            <Search class="size-3.5" aria-hidden="true" />
          </ShellDockToolbarButton>
          <ShellDockToolbarButton :label="t('dock.changes.refresh')" :disabled="!usable" :loading="history?.loading" @click="history?.refresh()">
            <RefreshCw class="size-3.5" aria-hidden="true" />
          </ShellDockToolbarButton>
        </template>
        <template v-if="mode === 'changes' && changes.allComments.value.length" #end>
          <UiTooltip :label="changes.sendLabel.value">
            <button
              type="button"
              class="flex h-6 shrink-0 items-center gap-1.5 rounded-md bg-accent px-2 text-xs text-canvas tabular-nums hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
              :aria-label="changes.sendLabel.value"
              @click="changes.sendComments"
            >
              <SendHorizontal class="size-3.5" aria-hidden="true" />
              {{ changes.allComments.value.length }}
            </button>
          </UiTooltip>
        </template>
      </ShellDockToolbar>
      <GitChanges v-if="mode === 'changes'" :side="sideMode" />
      <GitHistory v-else ref="history" v-model:searching="searching" :side="sideMode" />
    </section>
  </div>
</template>
