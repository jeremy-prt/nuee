<script setup lang="ts">
import { FileDiff, History, SendHorizontal } from '@/components/ui/icons'
import { computed, provide, watch } from 'vue'
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

// Volet Git, comme VS Code et monocode : modes Changements et Historique, retenus par projet. Un diff s'ouvre à gauche
// de la liste, ou se déplie sous sa ligne si le panneau est partagé ou trop étroit.
const { t } = useI18n()
const layout = useLayoutStore()
const gitPanel = useGitPanelStore()
const changes = useGitChanges()
provide(GIT_CHANGES, changes)
const { chat } = changes

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
        <!-- Comme l'Explorateur : les modes en icônes à droite (demande de Jérémy), les commentaires à envoyer devant. -->
        <template #end>
          <template v-if="mode === 'changes' && changes.allComments.value.length">
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
          <ShellDockToolbarButton :label="t('dock.changes.modes.changes')" :pressed="mode === 'changes'" @click="mode = 'changes'">
            <FileDiff class="size-3.5" aria-hidden="true" />
          </ShellDockToolbarButton>
          <ShellDockToolbarButton :label="t('dock.changes.modes.history')" :pressed="mode === 'history'" @click="mode = 'history'">
            <History class="size-3.5" aria-hidden="true" />
          </ShellDockToolbarButton>
        </template>
      </ShellDockToolbar>
      <GitChanges v-if="mode === 'changes'" :side="sideMode" />
      <GitHistory v-else :side="sideMode" />
    </section>
  </div>
</template>
