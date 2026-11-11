// Gabarit commun des champs de saisie (recherches, message de commit, adresse, nom tapé dans l'arbre) : un cadre
// `field` avec l'attribut `data-control`, une icône éventuelle, puis le champ `fieldText`. 28 px sur une ligne ; un
// `textarea` qui grandit garde `py-[5px] leading-4` pour tomber sur la même hauteur.
export const field =
  'flex min-h-7 min-w-0 items-center gap-1.5 rounded-md border border-stroke bg-selection/50 px-2 focus-within:border-stroke-focus'
export const fieldText = 'min-w-0 flex-1 bg-transparent text-xs text-content outline-none select-text placeholder:text-muted'
