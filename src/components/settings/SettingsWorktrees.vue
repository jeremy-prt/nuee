<script setup lang="ts">
import { FolderOpen, GitBranch, MessageSquarePlus, Trash2 } from '@/components/ui/icons'
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsWorktreeDialog from '@/components/settings/SettingsWorktreeDialog.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { isAppError } from '@/ipc/agent'
import type { Worktree } from '@/ipc/bindings/Worktree'
import { projectReveal } from '@/ipc/project'
import { isMacosApp } from '@/ipc/system'
import { useDialogStore } from '@/stores/dialog'
import { useNavigationStore } from '@/stores/navigation'
import { useProjectsStore } from '@/stores/projects'
import { useToastsStore } from '@/stores/toasts'
import { useWorkspaceStore } from '@/stores/workspace'
import { useWorktreesStore } from '@/stores/worktrees'

const props = defineProps<{ id: string }>()

const { t } = useI18n()
const projects = useProjectsStore()
const worktrees = useWorktreesStore()
const workspace = useWorkspaceStore()
const navigation = useNavigationStore()
const dialog = useDialogStore()
const toasts = useToastsStore()

const project = computed(() => projects.byId(props.id))
// Relue à chaque ouverture : un worktree a pu naître ou disparaître dans un terminal.
watch(project, (current) => current && worktrees.load(current), { immediate: true })

const list = computed(() => worktrees.lists[props.id])
const others = computed(() => list.value?.filter((tree) => !tree.main) ?? [])
const removing = ref<string | null>(null)
const revealLabel = isMacosApp() ? 'settings.projects.reveal' : 'settings.projects.revealFolder'

function sessionsIn(tree: Worktree) {
  return workspace.tabsFor(props.id).filter((tab) => (tree.main ? !tab.worktree : tab.worktree && tab.worktreePath === tree.path)).length
}

function title(tree: Worktree) {
  return tree.branch ?? t('settings.projects.worktrees.detached')
}

// Ce qui empêche la suppression ; un dossier introuvable se retire de la liste sans risque.
function blocked(tree: Worktree) {
  if (tree.locked) return t('settings.projects.worktrees.blocked.locked')
  if (!tree.branch) return t('settings.projects.worktrees.blocked.detached')
  if (tree.state === 'changed') return t('settings.projects.worktrees.blocked.changed')
  return null
}

async function reveal(tree: Worktree) {
  try {
    await projectReveal(tree.path)
  } catch (error) {
    toasts.push({ kind: 'error', title: t('settings.projects.revealFailed'), body: isAppError(error) ? error.message : String(error) })
  }
}

function openSession(tree: Worktree) {
  navigation.openChats(props.id)
  workspace.openChat(null, tree.main ? null : tree.path)
}

async function remove(tree: Worktree, event: MouseEvent) {
  const current = project.value
  if (!current || blocked(tree) || removing.value) return
  const byKeyboard = event.detail === 0
  const n = sessionsIn(tree)
  const confirmed = await dialog.confirm({
    title: t('settings.projects.worktrees.deleteTitle', { branch: title(tree) }),
    message: t('settings.projects.worktrees.deleteMessage', { n }, n),
    confirmLabel: t('settings.projects.worktrees.deleteConfirm'),
    danger: true,
  })
  if (!confirmed) return
  const index = others.value.findIndex((item) => item.path === tree.path)
  const neighbour = others.value[index + 1] ?? others.value[index - 1]
  removing.value = tree.path
  try {
    await worktrees.remove(current, tree.path)
  } catch (error) {
    toasts.push({ kind: 'error', title: t('settings.projects.worktrees.deleteFailed'), body: isAppError(error) ? error.message : String(error) })
    return
  } finally {
    removing.value = null
  }
  // La ligne disparaît : au clavier, le focus passe à la suppression d'un voisin, sinon au bouton de l'en-tête.
  if (!byKeyboard) return
  await nextTick()
  const next = neighbour && document.querySelector<HTMLElement>(`[data-worktree-delete="${CSS.escape(neighbour.path)}"]`)
  ;(next || document.querySelector<HTMLElement>('[data-worktree-create]'))?.focus()
}
</script>

<template>
  <p v-if="!project" class="pt-8 text-sm text-muted">{{ t('settings.projects.missing') }}</p>
  <template v-else>
    <p class="mt-1.5 max-w-xl text-sm text-muted">{{ t('settings.projects.worktrees.hint') }}</p>

    <p v-if="!list" class="mt-8 text-sm text-muted">{{ t('settings.projects.worktrees.loading') }}</p>
    <template v-else>
      <ul class="mt-8 overflow-hidden rounded-xl border border-stroke bg-content/3" :aria-label="t('settings.projects.worktrees.title')">
        <li v-for="tree in list" :key="tree.path" class="group flex items-center gap-3 border-b border-stroke px-4 py-2 last:border-b-0">
          <GitBranch class="size-4 shrink-0 text-muted" aria-hidden="true" />
          <div class="min-w-0 flex-1">
            <p class="flex min-w-0 items-center gap-2">
              <span class="truncate text-sm font-medium">{{ title(tree) }}</span>
              <span v-if="tree.state === 'changed'" class="shrink-0 rounded bg-warning/15 px-1.5 py-px text-[11px] text-warning">
                {{ t('settings.projects.worktrees.states.changed') }}
              </span>
              <span v-else-if="tree.state === 'missing'" class="shrink-0 rounded bg-content/8 px-1.5 py-px text-[11px] text-muted">
                {{ t('settings.projects.worktrees.states.missing') }}
              </span>
            </p>
            <p class="flex min-w-0 text-xs text-muted">
              <span v-if="tree.main" class="truncate">{{ t('settings.projects.worktrees.projectFolder') }}</span>
              <span v-else class="truncate font-mono" :title="tree.path">{{ tree.path }}</span>
              <span v-if="sessionsIn(tree)" class="shrink-0 tabular-nums">&nbsp;· {{ t('settings.projects.worktrees.sessions', { n: sessionsIn(tree) }, sessionsIn(tree)) }}</span>
            </p>
          </div>
          <!-- Visibles au survol ou quand le clavier entre dans la ligne : la liste reste calme. -->
          <div class="flex shrink-0 items-center opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 motion-reduce:transition-none">
            <UiIconButton :label="t(revealLabel)" :disabled="tree.state === 'missing'" @click="reveal(tree)">
              <FolderOpen class="size-3.5" aria-hidden="true" />
            </UiIconButton>
            <UiIconButton :label="t('settings.projects.worktrees.newSession')" :disabled="tree.state === 'missing'" @click="openSession(tree)">
              <MessageSquarePlus class="size-3.5" aria-hidden="true" />
            </UiIconButton>
            <!-- Refusée, la suppression reste atteignable au clavier : son infobulle dit pourquoi. -->
            <UiTooltip v-if="!tree.main" :label="blocked(tree) ?? t('settings.projects.worktrees.delete')">
              <button
                type="button"
                class="grid size-7 shrink-0 place-items-center rounded-md text-muted focus-visible:outline-2 focus-visible:outline-ring"
                :class="blocked(tree) ? 'cursor-not-allowed opacity-40' : 'hover:bg-danger/15 hover:text-danger'"
                :aria-label="t('settings.projects.worktrees.delete')"
                :aria-disabled="blocked(tree) ? 'true' : undefined"
                :aria-busy="removing === tree.path || undefined"
                :data-worktree-delete="tree.path"
                @click="remove(tree, $event)"
              >
                <Trash2 class="size-3.5" aria-hidden="true" />
              </button>
            </UiTooltip>
          </div>
        </li>
      </ul>

      <div v-if="!others.length" class="mt-4 rounded-xl border border-stroke bg-content/3 px-4 py-5">
        <p class="text-sm font-medium">{{ t('settings.projects.worktrees.empty') }}</p>
        <p class="mt-0.5 text-xs/relaxed text-muted">{{ t('settings.projects.worktrees.emptyHint') }}</p>
      </div>
    </template>
    <SettingsWorktreeDialog v-model:open="worktrees.creating" :project="project" :trees="list ?? []" />
  </template>
</template>
