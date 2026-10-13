<script setup lang="ts">
import { ChevronRight, Eye, FolderOpen, RefreshCw, Search, SlidersHorizontal } from '@/components/ui/icons'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsAgentLogo from '@/components/settings/SettingsAgentLogo.vue'
import SettingsMcpRow from '@/components/settings/SettingsMcpRow.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import { isMacosApp } from '@/ipc/system'
import { useNavigationStore } from '@/stores/navigation'
import { type Group, type McpServer, type Skill, useSkillsStore } from '@/stores/skills'
import { agents, upcomingAgents } from '@/utils/agents'
import { normalize } from '@/utils/search'

const { t } = useI18n()
const revealLabel = isMacosApp() ? 'settings.skills.reveal' : 'settings.skills.revealFolder'
const store = useSkillsStore()
const navigation = useNavigationStore()
const query = ref('')

if (!store.loaded) store.load()
else store.loadSkills()

const needle = computed(() => normalize(query.value.trim()))
const matches = (...texts: string[]) => !needle.value || texts.some((text) => normalize(text).includes(needle.value))
const skills = computed(() => store.skills.filter((skill) => matches(skill.name, skill.description)))
const busy = computed(() => store.loading || store.checking)
const on = (skill: Skill) => store.mode(skill) !== 'off'
const command = (skill: Skill) => store.mode(skill) === 'userInvocableOnly' || (skill.manual && on(skill))

const servers = computed(() => store.servers.filter((server) => matches(server.name, server.target)))

const groups = computed(() => [
  { kind: 'skills' as Group, title: t('settings.skills.skills'), total: store.skills.length, on: store.skills.filter(on).length },
  {
    kind: 'servers' as Group,
    title: t('settings.skills.servers'),
    total: store.servers.length,
    on: store.servers.filter((server: McpServer) => store.serverOn(server)).length,
  },
])

function empty(kind: Group) {
  if (needle.value) return t('settings.skills.noMatch')
  if (kind === 'skills') return store.errors.skills ? t('settings.skills.skillsError', { error: store.errors.skills }) : t('settings.skills.noSkills')
  if (store.errors.servers) return t('settings.skills.serversError', { error: store.errors.servers })
  return store.checking ? t('settings.skills.loading') : t('settings.skills.noServers')
}

function onFilterKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !query.value) return
  event.stopPropagation()
  query.value = ''
}
</script>

<template>
  <div class="flex flex-wrap gap-1.5 pt-8" role="group" :aria-label="t('settings.skills.agentLabel')">
    <button
      v-for="(agent, kind) in agents"
      :key="kind"
      type="button"
      aria-pressed="true"
      class="flex h-8 items-center gap-1.5 rounded-lg border border-stroke-focus bg-selection ps-1.5 pe-3 text-xs font-medium focus-visible:outline-2 focus-visible:outline-ring"
    >
      <SettingsAgentLogo :id="kind" small />{{ agent.name }}
    </button>
    <UiTooltip v-for="agent in upcomingAgents" :key="agent.id" :label="t('settings.skills.soon')">
      <button
        type="button"
        aria-pressed="false"
        aria-disabled="true"
        data-control
        class="flex h-8 cursor-not-allowed items-center gap-1.5 rounded-lg border border-stroke ps-1.5 pe-3 text-xs text-muted focus-visible:outline-2 focus-visible:outline-ring"
      >
        <SettingsAgentLogo :id="agent.id" muted small />{{ agent.name }}
      </button>
    </UiTooltip>
  </div>

  <div class="flex items-center gap-1.5 pt-4">
    <label data-control class="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md border border-stroke bg-selection/50 px-2 focus-within:border-stroke-focus">
      <Search class="size-3.5 shrink-0 text-muted" aria-hidden="true" />
      <input
        v-model="query"
        type="search"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        spellcheck="false"
        writingsuggestions="false"
        :aria-label="t('settings.skills.filterLabel')"
        :placeholder="t('settings.skills.filterLabel')"
        class="min-w-0 flex-1 bg-transparent text-xs outline-none select-text placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
        @keydown="onFilterKeydown"
      />
    </label>
    <UiIconButton :label="t('settings.skills.refresh')" :loading="busy" @click="store.refresh()">
      <RefreshCw class="size-3.5" aria-hidden="true" />
    </UiIconButton>
  </div>

  <p v-if="!store.loaded" class="pt-6 text-xs text-muted" role="status">{{ t('settings.skills.loading') }}</p>

  <template v-else>
    <section v-for="group in groups" :key="group.kind" :data-setting="`${group.kind}-list`" class="pt-8">
      <h3 class="pb-2.5">
        <button
          type="button"
          class="-mx-1.5 flex w-[calc(100%+0.75rem)] cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-0.5 text-start focus-visible:outline-2 focus-visible:outline-ring"
          :aria-expanded="store.expanded(group.kind)"
          :aria-controls="`${group.kind}-panel`"
          @click="store.toggle(group.kind)"
        >
          <ChevronRight
            class="size-3.5 shrink-0 text-muted transition-transform duration-150 motion-reduce:transition-none rtl:-scale-x-100"
            :class="{ 'rotate-90': store.expanded(group.kind) }"
            aria-hidden="true"
          />
          <span class="min-w-0 flex-1 text-sm font-semibold">{{ group.title }}</span>
          <span v-if="group.total" class="text-xs font-normal text-muted tabular-nums">
            {{ t('settings.skills.enabledCount', { enabled: group.on, total: group.total }) }}
          </span>
        </button>
      </h3>

      <!-- Repli animé par la hauteur de la ligne de grille ; inert garde le contenu replié hors du Tab. -->
      <div
        :id="`${group.kind}-panel`"
        class="grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none"
        :class="store.expanded(group.kind) ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'"
        :inert="!store.expanded(group.kind)"
      >
        <div class="min-h-0 overflow-hidden">
          <div class="overflow-hidden rounded-xl border border-stroke bg-content/3">
            <template v-if="group.kind === 'skills'">
              <p v-if="!skills.length" class="px-4 py-3 text-xs" :class="store.errors.skills ? 'text-danger' : 'text-muted'">{{ empty('skills') }}</p>
              <div
                v-for="(skill, index) in skills"
                :key="skill.id"
                class="group flex items-center gap-4 border-b border-stroke px-4 py-2 last:border-b-0"
                :class="{ 'bg-selection': store.previewed?.id === skill.id }"
              >
                <div class="min-w-0 flex-1 transition-opacity motion-reduce:transition-none" :class="{ 'opacity-40': !on(skill) }">
                  <p class="flex min-w-0 items-center gap-2">
                    <!-- Raccourci souris : au clavier, « Voir le skill » fait la même chose sans un arrêt de Tab de plus par ligne. -->
                    <button
                      type="button"
                      tabindex="-1"
                      class="min-w-0 cursor-pointer truncate text-start text-sm font-medium hover:underline"
                      @click="store.preview(skill)"
                    >
                      {{ skill.name }}
                    </button>
                    <span v-if="command(skill)" class="shrink-0 rounded bg-content/8 px-1.5 py-px text-[11px] text-muted">
                      {{ t('settings.skills.usages.command') }}
                    </span>
                    <!-- Le réglage global se voit ici, il se change dans la sous-page. -->
                    <span v-if="store.differs(skill)" class="shrink-0 rounded bg-content/8 px-1.5 py-px text-[11px] text-muted">
                      {{ t('settings.skills.ownToNuee') }}
                    </span>
                    <span v-else-if="skill.mode === 'off'" class="shrink-0 rounded bg-content/8 px-1.5 py-px text-[11px] text-muted">
                      {{ t('settings.skills.status.disabled') }}
                    </span>
                  </p>
                  <p :id="`skill-${index}`" class="line-clamp-2 text-xs/relaxed text-muted">{{ skill.description }}</p>
                </div>
                <div class="flex shrink-0 items-center">
                  <!-- Aperçu et dossier visibles au survol ou quand le clavier entre dans la ligne : la liste reste calme. -->
                  <div
                    class="flex items-center opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 motion-reduce:transition-none"
                    :class="{ 'opacity-100': store.previewed?.id === skill.id }"
                  >
                    <UiIconButton :label="t('settings.skills.preview')" :data-skill-preview="skill.id" @click="store.preview(skill)">
                      <Eye class="size-3.5" aria-hidden="true" />
                    </UiIconButton>
                    <UiIconButton :label="t(revealLabel)" @click="store.reveal(skill)">
                      <FolderOpen class="size-3.5" aria-hidden="true" />
                    </UiIconButton>
                  </div>
                  <UiIconButton
                    :label="t('settings.skills.configure', { name: skill.name })"
                    :data-customize="`skill:${skill.id}`"
                    @click="navigation.showSettingsDetail(`skill:${skill.id}`)"
                  >
                    <SlidersHorizontal class="size-3.5" aria-hidden="true" />
                  </UiIconButton>
                </div>
                <UiSwitch
                  :model-value="on(skill)"
                  :label="t('settings.skills.use', { name: skill.name })"
                  :aria-describedby="`skill-${index}`"
                  @update:model-value="store.setMode(skill, $event ? 'on' : 'off')"
                />
              </div>
            </template>

            <template v-else>
              <p v-if="!servers.length" class="px-4 py-3 text-xs" :class="store.errors.servers ? 'text-danger' : 'text-muted'">{{ empty(group.kind) }}</p>
              <SettingsMcpRow v-for="server in servers" :key="server.name" :server="server" />
            </template>
          </div>
        </div>
      </div>
    </section>
  </template>
</template>
