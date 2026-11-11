import { ref } from 'vue'

// Menu reka non modal : un clic sur son déclencheur ouvert le fermait (clic « dehors ») puis le rouvrait aussitôt. On
// retient s'il était ouvert à l'appui (`onTriggerDown` sur le pointerdown du déclencheur) et on refuse la réouverture.
export function useMenuToggle() {
  const open = ref(false)
  let pressedOpen = false

  function onTriggerDown() {
    pressedOpen = open.value
    setTimeout(() => (pressedOpen = false), 400)
  }

  function onOpenChange(value: boolean) {
    open.value = value && !pressedOpen
    if (value) pressedOpen = false
  }

  return { open, onTriggerDown, onOpenChange }
}
