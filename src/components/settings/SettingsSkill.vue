<script setup lang="ts">
import { Check, Copy, FolderOpen, Sparkles } from '@lucide/vue'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsGroup from '@/components/settings/SettingsGroup.vue'
import SettingsRow from '@/components/settings/SettingsRow.vue'
import SettingsSkillsScope from '@/components/settings/SettingsSkillsScope.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import { useSkillChat } from '@/composables/useSkillChat'
import type { SkillMode } from '@/ipc/bindings/SkillMode'
import { isMacosApp } from '@/ipc/system'
import { useNavigationStore } from '@/stores/navigation'
import { useSkillsStore } from '@/stores/skills'

const props = defineProps<{ id: string }>()

const { t } = useI18n()
const store = useSkillsStore()
const navigation = useNavigationStore()
const skillChat = useSkillChat()
const revealLabel = isMacosApp() ? 'settings.skills.reveal' : 'settings.skills.revealFolder'
const copied = ref(false)

if (!store.loaded) store.load()
store.scope = 'nuee'

const skill = computed(() => store.find(props.id))
const mode = computed(() => (skill.value ? store.mode(skill.value, store.scope) : 'on'))
// `disable-model-invocation` dans le SKILL.md l'emporte : seul le fichier peut le rendre à Claude.
const manual = computed(() => !!skill.value?.manual)

function set(value: SkillMode) {
  if (skill.value) store.setMode(skill.value, value, store.scope)
}

// Trois choix lus dans un seul réglage de Claude Code, `skillOverrides`.
const enabled = computed({
  get: () => mode.value !== 'off',
  set: (value: boolean) => set(value ? 'on' : 'off'),
})
const usage = computed<'auto' | 'command'>({
  get: () => (manual.value || mode.value === 'userInvocableOnly' ? 'command' : 'auto'),
  set: (value) => set(value === 'auto' ? 'on' : 'userInvocableOnly'),
})
const context = computed<'full' | 'name'>({
  get: () => (mode.value === 'nameOnly' ? 'name' : 'full'),
  set: (value) => set(value === 'full' ? 'on' : 'nameOnly'),
})
const usages = computed(() =>
  (['auto', 'command'] as const).map((value) => ({
    value,
    label: t(`settings.skills.usages.${value}`),
    disabled: value === 'auto' && manual.value,
  })),
)
const contexts = computed(() => (['full', 'name'] as const).map((value) => ({ value, label: t(`settings.skills.contexts.${value}`) })))
const usageHint = computed(() =>
  manual.value ? t('settings.skills.manualHint') : t(`settings.skills.usageHints.${usage.value}`, { name: skill.value?.name ?? '', agent: store.agentName }),
)

async function copy() {
  if (!skill.value || !(await store.copy(skill.value))) return
  copied.value = true
  setTimeout(() => (copied.value = false), 1500)
}

async function remove() {
  if (skill.value && (await store.trash(skill.value))) navigation.showSettingsDetail(null)
}
</script>

<template>
  <p v-if="!skill" class="pt-8 text-sm text-muted" :role="store.loaded ? undefined : 'status'">
    {{ store.loaded ? t('settings.skills.missing') : t('settings.skills.loading') }}
  </p>
  <template v-else>
    <p v-if="skill.description" class="mt-1.5 max-w-3xl text-sm text-muted">{{ skill.description }}</p>

    <SettingsGroup :title="t('settings.skills.behavior')" :hint="t(`settings.skills.scopeHints.${store.scope}`, { agent: store.agentName })" :danger="store.scope === 'everywhere'">
      <template #action><SettingsSkillsScope /></template>
      <SettingsRow v-slot="{ hintId }" :label="t('settings.skills.enabled')" :hint="t('settings.skills.enabledHint', { name: skill.name, agent: store.agentName })">
        <UiSwitch v-model="enabled" :label="t('settings.skills.enabled')" :aria-describedby="hintId" />
      </SettingsRow>
      <SettingsRow v-slot="{ hintId }" :label="t('settings.skills.usage')" :hint="usageHint" :disabled="!enabled">
        <UiSegmented v-model="usage" :label="t('settings.skills.usage')" :options="usages" :disabled="!enabled" :aria-describedby="hintId" />
      </SettingsRow>
      <SettingsRow v-if="enabled && usage === 'auto'" v-slot="{ hintId }" :label="t('settings.skills.context', { agent: store.agentName })" :hint="t('settings.skills.contextHint', { agent: store.agentName })">
        <UiSegmented v-model="context" :label="t('settings.skills.context', { agent: store.agentName })" :options="contexts" :aria-describedby="hintId" />
      </SettingsRow>
    </SettingsGroup>

    <SettingsGroup :title="t('settings.skills.file')" :hint="t('settings.skills.fileHint', { agent: store.agentName })">
      <SettingsRow :label="t('settings.skills.location')">
        <template #hint><span class="font-mono break-all select-text">{{ skill.path }}</span></template>
        <div class="flex items-center gap-1">
          <UiIconButton :label="copied ? t('settings.skills.copied') : t('settings.skills.copyPath')" @click="copy()">
            <component :is="copied ? Check : Copy" class="size-3.5" :class="{ 'text-success': copied }" aria-hidden="true" />
          </UiIconButton>
          <UiIconButton :label="t(revealLabel)" @click="store.reveal(skill)">
            <FolderOpen class="size-3.5" aria-hidden="true" />
          </UiIconButton>
        </div>
      </SettingsRow>
      <SettingsRow v-slot="{ hintId }" :label="t('settings.skills.content')" :hint="t('settings.skills.contentHint')">
        <div class="flex flex-wrap justify-end gap-2">
          <UiButton size="sm" :aria-describedby="hintId" @click="skillChat({ kind: 'editSkill', id: skill.id })">
            <Sparkles class="size-3.5" aria-hidden="true" />{{ t('settings.skills.editWithAi') }}
          </UiButton>
          <UiButton size="sm" :aria-describedby="hintId" @click="store.edit(skill)">{{ t('settings.skills.edit') }}</UiButton>
        </div>
      </SettingsRow>
      <SettingsRow v-slot="{ hintId }" :label="t('settings.skills.delete')" :hint="t('settings.skills.deleteHint')">
        <UiButton size="sm" variant="danger" :loading="store.trashing === skill.id" :aria-describedby="hintId" @click="remove()">
          {{ t('settings.skills.deleteButton') }}
        </UiButton>
      </SettingsRow>
    </SettingsGroup>
  </template>
</template>
