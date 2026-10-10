<script setup lang="ts" generic="T extends string">
import { computed } from 'vue'

// Une carte d'un groupe de choix, sur un bouton radio natif caché (clavier et lecteur d'écran gratuits).
// `checked` force l'état affiché quand le choix en vigueur diffère du choix enregistré. Défaut explicite :
// Vue changerait sinon une prop booléenne absente en `false`.
const props = withDefaults(defineProps<{ name: string; value: T; disabled?: boolean; checked?: boolean }>(), {
  checked: undefined,
})
const model = defineModel<T>({ required: true })
const selected = computed(() => props.checked ?? model.value === props.value)
</script>

<template>
  <label
    class="rounded-xl border has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent"
    :class="[
      selected ? 'border-accent bg-selection/40' : 'border-stroke',
      disabled ? 'cursor-not-allowed' : 'cursor-pointer',
      { 'hover:bg-selection/40': !selected && !disabled },
    ]"
  >
    <input v-model="model" type="radio" :name="name" :value="value" :disabled="disabled" class="sr-only" />
    <slot />
  </label>
</template>
