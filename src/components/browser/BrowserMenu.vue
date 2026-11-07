<script setup lang="ts">
import { Ellipsis, Moon, PanelRight, Smartphone, Sun, Tablet, Trash2 } from '@/components/ui/icons'
import { DropdownMenuContent, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger } from 'reka-ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import UiMenuChoices from '@/components/ui/UiMenuChoices.vue'
import type { UiMenuSection } from '@/components/ui/UiMenu.vue'
import UiMenuItem from '@/components/ui/UiMenuItem.vue'
import UiMenuSeparator from '@/components/ui/UiMenuSeparator.vue'
import UiMenuSub from '@/components/ui/UiMenuSub.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { menuPanel } from '@/components/ui/menuRow'
import { useTerminalChat } from '@/composables/useTerminalChat'
import type { Viewport } from '@/ipc/bindings/Viewport'
import { useBrowserStore } from '@/stores/browser'
import { useDialogStore } from '@/stores/dialog'

// Menu « … » du volet Navigateur : taille d'écran et apparence de la page, effacement des données du projet.
const SIZES: Record<string, Viewport | null> = {
  pane: null,
  mobile: { width: 375, height: 812 },
  tablet: { width: 768, height: 1024 },
}

const { t } = useI18n()
const browser = useBrowserStore()
const dialog = useDialogStore()
const { chat } = useTerminalChat()
const tab = computed(() => (chat.value ? browser.activeOf(chat.value.id) : null))

const size = computed<UiMenuSection>(() => {
  const viewport = tab.value?.viewport
  const value = !viewport ? 'pane' : viewport.width === 375 ? 'mobile' : viewport.width === 768 ? 'tablet' : 'custom'
  return {
    id: 'size',
    value,
    options: [
      { value: 'pane', label: t('dock.browser.size.pane'), icon: PanelRight },
      { value: 'mobile', label: t('dock.browser.size.mobile'), icon: Smartphone },
      { value: 'tablet', label: t('dock.browser.size.tablet'), icon: Tablet },
    ],
  }
})

const scheme = computed<UiMenuSection>(() => ({
  id: 'scheme',
  value: tab.value?.colorScheme ?? 'app',
  options: [
    { value: 'app', label: t('dock.browser.scheme.app'), icon: PanelRight },
    { value: 'light', label: t('dock.browser.scheme.light'), icon: Sun },
    { value: 'dark', label: t('dock.browser.scheme.dark'), icon: Moon },
  ],
}))

function setSize(value: string) {
  if (tab.value && value in SIZES) browser.emulate(tab.value.id, SIZES[value]!, tab.value.colorScheme)
}

function setScheme(value: string) {
  if (tab.value) browser.emulate(tab.value.id, tab.value.viewport, value === 'light' || value === 'dark' ? value : null)
}

async function clear() {
  if (!chat.value) return
  const confirmed = await dialog.confirm({
    title: t('dock.browser.clear.title'),
    message: t('dock.browser.clear.message'),
    confirmLabel: t('dock.browser.clear.confirm'),
    danger: true,
  })
  if (confirmed) browser.clearData(chat.value.id)
}
</script>

<template>
  <UiTooltip :label="t('dock.browser.menu')">
    <span class="flex">
      <DropdownMenuRoot :modal="false">
        <DropdownMenuTrigger
          :disabled="!chat"
          class="grid size-7 place-items-center rounded-md text-muted hover:bg-selection-hover hover:text-content focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40 aria-expanded:bg-selection-hover aria-expanded:text-content"
          :aria-label="t('dock.browser.menu')"
        >
          <Ellipsis class="size-4" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent
            align="end"
            :side-offset="4"
            :collision-padding="8"
            :class="[menuPanel, 'max-h-(--reka-dropdown-menu-content-available-height) w-60']"
          >
            <template v-if="tab">
              <UiMenuSub :label="t('dock.browser.size.title')" :icon="Smartphone">
                <UiMenuChoices :section="size" @select="setSize" />
              </UiMenuSub>
              <UiMenuSub :label="t('dock.browser.scheme.title')" :icon="Moon">
                <UiMenuChoices :section="scheme" @select="setScheme" />
              </UiMenuSub>
              <UiMenuSeparator />
            </template>
            <UiMenuItem :label="t('dock.browser.clear.label')" :icon="Trash2" danger @select="clear" />
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>
    </span>
  </UiTooltip>
</template>
