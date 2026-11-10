<script setup lang="ts">
import { CircleAlert, CircleCheck, MessageQuestion, Pin, PinOff, ShieldQuestion, X } from '@/components/ui/icons'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatSpinner from '@/components/chat/ChatSpinner.vue'
import SettingsAgentLogo from '@/components/settings/SettingsAgentLogo.vue'
import UiContextMenu from '@/components/ui/UiContextMenu.vue'
import UiMenuItem from '@/components/ui/UiMenuItem.vue'
import UiMenuSeparator from '@/components/ui/UiMenuSeparator.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { useLayoutDrag } from '@/composables/useLayoutDrag'
import { sessionStatusColor, useSessionStatus } from '@/composables/useSessionStatus'
import { useTabTitle } from '@/composables/useTabTitle'
import { useAttentionStore } from '@/stores/attention'
import { useDragStore } from '@/stores/drag'
import { useShortcutsStore } from '@/stores/shortcuts'
import { type Tab, useWorkspaceStore } from '@/stores/workspace'

const props = defineProps<{ tab: Tab; index: number; count: number; rank: number | null }>()

const { t } = useI18n()
const shortcuts = useShortcutsStore()
const attention = useAttentionStore()
const workspace = useWorkspaceStore()
const drag = useDragStore()
const { startTabDrag } = useLayoutDrag()
const { tabTitle } = useTabTitle()
const sessionStatus = useSessionStatus()

const status = computed(() => sessionStatus(props.tab.id))
const active = computed(() => props.tab.id === workspace.activeTabId)
// Épinglé : l'icône seule, sans croix ni glisser, comme les onglets épinglés des navigateurs.
const pinned = computed(() => workspace.isTabPinned(props.tab.id))
const statusIcons = { approval: ShieldQuestion, question: MessageQuestion, done: CircleCheck, failed: CircleAlert }
</script>

<template>
  <!-- Rétrécit jusqu'à 120 px (l'actif garde son titre lisible), au-delà la bande défile (ShellTabs). -->
  <UiContextMenu :class="pinned ? 'flex shrink-0' : 'flex max-w-52 min-w-30 flex-[0_1_13rem]'">
    <UiTooltip :label="tabTitle(tab)" :disabled="!pinned">
      <div
        role="tab"
        tabindex="0"
        :data-tab-id="tab.id"
        :data-tab-pinned="pinned || undefined"
        :aria-selected="active"
        :aria-label="pinned ? tabTitle(tab) : undefined"
        class="group relative flex h-7 min-w-0 items-center gap-1.5 rounded-md text-xs focus-visible:outline-2 focus-visible:outline-ring"
        :class="[
          pinned ? 'w-8 justify-center' : 'w-full px-2',
          active ? 'bg-selection text-content' : 'text-muted hover:bg-selection-hover hover:text-content',
          { 'opacity-50': drag.source?.kind === 'tab' && drag.source.id === tab.id },
        ]"
        @pointerdown="!pinned && startTabDrag($event, tab.id)"
        @click="workspace.openTab(tab.id)"
        @keydown.enter.prevent="workspace.openTab(tab.id)"
        @keydown.space.prevent="workspace.openTab(tab.id)"
        @auxclick.middle="!pinned && workspace.closeTab(tab.id)"
      >
        <!-- Une seule icône (choix de Jérémy) : l'état de la session s'il y en a un, sinon le point du non-lu, sinon le
             logo de l'agent. Mêmes icônes et couleurs que les cartes de la liste. -->
        <!-- Case fixe : le chiffre affiché sous ⌘ prend la place de l'icône sans décaler le titre. -->
        <span class="-my-0.5 grid size-5 shrink-0 place-items-center">
          <kbd v-if="rank" class="grid size-4 shrink-0 place-items-center rounded-[4px] border border-content/25 bg-content/8 font-sans text-[10px] text-content/80 tabular-nums">{{ rank }}</kbd>
          <template v-else-if="status">
            <ChatSpinner v-if="status === 'working'" :agent="tab.agent" class="size-3.5 text-xs" />
            <component :is="statusIcons[status as keyof typeof statusIcons]" v-else class="size-3.5 shrink-0" :class="sessionStatusColor[status]" aria-hidden="true" />
            <span class="sr-only">{{ t(`chats.status.${status}`) }}</span>
          </template>
          <span v-else-if="attention.isUnseen(tab.id)" class="size-1.5 shrink-0 rounded-full bg-signal">
            <span class="sr-only">{{ t('attention.unseen') }}</span>
          </span>
          <SettingsAgentLogo v-else :id="tab.agent" small />
        </span>
        <!-- Comme les sessions : la croix n'occupe pas de place, elle se pose au survol sur la fin du titre, qui s'estompe. -->
        <!-- Fondu calé sur la croix (20 px à 4 px du bord, le titre finit à 8 px) : le texte reste lisible jusqu'à elle. -->
        <span v-if="!pinned" class="truncate group-focus-within:[mask-image:linear-gradient(to_left,transparent_1rem,black_1.375rem)] group-hover:[mask-image:linear-gradient(to_left,transparent_1rem,black_1.375rem)]">{{ tabTitle(tab) }}</span>
        <UiTooltip v-if="!pinned" :label="t('workspace.closeTab')" :shortcut="shortcuts.label('closeTab')">
          <button
            type="button"
            tabindex="-1"
            class="absolute end-1 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-md text-muted opacity-0 transition-opacity duration-(--hover-duration) group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-selection-inner hover:text-content motion-reduce:transition-none"
            :aria-label="t('workspace.closeTab')"
            @click.stop="workspace.closeTab(tab.id)"
          >
            <X class="size-3" aria-hidden="true" />
          </button>
        </UiTooltip>
      </div>
    </UiTooltip>
    <template v-if="pinned" #menu>
      <UiMenuItem :label="t('workspace.unpinTab')" :icon="PinOff" @select="workspace.togglePinTab(tab.id)" />
    </template>
    <template v-else #menu>
      <UiMenuItem :label="t('workspace.pinTab')" :icon="Pin" :disabled="!tab.started" @select="workspace.togglePinTab(tab.id)" />
      <UiMenuSeparator />
      <UiMenuItem :label="t('workspace.closeTab')" :icon="X" :shortcut="shortcuts.label('closeTab')" @select="workspace.closeTab(tab.id)" />
      <UiMenuItem :label="t('workspace.closeOthers')" :disabled="count < 2" @select="workspace.closeTabs(tab.id, 'others')" />
      <UiMenuItem :label="t('workspace.closeRight')" :disabled="index === count - 1" @select="workspace.closeTabs(tab.id, 'right')" />
      <UiMenuItem :label="t('workspace.closeLeft')" :disabled="index === 0" @select="workspace.closeTabs(tab.id, 'left')" />
      <UiMenuSeparator />
      <UiMenuItem :label="t('workspace.closeAll')" @select="workspace.closeTabs(tab.id, 'all')" />
    </template>
  </UiContextMenu>
</template>
