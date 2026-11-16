import { copyImagePixels } from '@/ipc/system'

// Copie d'une image, quelle que soit sa source (`data:`, fichier lu par le protocole asset) : décodée dans un canvas,
// puis ses pixels passent au presse-papiers natif. Un SVG est rendu au double pour rester net une fois collé.
export async function copyImage(src: string) {
  const blob = await (await fetch(src)).blob()
  const url = URL.createObjectURL(blob)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const scale = blob.type.startsWith('image/svg') ? 2 : 1
    const canvas = document.createElement('canvas')
    canvas.width = (image.naturalWidth || 256) * scale
    canvas.height = (image.naturalHeight || 256) * scale
    const context = canvas.getContext('2d')
    if (!context) throw new Error('canvas')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
    await copyImagePixels(new Uint8Array(data.buffer), canvas.width, canvas.height)
  } finally {
    URL.revokeObjectURL(url)
  }
}
