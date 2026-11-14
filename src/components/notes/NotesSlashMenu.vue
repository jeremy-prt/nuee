<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SlashGroup, SlashItem } from '@/components/notes/slashCommand'
import { menuHint, menuLabel, menuPanel, menuRow, menuTitle } from '@/components/ui/menuRow'

// Liste du menu « / », montée par Tiptap sous le curseur ; l'éditeur garde le focus et lui passe ses touches.
// Tiptap passe toutes ses données en props : celles qu'on ne déclare pas n'ont rien à faire en attributs.
defineOptions({ inheritAttrs: false })
const props = defineProps<{ items: SlashItem[]; command: (item: SlashItem) => void }>()

const GROUPS: SlashGroup[] = ['text', 'lists', 'insert']

const { t } = useI18n()
const active = ref(0)
const panel = useTemplateRef('panel')

// Rangées par catégorie comme Notion ; une catégorie vidée par la recherche disparaît avec son titre.
const groups = computed(() =>
  GROUPS.map((id) => ({ id, items: props.items.filter((item) => item.group === id) })).filter((group) => group.items.length),
)
// Ordre d'affichage, que les flèches parcourent d'une catégorie à l'autre.
const ordered = computed(() => groups.value.flatMap((group) => group.items))

watch(
  () => props.items,
  () => (active.value = 0),
)

watch(active, async () => {
  await nextTick()
  panel.value?.querySelector('[data-highlighted]')?.scrollIntoView({ block: 'nearest' })
})

function onKeyDown(event: KeyboardEvent) {
  const count = ordered.value.length
  if (!count) return false
  if (event.key === 'ArrowDown') active.value = (active.value + 1) % count
  else if (event.key === 'ArrowUp') active.value = (active.value - 1 + count) % count
  else if (event.key === 'Enter' || event.key === 'Tab') props.command(ordered.value[active.value]!)
  else return false
  return true
}

defineExpose({ onKeyDown })
</script>

<template>
  <!-- Verre sur le cadre fixe, seul le contenu s'anime (WebKit peint un fond périmé sous un verre animé). -->
  <div v-show="items.length" class="ui-glass z-50 w-72 rounded-xl" @mousedown.prevent>
    <div ref="panel" :class="[menuPanel, 'max-h-80 origin-top-left']" data-state="open" data-side="bottom" role="listbox" :aria-label="t('notes.blocks.title')">
      <div v-for="group in groups" :key="group.id" role="group" :aria-label="t(`notes.blocks.groups.${group.id}`)" class="flex flex-col gap-0.5">
        <p :class="menuTitle" aria-hidden="true">{{ t(`notes.blocks.groups.${group.id}`) }}</p>
        <div
          v-for="item in group.items"
          :key="item.id"
          role="option"
          :aria-selected="ordered.indexOf(item) === active"
          :data-highlighted="ordered.indexOf(item) === active || undefined"
          :class="[menuRow, 'items-center py-1']"
          @pointermove="active = ordered.indexOf(item)"
          @click="command(item)"
        >
          <!-- « H1 » en texte : les chiffres du glyphe de titre sont illisibles à cette taille. Glyphes en 3,5 : à 4 la
               citation pesait plus lourd que le reste. -->
          <span class="grid size-4 shrink-0 place-items-center self-center text-muted" aria-hidden="true">
            <span v-if="typeof item.icon === 'string'" class="text-[10px] leading-none font-semibold">{{ item.icon }}</span>
            <component :is="item.icon" v-else class="size-3.5" />
          </span>
          <span :class="[menuLabel, 'min-w-0 flex-1 self-center']">{{ item.label }}</span>
          <span :class="[menuHint, 'shrink-0 self-center font-mono']" aria-hidden="true">{{ item.hint }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
