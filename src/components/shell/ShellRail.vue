<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ShellRailToggle from '@/components/shell/ShellRailToggle.vue'
import { appVersion } from '@/ipc/system'

const { t } = useI18n()
const version = ref('')

onMounted(async () => {
  version.value = await appVersion().catch(() => '')
})
</script>

<template>
  <aside id="shell-rail" class="flex shrink-0 flex-col bg-canvas macos:bg-canvas/40">
    <!-- Sur macOS, les boutons de fenêtre occupent la gauche de cette rangée. -->
    <div class="flex h-10 shrink-0 items-center justify-end px-2" data-tauri-drag-region>
      <ShellRailToggle />
    </div>

    <nav class="min-h-0 flex-1 overflow-y-auto px-2 py-2" :aria-label="t('shell.projects')">
      <p class="px-2 text-xs font-medium text-muted">{{ t('shell.projects') }}</p>
      <p class="mt-1.5 px-2 text-sm text-muted">{{ t('shell.noProjects') }}</p>
    </nav>

    <footer class="px-4 py-3 text-xs text-muted">
      Nuée<template v-if="version"> v{{ version }}</template>
    </footer>
  </aside>
</template>
