<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import SettingsGroup from '@/components/settings/SettingsGroup.vue'
import { type Shortcut, type ShortcutId, shortcutKeys, shortcuts } from '@/utils/shortcuts'

const { t } = useI18n()

const groups = new Map<Shortcut['group'], ShortcutId[]>()
for (const [id, shortcut] of Object.entries(shortcuts) as [ShortcutId, Shortcut][]) {
  groups.set(shortcut.group, [...(groups.get(shortcut.group) ?? []), id])
}
</script>

<template>
  <SettingsGroup v-for="[group, ids] in groups" :key="group" :title="t(`settings.shortcuts.groups.${group}`)">
    <dl>
      <div
        v-for="id in ids"
        :key="id"
        class="flex items-center gap-6 border-b border-stroke px-4 py-2.5 last:border-b-0"
      >
        <dt class="min-w-0 flex-1 text-sm">{{ t(`settings.shortcuts.items.${id}`) }}</dt>
        <dd>
          <kbd class="flex gap-1 font-sans">
            <kbd
              v-for="(key, index) in shortcutKeys(shortcuts[id])"
              :key="index"
              class="flex h-6 min-w-6 items-center justify-center rounded-md border border-stroke bg-content/5 px-1.5 text-xs text-content/80"
            >{{ key }}</kbd>
          </kbd>
        </dd>
      </div>
    </dl>
  </SettingsGroup>
</template>
