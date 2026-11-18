<script setup lang="ts">
import { Archive, Check, ChevronDown, ChevronRight, CircleAlert, CircleCheck, GitBranch, MessageQuestion, Orchestra, PinOff, ShieldQuestion, Undo } from '@/components/ui/icons'
import { HoverCardContent, HoverCardPortal, HoverCardRoot, HoverCardTrigger } from 'reka-ui'
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatDiffStat from '@/components/chat/ChatDiffStat.vue'
import ChatSpinner from '@/components/chat/ChatSpinner.vue'
import SettingsAgentLogo from '@/components/settings/SettingsAgentLogo.vue'
import ShellChatMenu from '@/components/shell/ShellChatMenu.vue'
import UiContextMenu from '@/components/ui/UiContextMenu.vue'
import UiMoreMenu from '@/components/ui/UiMoreMenu.vue'
import UiRenameField from '@/components/ui/UiRenameField.vue'
import UiTitleReveal from '@/components/ui/UiTitleReveal.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { useLayoutDrag } from '@/composables/useLayoutDrag'
import { useProjectActions } from '@/composables/useProjectActions'
import { sessionStatusColor, useSessionStatus } from '@/composables/useSessionStatus'
import { useTabTitle } from '@/composables/useTabTitle'
import { useCatalogStore } from '@/stores/catalog'
import { useClockStore } from '@/stores/clock'
import { useDragStore } from '@/stores/drag'
import { useLayoutStore } from '@/stores/layout'
import { useNavigationStore } from '@/stores/navigation'
import { useOrchestraStore } from '@/stores/orchestra'
import { useShortcutsStore } from '@/stores/shortcuts'
import { type Tab, useWorkspaceStore } from '@/stores/workspace'
import { useWorktreesStore } from '@/stores/worktrees'
import { agents } from '@/utils/agents'
import { formatSince } from '@/utils/duration'

// `group` : la session a lancé celles imbriquées dessous ; flèche à côté du titre et point pour les non lues.
// `nested` : rangée sous sa parente, en ligne fine tant qu'elle ne travaille ni n'attend.
const props = defineProps<{ tab: Tab; group?: { open: boolean; unread: number }; nested?: boolean }>()
const emit = defineEmits<{ toggle: [] }>()

const { t, locale } = useI18n()
const catalog = useCatalogStore()
const clock = useClockStore()
const layout = useLayoutStore()
const navigation = useNavigationStore()
const shortcuts = useShortcutsStore()
const workspace = useWorkspaceStore()
const worktrees = useWorktreesStore()
const actions = useProjectActions()
const { startChatDrag } = useLayoutDrag()
const drag = useDragStore()
const { tabTitle } = useTabTitle()

catalog.load(props.tab.agent)

const row = useTemplateRef<HTMLElement>('row')
const renaming = ref(false)
const menuOpen = ref(false)
// Lancé au clavier : le focus revient où il était (la ligne, ou le champ de saisie pour ⌘R). À la souris, il
// reste où il tombe.
let returnFocus: HTMLElement | null = null

const active = computed(() => props.tab.id === workspace.activeTabId)
const orchestra = useOrchestraStore()
const orchestrating = computed(() => orchestra.isOn(props.tab.id))

// Sans état, la carte donne l'heure de la dernière activité.
const sessionStatus = useSessionStatus()
const status = computed(() => sessionStatus(props.tab.id))
// Une session au repos s'efface : celles qui travaillent, attendent, viennent de finir ou sont ouvertes en onglet
// ressortent.
const opened = computed(() => workspace.contextTabs.some((item) => item.id === props.tab.id))
const settled = computed(() => !!props.tab.settledAt)
const quiet = computed(() => settled.value || (!status.value && !active.value && !opened.value))
// Comme T3 Code : une session garde sa carte tant qu'elle n'est pas classée, même finie ; classée, ou rangée sous sa
// parente sans travailler ni attendre, elle passe en ligne fine.
const compact = computed(() => {
  if (settled.value) return true
  if (status.value === 'working' || status.value === 'approval' || status.value === 'question') return false
  return !!props.nested
})
const titleTone = computed(() => (quiet.value && !menuOpen.value ? 'text-muted group-hover/row:text-content group-focus-within/row:text-content' : ''))

const since = computed(() => formatSince(props.tab.updatedAt, clock.now, locale.value, compact.value))
const branch = computed(() => worktrees.branchOf(props.tab))
const model = computed(() => catalog.modelLabel(props.tab.agent, props.tab.model))
const diff = computed(() => (props.tab.added || props.tab.removed ? { added: props.tab.added, removed: props.tab.removed } : null))

// Au survol, les boutons se posent à droite de la dernière ligne (la branche, sinon le titre) : le texte s'estompe
// dessous et le diff leur laisse la place.
const fadeUnder = computed(() => (menuOpen.value ? 'fade-under-three' : 'group-focus-within:fade-under-three group-hover:fade-under-three'))
// Carte : les actions prennent la place du statut sur la ligne du haut, comme T3 Code ; le modèle s'estompe dessous.
const primary = computed(() => {
  if (props.tab.pinned) return { label: t('chats.unpin'), short: t('chats.unpin'), icon: PinOff, run: () => actions.togglePin(props.tab) }
  if (settled.value) return { label: t('chats.unsettle'), short: t('chats.unsettle'), icon: Undo, run: () => actions.toggleSettled(props.tab) }
  return { label: t('chats.settle'), short: t('chats.settleShort'), icon: Check, run: () => actions.toggleSettled(props.tab) }
})
const fadeActions = computed(() => (menuOpen.value ? 'fade-under-actions' : 'group-focus-within:fade-under-actions group-hover:fade-under-actions'))
// Flèche du groupe au survol seulement, comme l'app Claude.
const chevronShown = computed(() => (menuOpen.value ? '' : 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100'))
const hideUnder = computed(() => (menuOpen.value ? 'hidden' : 'group-focus-within:hidden group-hover:hidden'))

// Le chat peut venir d'un autre contexte (recherche) : on bascule d'abord sur son projet.
// ⌘clic : un onglet de plus, comme un navigateur ; sinon la session prend la place de l'onglet affiché s'il est libre.
function select(event?: MouseEvent) {
  navigation.openChats(props.tab.projectId)
  workspace.openFromList(props.tab.id, !!event?.metaKey)
}

function startRename(from: HTMLElement | null = null) {
  returnFocus = from
  renaming.value = true
}

async function stopRename(title?: string) {
  renaming.value = false
  if (title) await actions.renameChat(props.tab, title)
  if (!returnFocus) return
  await nextTick()
  ;(returnFocus.isConnected ? returnFocus : row.value)?.focus()
}

// ⌘R sur une ligne qui a le focus la renomme, elle, plutôt que la session en cours.
function onKeydown(event: KeyboardEvent) {
  // Flèches droite et gauche : déplier et replier le groupe, comme une arborescence.
  if (props.group && (event.key === 'ArrowRight' || event.key === 'ArrowLeft') && props.group.open === (event.key === 'ArrowLeft')) {
    event.preventDefault()
    emit('toggle')
    return
  }
  if (!shortcuts.matches(event, 'rename')) return
  event.preventDefault()
  event.stopPropagation()
  startRename(row.value)
}

watch(
  () => workspace.renamingId,
  (id) => {
    if (id !== props.tab.id) return
    workspace.renamingId = null
    startRename(document.activeElement instanceof HTMLElement ? document.activeElement : null)
  },
)
</script>

<template>
  <UiContextMenu :disabled="renaming" @update:open="menuOpen = $event">
    <!-- group/row : la carte garde son survol quand le pointeur passe sur ses boutons, posés par-dessus. -->
    <HoverCardRoot :open-delay="300" :close-delay="80">
    <div class="group/row group relative">
      <!-- En renommage, la carte devient un simple cadre : le champ prend la place du titre, rien d'autre ne bouge. -->
      <!-- Fiche au survol de la ligne seule : ses boutons ont leurs propres infobulles. -->
      <HoverCardTrigger as-child>
      <component
        :is="renaming ? 'div' : 'button'"
        ref="row"
        :type="renaming ? undefined : 'button'"
        class="flex w-full rounded-md text-start focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        :class="[
          compact ? 'h-8 items-center gap-2 px-2' : 'flex-col gap-1 p-2',
          { 'opacity-50': drag.source?.kind === 'chat' && drag.source.id === tab.id },
          renaming || active ? 'bg-selection' : menuOpen ? 'bg-selection-hover' : 'group-hover/row:bg-selection-hover',
        ]"
        :aria-current="active && !renaming ? 'true' : undefined"
        :aria-expanded="group && !renaming ? group.open : undefined"
        :aria-keyshortcuts="renaming ? undefined : shortcuts.aria('rename')"
        v-on="renaming ? {} : { click: select, dblclick: () => startRename(), keydown: onKeydown, pointerdown: (e: PointerEvent) => startChatDrag(e, tab.id) }"
      >
        <template v-if="compact">
          <!-- Session avec imbriquées : la flèche prend la place de l'icône au survol, comme l'app Claude. -->
          <span
            v-if="group"
            class="absolute start-2 z-10 size-4 place-items-center text-muted hover:text-content"
            :class="menuOpen ? 'grid' : 'hidden group-focus-within/row:grid group-hover/row:grid'"
            aria-hidden="true"
            @click.stop="emit('toggle')"
            @dblclick.stop
            @pointerdown.stop
          >
            <component :is="group.open ? ChevronDown : ChevronRight" class="size-3.5" :class="{ 'rtl:rotate-180': !group.open }" />
          </span>
          <span
            class="grid size-4 shrink-0 place-items-center"
            :class="[
              status && sessionStatusColor[status],
              group && (menuOpen ? 'invisible' : 'group-focus-within/row:invisible group-hover/row:invisible'),
              { 'opacity-40 grayscale group-hover/row:opacity-100 group-hover/row:grayscale-0': settled && !status },
            ]"
          >
            <ChatSpinner v-if="status === 'working'" :agent="tab.agent" inherit class="text-xs" />
            <ShieldQuestion v-else-if="status === 'approval'" class="size-3.5" aria-hidden="true" />
            <MessageQuestion v-else-if="status === 'question'" class="size-3.5" aria-hidden="true" />
            <CircleCheck v-else-if="status === 'done'" class="size-3.5" aria-hidden="true" />
            <CircleAlert v-else-if="status" class="size-3.5" aria-hidden="true" />
            <Orchestra v-else-if="orchestrating" class="size-3.5 text-violet" aria-hidden="true" />
            <SettingsAgentLogo v-else :id="tab.agent" tiny />
            <span v-if="status" class="sr-only">{{ t(`chats.status.${status}`) }}</span>
            <span v-else-if="orchestrating" class="sr-only">{{ t('composer.orchestra.label') }}</span>
          </span>
          <UiRenameField
            v-if="renaming"
            :value="tabTitle(tab)"
            :label="t('chats.renameLabel')"
            class="-my-0.5 flex-1 text-[13px] font-medium"
            @commit="stopRename"
            @cancel="stopRename()"
          />
          <template v-else>
            <span class="flex min-w-0 flex-1 items-center gap-1" :class="fadeUnder">
              <span class="min-w-0 truncate text-[13px]/5" :class="titleTone"><UiTitleReveal :title="tab.title" :fallback="tabTitle(tab)" /></span>
              <span v-if="opened && !active" class="sr-only">, {{ t('chats.openInTab') }}</span>
            </span>
            <span v-if="group?.unread && !group.open" class="size-1.5 shrink-0 rounded-full bg-signal"><span class="sr-only">, {{ t('chats.nested.unread', { n: group.unread }) }},</span></span>
            <span class="shrink-0 text-[11px] text-muted" :class="hideUnder">{{ since }}</span>
          </template>
        </template>
        <template v-else>
          <span class="flex h-4 items-center gap-1.5 text-[11px] text-muted">
            <template v-if="orchestrating">
              <Orchestra class="size-3 shrink-0 text-violet" aria-hidden="true" />
              <span class="sr-only">{{ t('composer.orchestra.label') }}</span>
            </template>
            <SettingsAgentLogo v-else :id="tab.agent" tiny />
            <span class="min-w-0 flex-1 truncate" :class="fadeActions">{{ model ?? agents[tab.agent].name }}</span>
            <span v-if="status" class="flex shrink-0 items-center gap-1" :class="[sessionStatusColor[status], hideUnder]">
              <ChatSpinner v-if="status === 'working'" :agent="tab.agent" inherit class="text-xs" />
              <ShieldQuestion v-else-if="status === 'approval'" class="size-3" aria-hidden="true" />
              <MessageQuestion v-else-if="status === 'question'" class="size-3" aria-hidden="true" />
              <CircleCheck v-else-if="status === 'done'" class="size-3" aria-hidden="true" />
              <CircleAlert v-else class="size-3" aria-hidden="true" />
              <span :title="t(`chats.status.${status}`)">{{ t(`chats.statusShort.${status}`) }}</span>
            </span>
            <span v-else class="shrink-0" :class="hideUnder">{{ since }}</span>
          </span>
          <span class="flex items-center gap-1.5">
            <UiRenameField
              v-if="renaming"
              :value="tabTitle(tab)"
              :label="t('chats.renameLabel')"
              class="-my-0.5 flex-1 text-[13px] font-medium"
              @commit="stopRename"
              @cancel="stopRename()"
            />
            <span v-else class="flex min-w-0 flex-1 items-center gap-1">
              <span class="min-w-0 truncate text-[13px]/5 font-medium" :class="titleTone"><UiTitleReveal :title="tab.title" :fallback="tabTitle(tab)" /></span>
              <span v-if="opened && !active" class="sr-only">, {{ t('chats.openInTab') }}</span>
              <span v-if="group" class="-m-0.5 grid size-4 shrink-0 place-items-center text-muted hover:text-content" :class="chevronShown" aria-hidden="true" @click.stop="emit('toggle')" @dblclick.stop @pointerdown.stop>
                <component :is="group.open ? ChevronDown : ChevronRight" class="size-3" />
              </span>
              <span v-if="group?.unread && !group.open" class="ms-0.5 size-1.5 shrink-0 rounded-full bg-signal"><span class="sr-only">, {{ t('chats.nested.unread', { n: group.unread }) }},</span></span>
            </span>
            <ChatDiffStat v-if="!branch && diff && !renaming" v-bind="diff" plain class="text-[11px]" />
          </span>
          <span v-if="branch" class="flex h-4 items-center gap-1.5 text-[11px] text-muted">
            <span class="flex min-w-0 flex-1 items-center gap-1">
              <GitBranch class="size-3 shrink-0" aria-hidden="true" />
              <span class="min-w-0 truncate">{{ branch }}</span>
            </span>
            <ChatDiffStat v-if="diff" v-bind="diff" plain />
          </span>
        </template>
      </component>
      </HoverCardTrigger>
      <div
        v-if="!renaming"
        class="absolute end-1 top-1 flex gap-0.5 transition-opacity duration-(--hover-duration) ease-out group-hover:opacity-100 focus-within:opacity-100 motion-reduce:transition-none"
        :class="menuOpen ? 'opacity-100' : 'opacity-0'"
      >
        <!-- Épinglée : elle est là pour rester en haut, l'action rapide la désépingle ; « Classer » reste dans « … ». -->
        <!-- Sur une carte, le bouton dit déjà son action : l'infobulle ne ferait que la répéter. -->
        <UiTooltip :label="primary.label" :disabled="!compact">
          <button
            type="button"
            :class="compact ? 'grid size-6 place-items-center' : 'flex h-6 items-center gap-1 px-1.5'"
            class="rounded-sm text-muted hover:bg-selection-inner hover:text-content focus-visible:outline-2 focus-visible:outline-ring"
            :aria-label="primary.label"
            @click="primary.run"
          >
            <component :is="primary.icon" class="size-3.5" aria-hidden="true" />
            <span v-if="!compact" class="text-[11px]">{{ primary.short }}</span>
          </button>
        </UiTooltip>
        <UiTooltip :label="t('chats.archive')">
          <button
            type="button"
            class="grid size-6 place-items-center rounded-sm text-muted hover:bg-selection-inner hover:text-content focus-visible:outline-2 focus-visible:outline-ring"
            :aria-label="t('chats.archive')"
            @click="actions.archiveChat(tab)"
          >
            <Archive class="size-3.5" aria-hidden="true" />
          </button>
        </UiTooltip>
        <UiMoreMenu :label="t('menu.more')" :keep-focus="() => renaming" @update:open="menuOpen = $event">
          <ShellChatMenu :tab="tab" @rename="startRename()" />
        </UiMoreMenu>
      </div>
    </div>
    <!-- Sur une ligne fine seulement : une carte affiche déjà modèle, branche et diff. -->
    <HoverCardPortal v-if="compact && !renaming && !menuOpen && !drag.source">
      <HoverCardContent side="right" align="start" :side-offset="10" :collision-padding="8" class="ui-pop z-50 w-64 px-3 py-2.5 text-xs">
        <p class="truncate text-[13px] font-medium text-content">{{ tabTitle(tab) }}</p>
        <dl class="mt-1.5 space-y-1 text-muted">
          <div class="flex items-center gap-1.5">
            <dt class="sr-only">{{ t('chats.card.status') }}</dt>
            <dd class="min-w-0 truncate" :class="status && sessionStatusColor[status]">{{ status ? t(`chats.status.${status}`) : settled ? t('chats.card.settled') : t('chats.card.idle') }} · {{ since }}</dd>
          </div>
          <div class="flex items-center gap-1.5">
            <dt class="sr-only">{{ t('chats.card.model') }}</dt>
            <dd class="min-w-0 truncate">{{ model ?? agents[tab.agent].name }}</dd>
          </div>
          <div v-if="branch" class="flex items-center gap-1.5">
            <dt><GitBranch class="size-3" aria-hidden="true" /><span class="sr-only">{{ t('chats.card.branch') }}</span></dt>
            <dd class="min-w-0 truncate">{{ branch }}</dd>
          </div>
          <div v-if="diff" class="flex items-center gap-1.5">
            <dt class="sr-only">{{ t('chats.card.changes') }}</dt>
            <dd><ChatDiffStat v-bind="diff" plain /></dd>
          </div>
        </dl>
      </HoverCardContent>
    </HoverCardPortal>
    </HoverCardRoot>
    <template #menu><ShellChatMenu :tab="tab" @rename="startRename()" /></template>
  </UiContextMenu>
</template>
