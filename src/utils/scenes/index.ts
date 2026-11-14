import aurora from './aurora'
import birds from './birds'
import cat from './cat'
import constellation from './constellation'
import fireflies from './fireflies'
import gather from './gather'
import race from './race'
import rain from './rain'
import robot from './robot'
import rocket from './rocket'
import train from './train'
import type { Scene } from './types'
import ufo from './ufo'

export const scenes: Scene[] = [race, cat, birds, fireflies, ufo, rocket, train, robot, constellation, aurora, rain, gather]

// Vitesse de lecture : les scènes jouées telles quelles allaient trop vite par moments (effet de saccade à l'œil).
// La course a été ralentie dans son propre fichier.
export const PACE: Record<string, number> = { race: 1 }
export const DEFAULT_PACE = 0.75
