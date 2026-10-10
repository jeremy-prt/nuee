import { defineStore } from 'pinia'
import { computed, reactive, ref, watch, watchEffect } from 'vue'
import { i18nGlobal } from '@/i18n'
import { notificationBadge, notificationSend, notificationWithdraw, onNotificationClicked } from '@/ipc/notification'
import { isMacosApp, isTauriApp } from '@/ipc/system'
import { onWindowFocus } from '@/ipc/window'
import { useGeneralStore } from '@/stores/general'
import { useNavigationStore } from '@/stores/navigation'
import { useToastsStore } from '@/stores/toasts'
import { type Tab, useWorkspaceStore } from '@/stores/workspace'
import { agents } from '@/utils/agents'
import { playCue } from '@/utils/sounds'

// done : réponse complète. failed : arrêt sur une erreur. approval : l'agent attend une autorisation.
export type Signal = 'done' | 'failed' | 'approval'

// Prévient quand un agent a fini ou attend dans un chat qu'on ne regarde pas : son, message dans la fenêtre,
// notification du système si l'app est en arrière-plan, et pastille du Dock tant que le chat n'est pas vu.
export const useAttentionStore = defineStore('attention', () => {
  const general = useGeneralStore()
  const navigation = useNavigationStore()
  const workspace = useWorkspaceStore()
  const toasts = useToastsStore()

  const focused = ref(document.hasFocus())
  if (isTauriApp()) {
    onWindowFocus((value) => {
      focused.value = value
    }).catch(() => {})
  } else {
    window.addEventListener('focus', () => (focused.value = true))
    window.addEventListener('blur', () => (focused.value = false))
  }

  const unseen = reactive(new Set<string>())
  const shown = computed(() => (focused.value && navigation.view === 'chats' ? workspace.panes : []))

  // Un chat vu sort de la liste, et ses notifications partent avec lui.
  watchEffect(() => {
    for (const id of shown.value) {
      if (!unseen.delete(id)) continue
      toasts.dismissTopic(id)
      if (isTauriApp()) notificationWithdraw(id).catch(() => {})
    }
  })

  // Un chat supprimé entre-temps ne compte plus.
  const unseenCount = computed(() => workspace.tabs.filter((tab) => unseen.has(tab.id)).length)

  if (isMacosApp()) {
    watch(
      () => (general.dockBadge ? unseenCount.value : 0),
      (count) => {
        notificationBadge(count).catch(() => {})
      },
    )
  }

  function open(tab: Tab) {
    navigation.openChats(tab.projectId)
    workspace.show(tab.id)
  }

  if (isTauriApp()) {
    onNotificationClicked((chatId) => {
      const tab = workspace.tabs.find((item) => item.id === chatId)
      if (tab) open(tab)
    }).catch(() => {})
  }

  function signal(chatId: string, kind: Signal) {
    if (general.sounds) playCue(kind === 'done' ? 'done' : 'attention')
    if (shown.value.includes(chatId)) return
    unseen.add(chatId)

    const tab = workspace.tabs.find((item) => item.id === chatId)
    if (!tab) return
    const { t } = i18nGlobal()
    const title = tab.title ?? t('workspace.chatTitle', { n: tab.number })
    const body = t(`attention.${kind}`, { agent: agents[tab.agent].name })
    if (!focused.value && general.systemNotifications && isTauriApp()) {
      notificationSend(chatId, title, body).catch(() => {})
    }
    // Aussi quand la fenêtre est en arrière-plan : reka suspend sa disparition jusqu'au retour dans l'app.
    if (general.appNotifications) {
      toasts.push({ title, body, topic: chatId, action: { label: t('attention.open'), run: () => open(tab) } })
    }
  }

  function isUnseen(chatId: string) {
    return unseen.has(chatId)
  }

  return { signal, isUnseen }
})
