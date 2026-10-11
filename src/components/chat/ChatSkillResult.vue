<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { Translation, useI18n } from 'vue-i18n'
import UiButton from '@/components/ui/UiButton.vue'
import { useNavigationStore } from '@/stores/navigation'
import { useSkillsStore } from '@/stores/skills'
import type { SkillResult } from '@/utils/skillResult'

// Compte rendu de fin d'un chat de skill : l'IA n'a donné que le JSON, la forme est celle de Nuée.
const props = defineProps<{ result: SkillResult }>()

const CODE = 'rounded bg-selection px-1 py-0.5 font-mono text-[0.85em]'

const { t } = useI18n()
const skills = useSkillsStore()
const navigation = useNavigationStore()
const command = computed(() => `/${props.result.name}`)
const page = computed(() => `${t('rail.settings')} › ${t('settings.sections.skills')}`)
// Le dossier d'un skill écrit par l'IA porte son nom (consignes de Rust).
const skill = computed(() => skills.find(props.result.name))

// Chat rouvert après un redémarrage : la liste n'a peut-être jamais été lue.
onMounted(() => {
  if (!skills.loaded && !skills.loading) skills.loadSkills()
})
</script>

<template>
  <div>
    <p class="my-2">
      <strong class="font-semibold">{{ t(`chat.commands.result.${result.action}`) }}</strong> <code :class="CODE">{{ command }}</code>
    </p>
    <p v-if="result.action === 'modified'" class="my-2">
      <strong class="font-semibold">{{ t('chat.commands.result.changes') }}</strong><br />{{ result.changes }}
    </p>
    <p class="my-2"><strong class="font-semibold">{{ t('chat.commands.result.summary') }}</strong><br />{{ result.summary }}</p>
    <p v-if="result.action === 'created'" class="my-2">
      <strong class="font-semibold">{{ t('chat.commands.automatic') }}</strong>
      {{ result.automatic ? t('chat.commands.yes') : t('chat.commands.no') }}
    </p>
    <p class="my-2">
      <strong class="font-semibold">{{ t('chat.commands.result.tryLabel') }}</strong> <Translation keypath="chat.commands.result.tryIt" tag="span">
        <template #command><code :class="CODE">{{ command }}</code></template>
        <template #page>{{ page }}</template>
      </Translation>
    </p>
    <UiButton v-if="skill" class="my-2" size="xs" @click="navigation.openSettings('skills', `skill:${skill.id}`)">
      {{ t('chat.commands.result.open') }}
    </UiButton>
  </div>
</template>
