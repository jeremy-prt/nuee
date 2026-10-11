<script setup lang="ts">
import { computed } from 'vue'
import { type GithubAccount, useIntegrationsStore } from '@/stores/integrations'

// Avatar du profil, ou l'initiale du login tant qu'il n'est pas lu (hors ligne, GitHub Enterprise).
const props = defineProps<{ account: GithubAccount; small?: boolean }>()

const store = useIntegrationsStore()
const src = computed(() => store.avatar(props.account))
</script>

<template>
  <img
    v-if="src"
    :src="src"
    alt=""
    class="shrink-0 rounded-full bg-content/10 ring-2 ring-surface"
    :class="small ? 'size-5' : 'size-8'"
  />
  <span
    v-else
    class="grid shrink-0 place-items-center rounded-full bg-content/10 font-semibold text-muted uppercase ring-2 ring-surface"
    :class="small ? 'size-5 text-[10px]' : 'size-8 text-xs'"
    aria-hidden="true"
  >
    {{ account.login.charAt(0) || '?' }}
  </span>
</template>
