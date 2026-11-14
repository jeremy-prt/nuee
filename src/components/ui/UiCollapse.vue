<script setup lang="ts">
import { motion } from '@/utils/motion'

// Hauteur et marges ensemble : des marges laissées à leur valeur feraient un saut au début ou à la fin.
function frames(el: HTMLElement, height: number) {
  const { marginTop, marginBottom, paddingTop, paddingBottom } = getComputedStyle(el)
  return [
    { height: '0px', marginTop: '0px', marginBottom: '0px', paddingTop: '0px', paddingBottom: '0px', opacity: 0, overflow: 'hidden' },
    { height: `${height}px`, marginTop, marginBottom, paddingTop, paddingBottom, opacity: 1, overflow: 'hidden' },
  ]
}

// Dépliage d'un bloc (`v-if` sur l'enfant) : il s'ouvre et se referme en hauteur au lieu d'apparaître d'un coup. La
// hauteur n'est animée que sur ce bloc, court par nature (lignes d'outils, groupe de sessions) ; un long bloc, comme
// l'arborescence, glisse en transform à la place (`FilesSearch`).
function enter(element: Element, done: () => void) {
  const el = element as HTMLElement
  const timing = motion('open')
  if (!timing.duration) return done()
  el.animate(frames(el, el.offsetHeight), timing).finished.then(done, done)
}

function leave(element: Element, done: () => void) {
  const el = element as HTMLElement
  const timing = motion('close')
  if (!timing.duration) return done()
  el.animate(frames(el, el.offsetHeight), { ...timing, direction: 'reverse' }).finished.then(done, done)
}
</script>

<template>
  <Transition :css="false" @enter="enter" @leave="leave">
    <slot />
  </Transition>
</template>
