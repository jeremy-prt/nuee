<script setup lang="ts">
import { ExternalLink, LoaderCircle } from '@/components/ui/icons'
import { computed, nextTick, ref, useId, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsAgentLogo from '@/components/settings/SettingsAgentLogo.vue'
import UiButton from '@/components/ui/UiButton.vue'
import type { AgentKind } from '@/ipc/bindings/AgentKind'
import { useAgentsStore } from '@/stores/agents'
import { agents } from '@/utils/agents'

// Connexion du compte d'un agent, présentée comme celle de GitHub : la CLI ouvre la page de connexion, la page
// donne un code à coller ici. Dans l'erreur d'un message et dans Réglages › Agents ; `title` remplace le titre.
const props = defineProps<{ kind: AgentKind; title?: string }>()

const { t } = useI18n()
const store = useAgentsStore()
const hintId = useId()
const codeId = useId()
const field = useTemplateRef('field')
const code = ref('')

const params = computed(() => ({ agent: agents[props.kind].name }))
const login = computed(() => (store.login?.kind === props.kind ? store.login : null))
const error = computed(() => (store.loginError?.kind === props.kind ? store.loginError.message : null))
// Une autre connexion est en cours (autre agent) : une seule à la fois.
const busy = computed(() => !!store.login && !login.value)

// Page ouverte : le champ du code prend le focus, c'est la seule chose qui reste à faire.
watch(
  () => login.value?.page,
  async (page) => {
    if (!page) return
    code.value = ''
    await nextTick()
    field.value?.focus()
  },
)

function submit() {
  if (code.value.trim()) store.sendLoginCode(code.value)
}

const step = 'grid size-5 shrink-0 place-items-center rounded-full bg-content/10 text-[11px] font-semibold'
</script>

<template>
  <div>
    <div class="flex flex-wrap items-center gap-x-6 gap-y-2">
      <div class="flex min-w-40 flex-1 items-center gap-3">
        <SettingsAgentLogo :id="kind" />
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium">{{ title ?? t('agentLogin.needed', params) }}</p>
          <p :id="hintId" class="mt-0.5 text-xs/relaxed text-muted">
            <span v-if="error" class="wrap-break-word text-danger" role="alert">{{ error }}</span>
            <template v-else>{{ t('agentLogin.hint') }}</template>
          </p>
        </div>
      </div>
      <!-- Un seul bouton qui devient Annuler : validé au clavier, il garde le focus pendant la connexion. -->
      <UiButton
        size="sm"
        :variant="login ? 'ghost' : 'primary'"
        :disabled="busy"
        :aria-describedby="hintId"
        @click="login ? store.cancelSignIn() : store.signIn(kind)"
      >
        {{ login ? t('agentLogin.cancel') : error ? t('agentLogin.retry') : t('agentLogin.start', params) }}
      </UiButton>
    </div>

    <!-- Toujours monté : une région live créée avec son texte n'est pas annoncée. -->
    <div aria-live="polite">
      <div v-if="login" class="mt-3 ms-11 rounded-lg border border-stroke bg-content/3 p-3 text-xs">
        <p v-if="!login.page" class="flex items-center gap-2 text-muted">
          <LoaderCircle class="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />{{ t('agentLogin.starting') }}
        </p>
        <ol v-else class="flex flex-col gap-3">
          <li class="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span :class="step" aria-hidden="true">1</span>
            <span class="min-w-32 flex-1">{{ t('agentLogin.stepPage') }}</span>
            <UiButton size="sm" @click="store.openLoginPage()">
              <ExternalLink class="size-3.5" aria-hidden="true" />{{ t('agentLogin.reopen') }}
            </UiButton>
          </li>
          <li class="flex flex-col gap-2">
            <div class="flex items-center gap-3">
              <span :class="step" aria-hidden="true">2</span>
              <label :for="codeId">{{ t('agentLogin.stepCode') }}</label>
            </div>
            <!-- Le code de la page est long : le champ prend toute la largeur, il tient sur une ligne. -->
            <form class="flex items-center gap-2 ps-8" @submit.prevent="submit">
              <input
                :id="codeId"
                ref="field"
                v-model="code"
                data-control
                autocomplete="off"
                autocorrect="off"
                autocapitalize="off"
                spellcheck="false"
                writingsuggestions="false"
                :disabled="login.sending"
                :placeholder="t('agentLogin.codePlaceholder')"
                class="h-8 min-w-0 flex-1 rounded-md border border-stroke bg-selection/50 px-2.5 font-mono text-xs outline-none select-text placeholder:font-sans placeholder:text-muted focus:border-stroke-focus"
              />
              <UiButton type="submit" size="sm" variant="primary" class="h-8!" :loading="login.sending" :disabled="!code.trim()">
                {{ t('agentLogin.submit') }}
              </UiButton>
            </form>
          </li>
        </ol>
      </div>
    </div>
  </div>
</template>
