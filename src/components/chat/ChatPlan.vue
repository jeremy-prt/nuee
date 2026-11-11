<script setup lang="ts">
import { Check, DashedCircle, Ellipsis, LoaderCircle } from '@/components/ui/icons'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { chatCard } from '@/components/chat/card'
import type { PlanStep } from '@/utils/activity'

// Plan de l'agent, comme l'app Claude : une liste vivante, en cours d'un rond qui tourne, faite d'une coche. `earlier` :
// établi avant le dernier message de l'utilisateur, il reste en bas du fil avec un titre qui le dit.
// `paused` : l'agent attend une réponse, l'étape en cours le montre au lieu de tourner.
const props = defineProps<{ steps: PlanStep[]; earlier?: boolean; live?: boolean; paused?: boolean }>()

const { t } = useI18n()
const done = computed(() => props.steps.filter((step) => step.status === 'completed').length)
</script>

<template>
  <section :class="chatCard" class="px-4 py-3 text-sm" :aria-label="t('chat.plan.title')">
    <p v-if="earlier" class="mb-1.5 text-xs text-muted">{{ t('chat.plan.earlier') }}</p>
    <p class="sr-only" role="status">{{ t('chat.plan.progress', { done, total: steps.length }) }}</p>
    <ol class="flex flex-col gap-2">
      <li v-for="(step, index) in steps" :key="index" class="flex items-start gap-2.5">
        <span class="mt-0.5 grid size-4 shrink-0 place-items-center" aria-hidden="true">
          <span v-if="step.status === 'in_progress' && paused" class="grid size-3.5 place-items-center rounded-full border border-muted"><Ellipsis class="size-2.5 text-muted" /></span>
          <LoaderCircle v-else-if="step.status === 'in_progress' && live" class="size-3.5 animate-spin text-muted motion-reduce:animate-none" />
          <DashedCircle v-else-if="step.status === 'in_progress'" class="size-3.5 text-muted" />
          <span v-else-if="step.status === 'completed'" class="grid size-3.5 place-items-center rounded-full bg-muted"><Check class="size-2.5 text-canvas" /></span>
          <DashedCircle v-else class="size-3.5 text-muted" />
        </span>
        <span class="min-w-0 flex-1" :class="{ 'text-muted': step.status === 'completed' }">
          {{ step.content }}
          <span class="sr-only">, {{ t(`chat.plan.status.${step.status}`) }}</span>
        </span>
      </li>
    </ol>
  </section>
</template>
