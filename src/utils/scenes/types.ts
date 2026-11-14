// Petites scènes en pixel art jouées de temps en temps en bas de la session vierge (`ChatScenes`). Une scène ne fait
// que dessiner : le moteur gère le fondu d'entrée et de sortie, l'échelle (1 pixel = 2 px) et les couleurs.

// Encres, toutes tirées des jetons de main.css : g or (note), w blanc (texte), k fond (un œil), b bleu (mention),
// v violet, p rose (skill), o orange, s vert (success), r rouge (danger), m gris (muted).
export type Ink = 'g' | 'w' | 'k' | 'b' | 'v' | 'p' | 'o' | 's' | 'r' | 'm'

export interface Painter {
  // Largeur et hauteur de la bande, en pixels. y = 0 est le sol, y monte vers le haut.
  readonly width: number
  readonly height: number
  // Dessin en grille de caractères (une encre par caractère, espace = vide), posé avec son coin bas-gauche en (x, y).
  // `flip` le retourne de gauche à droite ; `reveal` (0 à 1) ne montre que le bas, pour faire pousser ; `alpha` 0 à 1.
  sprite(art: readonly string[], x: number, y: number, options?: { flip?: boolean; alpha?: number; reveal?: number }): void
  dot(x: number, y: number, ink: Ink, alpha?: number): void
  // Nombre pseudo-aléatoire entre 0 et 1, stable pour un même `index` pendant toute la scène, différent d'une fois sur
  // l'autre : à utiliser à la place de Math.random(), puisque `draw` est appelé à chaque image.
  pick(index: number): number
}

export interface Scene {
  name: string
  // Durée en secondes, fondu de sortie compris (le moteur l'applique sur les 0,4 dernières secondes).
  duration: number
  // `t` en secondes depuis le début. Appelé 30 fois par seconde : rien d'allouer de lourd ici.
  draw(paint: Painter, t: number): void
}
