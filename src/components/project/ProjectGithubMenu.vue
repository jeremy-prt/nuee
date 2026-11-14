<script setup lang="ts">
import { DropdownMenuContent, DropdownMenuLabel, DropdownMenuPortal, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuRoot, DropdownMenuSeparator, DropdownMenuTrigger } from 'reka-ui'
import { watchEffect } from 'vue'
import { ChevronDown } from '@/components/ui/icons'
import { menuLabel, menuPanel, menuRow, menuTitle } from '@/components/ui/menuRow'
import { useIntegrationsStore } from '@/stores/integrations'

export interface GithubMenuItem {
  value: string
  login: string
  disabled?: boolean
}

// Choix parmi des comptes et organisations GitHub, chacun avec son avatar, rangés en groupes. `value` : la clé rendue,
// `login` : le nom affiché. `avatar` à false : le bouton montre le nom seul.
const props = withDefaults(
  defineProps<{ label: string; sections: { label?: string; items: GithubMenuItem[] }[]; disabled?: boolean; align?: 'start' | 'end'; avatar?: boolean }>(),
  { align: 'end', avatar: true },
)
const model = defineModel<string>({ required: true })

const store = useIntegrationsStore()
watchEffect(() => props.sections.forEach((section) => section.items.forEach((item) => store.requestAvatar(item.login))))

const current = () => props.sections.flatMap((section) => section.items).find((item) => item.value === model.value)
</script>

<template>
  <DropdownMenuRoot :modal="false">
    <DropdownMenuTrigger
      :disabled="disabled"
      :class="avatar ? 'ps-1' : 'ps-2'"
      class="group flex h-7 max-w-48 min-w-0 shrink-0 items-center gap-1.5 rounded-md pe-1.5 text-xs text-content/85 outline-none hover:bg-selection-hover hover:text-content focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40 aria-expanded:bg-selection-hover"
    >
      <span class="sr-only">{{ label }}</span>
      <template v-if="current()">
        <template v-if="!avatar" />
        <img v-else-if="store.avatarOf(current()!.login)" :src="store.avatarOf(current()!.login)!" alt="" class="size-5 shrink-0 rounded-full bg-content/10" />
        <span v-else class="grid size-5 shrink-0 place-items-center rounded-full bg-content/10 text-[10px] font-semibold text-muted uppercase" aria-hidden="true">
          {{ current()!.login.charAt(0) }}
        </span>
        <span class="truncate">{{ current()!.login }}</span>
      </template>
      <ChevronDown class="size-3 shrink-0 text-muted transition-transform duration-150 group-aria-expanded:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent side="bottom" :align="align" :side-offset="4" :collision-padding="8" :class="[menuPanel, 'max-h-72 w-max max-w-64 min-w-36']">
        <template v-for="(section, index) in sections" :key="index">
          <DropdownMenuSeparator v-if="index" class="mx-1 my-1 h-px bg-stroke" />
          <DropdownMenuLabel v-if="section.label" :class="menuTitle">{{ section.label }}</DropdownMenuLabel>
          <DropdownMenuRadioGroup v-model="model" :aria-label="section.label ?? label" class="flex flex-col gap-0.5">
            <DropdownMenuRadioItem
              v-for="item in section.items"
              :key="item.value"
              :value="item.value"
              :disabled="item.disabled"
              :class="[menuRow, 'items-center py-1']"
            >
              <img v-if="store.avatarOf(item.login)" :src="store.avatarOf(item.login)!" alt="" class="size-4 shrink-0 rounded-full bg-content/10" />
              <span v-else class="grid size-4 shrink-0 place-items-center rounded-full bg-content/10 text-[9px] font-semibold text-muted uppercase" aria-hidden="true">
                {{ item.login.charAt(0) }}
              </span>
              <span :class="menuLabel">{{ item.login }}</span>
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </template>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
