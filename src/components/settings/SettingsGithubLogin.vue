<script setup lang="ts">
import { Check, Copy, ExternalLink, LoaderCircle, Plus } from '@lucide/vue'
import { computed, onUnmounted, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import UiButton from '@/components/ui/UiButton.vue'
import { useIntegrationsStore } from '@/stores/integrations'

const { t } = useI18n()
const store = useIntegrationsStore()
const hintId = useId()
const copied = ref(false)
const code = computed(() => store.login?.code ?? null)

let timer: ReturnType<typeof setTimeout> | undefined
async function copy() {
  if (!code.value) return false
  try {
    await navigator.clipboard.writeText(code.value.code)
  } catch {
    return false
  }
  copied.value = true
  clearTimeout(timer)
  timer = setTimeout(() => (copied.value = false), 1500)
  return true
}

// Le code part dans le presse-papiers avant la page : il ne reste qu'à le coller.
async function copyAndOpen() {
  await copy()
  await store.openLoginPage()
}

onUnmounted(() => clearTimeout(timer))
</script>

<template>
  <div data-setting="github-login" data-setting-row class="px-4 py-3">
    <div class="flex flex-wrap items-center gap-x-6 gap-y-2">
      <div class="flex min-w-40 flex-1 items-center gap-3">
        <span class="grid size-8 shrink-0 place-items-center rounded-full border border-dashed border-stroke-focus text-muted" aria-hidden="true">
          <Plus class="size-4" />
        </span>
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium">{{ t('settings.github.connect') }}</p>
          <p :id="hintId" class="mt-0.5 text-xs/relaxed text-muted">
            <span v-if="store.loginError" class="wrap-break-word text-danger" role="alert">{{ store.loginError }}</span>
            <template v-else>{{ t('settings.github.connectHint') }}</template>
          </p>
        </div>
      </div>
      <!-- Un seul bouton qui devient Annuler : validé au clavier, il garde le focus pendant la connexion. -->
      <UiButton
        size="sm"
        :variant="store.login ? 'ghost' : 'secondary'"
        :disabled="!store.login && !store.prefs.github"
        :aria-describedby="hintId"
        @click="store.login ? store.cancelLogin() : store.connect()"
      >
        {{ store.login ? t('settings.github.cancel') : store.loginError ? t('settings.github.retry') : t('settings.github.connectButton') }}
      </UiButton>
    </div>

    <div v-if="store.login" class="mt-3 ms-11 rounded-lg border border-stroke bg-content/3 p-3" aria-live="polite">
      <p v-if="!code" class="flex items-center gap-2 text-xs text-muted">
        <LoaderCircle class="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />{{ t('settings.github.starting') }}
      </p>
      <ol v-else class="flex flex-col gap-3 text-xs">
        <li class="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span class="grid size-5 shrink-0 place-items-center rounded-full bg-content/10 text-[11px] font-semibold" aria-hidden="true">1</span>
          <span class="min-w-32 flex-1">{{ t('settings.github.stepCopy') }}</span>
          <span class="rounded-md bg-selection px-2.5 py-1 font-mono text-base font-semibold tracking-widest select-text">{{ code.code }}</span>
          <UiButton size="sm" @click="copy()">
            <component :is="copied ? Check : Copy" class="size-3.5" :class="{ 'text-success': copied }" aria-hidden="true" />
            {{ copied ? t('settings.github.copied') : t('settings.github.copy') }}
          </UiButton>
        </li>
        <li class="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span class="grid size-5 shrink-0 place-items-center rounded-full bg-content/10 text-[11px] font-semibold" aria-hidden="true">2</span>
          <span class="min-w-32 flex-1">{{ t('settings.github.stepOpen') }}</span>
          <UiButton size="sm" variant="primary" @click="copyAndOpen()">
            <ExternalLink class="size-3.5" aria-hidden="true" />{{ t('settings.github.open') }}
          </UiButton>
        </li>
        <li class="flex items-center gap-3 text-muted">
          <LoaderCircle class="size-5 shrink-0 animate-spin p-0.5 motion-reduce:animate-none" aria-hidden="true" />
          {{ t('settings.github.waiting') }}
        </li>
      </ol>
    </div>
  </div>
</template>
