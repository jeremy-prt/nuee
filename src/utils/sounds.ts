// Sons synthétisés à la volée : pas de fichier audio à embarquer ni de licence à suivre.
export type Cue = 'done' | 'attention'

// Fréquences (Hz) jouées l'une après l'autre : montante quand c'est fini, descendante quand on attend.
const NOTES: Record<Cue, { wave: OscillatorType; frequencies: number[] }> = {
  done: { wave: 'sine', frequencies: [659.25, 987.77] },
  attention: { wave: 'triangle', frequencies: [880, 659.25] },
}
const STEP = 0.12
const LENGTH = 0.32
const VOLUME = 0.12

let context: AudioContext | null = null

export function playCue(cue: Cue) {
  context ??= new AudioContext()
  // Un contexte créé hors d'un geste de l'utilisateur peut démarrer suspendu.
  if (context.state === 'suspended') context.resume().catch(() => {})
  const start = context.currentTime + 0.02
  const { wave, frequencies } = NOTES[cue]
  frequencies.forEach((frequency, index) => {
    const at = start + index * STEP
    const oscillator = context!.createOscillator()
    const gain = context!.createGain()
    oscillator.type = wave
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(0, at)
    gain.gain.linearRampToValueAtTime(VOLUME, at + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + LENGTH)
    oscillator.connect(gain).connect(context!.destination)
    oscillator.start(at)
    oscillator.stop(at + LENGTH)
  })
}
