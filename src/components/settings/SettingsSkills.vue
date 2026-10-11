<script setup lang="ts">
import { Check, ChevronRight, Copy, Eye, FolderOpen, RefreshCw, Search } from '@lucide/vue'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import UiButton from '@/components/ui/UiButton.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import { isMacosApp } from '@/ipc/system'
import { type McpServer, type Skill, useSkillsStore } from '@/stores/skills'
import { normalize } from '@/utils/search'

const { t } = useI18n()
const revealLabel = isMacosApp() ? 'settings.skills.reveal' : 'settings.skills.revealFolder'
const store = useSkillsStore()
const query = ref('')
const copied = ref<string | null>(null)

if (!store.skills.length && !store.servers.length) store.load()

const needle = computed(() => normalize(query.value.trim()))
const matches = (...texts: string[]) => !needle.value || texts.some((text) => normalize(text).includes(needle.value))
const skills = computed(() => store.skills.filter((skill) => matches(skill.name, skill.description)))
const servers = computed(() => store.servers.filter((server) => matches(server.name, server.target)))

const groups = computed(() => [
  { kind: 'skills' as const, title: t('settings.skills.skills'), ids: store.skills.map((skill) => skill.id), empty: t('settings.skills.noSkills') },
  { kind: 'servers' as const, title: t('settings.skills.servers'), ids: store.servers.map((server) => server.id), empty: t('settings.skills.noServers') },
])

// Un serveur coupé dans Nuée n'est pas lancé : son état réel ne compte plus.
function status(server: McpServer) {
  if (!store.enabled('servers', server.id)) return { tone: 'bg-muted/50', text: t('settings.skills.status.off') }
  if (server.status === 'connected') {
    return { tone: 'bg-success', text: server.tools === null ? t('settings.skills.status.connected') : t('settings.skills.tools', server.tools) }
  }
  if (server.status === 'needsAuth') return { tone: 'bg-info', text: t('settings.skills.status.needsAuth') }
  return { tone: 'bg-danger', text: t('settings.skills.status.failed', { error: server.error }) }
}

async function copy(skill: Skill) {
  if (!(await store.copy(skill))) return
  copied.value = skill.id
  setTimeout(() => {
    if (copied.value === skill.id) copied.value = null
  }, 1500)
}

function onFilterKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !query.value) return
  event.stopPropagation()
  query.value = ''
}
</script>

<template>
  <div class="flex items-center gap-2 pt-8">
    <label class="flex h-7 max-w-80 min-w-0 flex-1 items-center gap-1.5 rounded-md border border-stroke bg-selection/50 px-2 focus-within:border-stroke-focus">
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
        :placeholder="t('settings.skills.filter')"
        class="min-w-0 flex-1 bg-transparent text-xs outline-none select-text placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
        @keydown="onFilterKeydown"
      />
    </label>
    <UiIconButton :label="t('settings.skills.refresh')" :aria-busy="store.loading" @click="store.load()">
      <RefreshCw class="size-3.5" :class="{ 'animate-spin': store.loading }" aria-hidden="true" />
    </UiIconButton>
  </div>

  <p v-if="store.loading && !store.skills.length" class="pt-6 text-xs text-muted" role="status">{{ t('settings.skills.loading') }}</p>

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
          <span v-if="group.ids.length" class="text-xs font-normal text-muted tabular-nums">
            {{ t('settings.skills.enabledCount', { enabled: group.ids.filter((id) => store.enabled(group.kind, id)).length, total: group.ids.length }) }}
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
              <p v-if="!skills.length" class="px-4 py-3 text-xs text-muted">{{ needle ? t('settings.skills.noMatch') : group.empty }}</p>
              <div
                v-for="skill in skills"
                :key="skill.id"
                class="group flex items-center gap-4 border-b border-stroke px-4 py-2 last:border-b-0"
                :class="{ 'bg-selection': store.previewed?.id === skill.id }"
              >
                <div class="min-w-0 flex-1 transition-opacity motion-reduce:transition-none" :class="{ 'opacity-40': !store.enabled('skills', skill.id) }">
                  <!-- Raccourci souris : au clavier, « Voir le skill » fait la même chose sans un arrêt de Tab de plus par ligne. -->
                  <button
                    type="button"
                    tabindex="-1"
                    class="block max-w-full cursor-pointer truncate text-start text-sm font-medium hover:underline"
                    @click="store.preview(skill)"
                  >
                    {{ skill.name }}
                  </button>
                  <p :id="`skill-${skill.id}`" class="truncate text-xs/relaxed text-muted" :title="skill.description">{{ skill.description }}</p>
                </div>
                <!-- Visibles au survol de la ligne ou quand le clavier y entre : la liste reste calme. -->
                <div
                  class="flex shrink-0 items-center opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 motion-reduce:transition-none"
                  :class="{ 'opacity-100': store.previewed?.id === skill.id }"
                >
                  <UiIconButton :label="t('settings.skills.preview')" :data-skill-preview="skill.id" @click="store.preview(skill)">
                    <Eye class="size-3.5" aria-hidden="true" />
                  </UiIconButton>
                  <UiIconButton :label="copied === skill.id ? t('settings.skills.copied') : t('settings.skills.copyPath')" @click="copy(skill)">
                    <component :is="copied === skill.id ? Check : Copy" class="size-3.5" :class="{ 'text-success': copied === skill.id }" aria-hidden="true" />
                  </UiIconButton>
                  <UiIconButton :label="t(revealLabel)" @click="store.reveal(skill)">
                    <FolderOpen class="size-3.5" aria-hidden="true" />
                  </UiIconButton>
                </div>
                <UiSwitch
                  :model-value="store.enabled('skills', skill.id)"
                  :label="t('settings.skills.use', { name: skill.name })"
                  :aria-describedby="`skill-${skill.id}`"
                  @update:model-value="store.setEnabled('skills', skill.id, $event)"
                />
              </div>
            </template>

            <template v-else>
              <p v-if="!servers.length" class="px-4 py-3 text-xs text-muted">{{ needle ? t('settings.skills.noMatch') : group.empty }}</p>
              <div v-for="server in servers" :key="server.id" class="flex items-center gap-4 border-b border-stroke px-4 py-2 last:border-b-0">
                <div class="min-w-0 flex-1 transition-opacity motion-reduce:transition-none" :class="{ 'opacity-40': !store.enabled('servers', server.id) }">
                  <p class="flex min-w-0 items-center gap-2">
                    <span class="size-1.5 shrink-0 rounded-full" :class="status(server).tone" aria-hidden="true" />
                    <span class="truncate text-sm font-medium">{{ server.name }}</span>
                  </p>
                  <p :id="`server-${server.id}`" class="truncate ps-3.5 text-xs/relaxed text-muted" :title="server.target">
                    <span :class="{ 'text-danger': server.status === 'failed' && store.enabled('servers', server.id) }">{{ status(server).text }}</span>
                    · {{ server.transport }}
                  </p>
                </div>
                <UiButton
                  v-if="store.enabled('servers', server.id) && server.status !== 'connected'"
                  size="xs"
                  :loading="store.pending.has(server.id)"
                  :aria-describedby="`server-${server.id}`"
                  @click="store.connect(server.id)"
                >
                  {{ server.status === 'needsAuth' ? t('settings.skills.connect') : t('settings.skills.reconnect') }}
                </UiButton>
                <UiSwitch
                  :model-value="store.enabled('servers', server.id)"
                  :label="t('settings.skills.use', { name: server.name })"
                  :aria-describedby="`server-${server.id}`"
                  @update:model-value="store.setEnabled('servers', server.id, $event)"
                />
              </div>
            </template>
          </div>
        </div>
      </div>
    </section>
  </template>
</template>
