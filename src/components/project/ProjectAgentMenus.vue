<script setup lang="ts">
import { Brain } from '@/components/ui/icons'
import { DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem } from 'reka-ui'
import { computed, type FunctionalComponent, h, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsAgentLogo from '@/components/settings/SettingsAgentLogo.vue'
import UiMenuSeparator from '@/components/ui/UiMenuSeparator.vue'
import UiMenuSub from '@/components/ui/UiMenuSub.vue'
import { menuLabel, menuRow, menuTitle } from '@/components/ui/menuRow'
import type { Effort } from '@/ipc/bindings/Effort'
import { useAgentsStore } from '@/stores/agents'
import { useCatalogStore } from '@/stores/catalog'
import { useProjectsStore } from '@/stores/projects'

// Sous-menus « Modèle par défaut » et « Effort par défaut » d'un projet, ou de « Sans projet » (projectId null) :
// les mêmes réglages que sa page. « Par défaut » rend le choix à Réglages › Agents, dont la valeur s'affiche à droite.
const props = defineProps<{ projectId: string | null }>()

const { t } = useI18n()
const projects = useProjectsStore()
const catalog = useCatalogStore()
const agentSettings = useAgentsStore()

const settings = computed(() => projects.settingsOf(props.projectId))
const agent = computed(() => projects.chatAgent(props.projectId))
watch(agent, (kind) => catalog.load(kind), { immediate: true })

// Logo de l'agent dans la case d'une icône de menu : sa petite taille (20 px) dessine, marge comprise, 16 px à l'œil.
const agentLogo = computed<FunctionalComponent>(() => (_, { attrs }) =>
  h('span', { ...attrs, class: [attrs.class, 'grid place-items-center'] }, h(SettingsAgentLogo, { id: agent.value, small: true, class: '-m-0.5' })),
)

const models = computed(() => catalog.get(agent.value)?.models ?? [])
const main = computed(() => models.value.filter((model) => !model.legacy))
const legacy = computed(() => models.value.filter((model) => model.legacy))
const resolved = computed(() => catalog.resolve(agent.value, projects.chatOptions(props.projectId, agent.value)))
const efforts = computed(() => models.value.find((model) => model.value === resolved.value.model)?.efforts ?? [])

const inherited = computed(() => {
  const defaults = agentSettings.chatDefaults(agent.value)
  return {
    model: catalog.modelLabel(agent.value, catalog.resolve(agent.value, defaults).model),
    effort: catalog.resolve(agent.value, { ...resolved.value, effort: defaults.effort }).effort,
  }
})

const effortLabel = (effort: Effort | null) => (effort ? t(`composer.effort.${effort}`) : '')

function pickModel(value: unknown) {
  if (settings.value) settings.value.model = typeof value === 'string' && value ? value : null
}

function pickEffort(value: unknown) {
  if (settings.value) settings.value.effort = typeof value === 'string' && value ? (value as Effort) : null
}

const row = [menuRow, 'py-1']
const side = 'mt-0.5 shrink-0 text-muted'
</script>

<template>
  <template v-if="settings && models.length">
    <UiMenuSub :label="t('menu.defaultModel')" :icon="agentLogo" :value="catalog.modelLabel(agent, resolved.model) ?? ''">
      <DropdownMenuRadioGroup :model-value="settings.model ?? ''" class="flex flex-col gap-0.5" @update:model-value="pickModel">
        <DropdownMenuRadioItem value="" :text-value="t('composer.default')" :class="row">
          <span :class="[menuLabel, 'min-w-0 flex-1']">{{ t('composer.default') }}</span>
          <span :class="side">{{ inherited.model }}</span>
        </DropdownMenuRadioItem>
        <UiMenuSeparator />
        <DropdownMenuRadioItem v-for="model in main" :key="model.value" :value="model.value" :class="row">
          <span :class="[menuLabel, 'min-w-0 flex-1']">{{ model.label }}</span>
        </DropdownMenuRadioItem>
        <template v-if="legacy.length">
          <DropdownMenuLabel :class="[menuTitle, 'mt-1']">{{ t('composer.model.legacy') }}</DropdownMenuLabel>
          <DropdownMenuRadioItem v-for="model in legacy" :key="model.value" :value="model.value" :class="row">
            <span :class="[menuLabel, 'min-w-0 flex-1']">{{ model.label }}</span>
          </DropdownMenuRadioItem>
        </template>
      </DropdownMenuRadioGroup>
    </UiMenuSub>

    <UiMenuSub v-if="efforts.length" :label="t('menu.defaultEffort')" :icon="Brain" :value="effortLabel(resolved.effort)">
      <DropdownMenuRadioGroup :model-value="settings.effort ?? ''" class="flex flex-col gap-0.5" @update:model-value="pickEffort">
        <DropdownMenuRadioItem value="" :text-value="t('composer.default')" :class="row">
          <span :class="[menuLabel, 'min-w-0 flex-1']">{{ t('composer.default') }}</span>
          <span :class="side">{{ effortLabel(inherited.effort) }}</span>
        </DropdownMenuRadioItem>
        <UiMenuSeparator />
        <DropdownMenuRadioItem v-for="effort in efforts" :key="effort" :value="effort" :class="row">
          <span :class="[menuLabel, 'min-w-0 flex-1']">{{ effortLabel(effort) }}</span>
        </DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </UiMenuSub>
  </template>
</template>
