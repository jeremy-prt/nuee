<script setup lang="ts">
import { CircleAlert, RefreshCw } from '@/components/ui/icons'
import { onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import UiButton from '@/components/ui/UiButton.vue'
import type { BrowserTab } from '@/ipc/bindings/BrowserTab'
import type { PaneRect } from '@/ipc/bindings/PaneRect'
import { browserPlace, browserSnapshot } from '@/ipc/browser'
import { useAppearanceStore } from '@/stores/appearance'
import { useBrowserStore } from '@/stores/browser'

// Place réservée à la page : la WKWebView native est posée par-dessus, au même endroit. Rien de Nuée ne peut passer
// au-dessus d'elle : quand un menu, une confirmation ou un message la chevauche, la page cède la place à sa capture.
const props = defineProps<{ tab: BrowserTab }>()

// Les infobulles restent sous la page : les cacher ferait clignoter la page à chaque survol de bouton.
const OVERLAYS = '[data-reka-popper-content-wrapper]:not(:has([role="tooltip"])), .ui-toast'
// Une fenêtre modale voile toute la fenêtre : la page doit céder la place même si elle n'est pas dessous.
const MODALS = '[role="dialog"][aria-modal="true"], [role="alertdialog"]'
// Filet pour les déplacements que ni ResizeObserver ni la fenêtre ne signalent (colonne voisine qui change).
const CHECK_EVERY = 300

const { t } = useI18n()
const appearance = useAppearanceStore()
const browser = useBrowserStore()
const host = useTemplateRef('host')
const frozen = ref<string | null>(null)
const covered = ref(false)

let placed: string | null = null
let last = ''
let frame = 0

function rect(): PaneRect | null {
  const box = host.value?.getBoundingClientRect()
  if (!box || box.width < 2 || box.height < 2) return null
  // Le zoom de l'interface agrandit les px CSS : la page se pose en points de la fenêtre.
  const zoom = appearance.zoomFactor
  return { x: box.left * zoom, y: box.top * zoom, width: box.width * zoom, height: box.height * zoom }
}

function place(force = false) {
  const id = props.tab.id
  const visible = !covered.value && !props.tab.error
  const target = visible ? rect() : null
  const key = `${id}:${JSON.stringify(target)}`
  if (!force && key === last) return
  placed = id
  last = key
  browserPlace(id, target).catch(() => {})
}

function schedule() {
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(() => {
    const next = isCovered()
    if (next !== covered.value) covered.value = next
    else place()
  })
}

function isCovered() {
  const box = host.value?.getBoundingClientRect()
  if (!box) return false
  if (document.querySelector(MODALS)) return true
  for (const element of document.querySelectorAll(OVERLAYS)) {
    if (host.value?.contains(element)) continue
    const over = element.getBoundingClientRect()
    if (over.width && over.height && over.left < box.right && over.right > box.left && over.top < box.bottom && over.bottom > box.top) return true
  }
  return false
}

// La capture d'abord, page encore visible ; puis la page s'efface derrière elle.
watch(covered, async (now) => {
  if (now) {
    try {
      frozen.value = await browserSnapshot(props.tab.id)
    } catch {
      frozen.value = null
    }
    if (covered.value) place(true)
  } else {
    place(true)
    requestAnimationFrame(() => (frozen.value = null))
  }
})

watch(() => [props.tab.error, appearance.zoomFactor], () => place(true))

let resize: ResizeObserver | null = null
let mutations: MutationObserver | null = null
let timer: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  place(true)
  resize = new ResizeObserver(schedule)
  if (host.value) resize.observe(host.value)
  mutations = new MutationObserver(schedule)
  mutations.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-state', 'style'] })
  window.addEventListener('resize', schedule)
  timer = setInterval(schedule, CHECK_EVERY)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  resize?.disconnect()
  mutations?.disconnect()
  window.removeEventListener('resize', schedule)
  clearInterval(timer)
  if (placed) browserPlace(placed, null).catch(() => {})
})
</script>

<template>
  <div ref="host" class="relative min-h-0 flex-1 overflow-hidden bg-canvas">
    <img v-if="frozen" :src="frozen" alt="" class="pointer-events-none absolute inset-0 size-full object-contain object-top" />
    <div v-if="tab.error" class="flex h-full flex-col items-center justify-center gap-3 p-6 text-center" role="alert">
      <CircleAlert class="size-6 text-muted" aria-hidden="true" />
      <p class="text-sm text-content/85">{{ t('dock.browser.loadFailed') }}</p>
      <p class="max-w-80 text-xs break-words text-muted">{{ tab.error }}</p>
      <UiButton size="sm" @click="browser.history(tab.id, 'reload')">
        <RefreshCw class="size-3.5" aria-hidden="true" />
        {{ t('dock.browser.reload') }}
      </UiButton>
    </div>
  </div>
</template>
