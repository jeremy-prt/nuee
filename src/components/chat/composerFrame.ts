// Bord du cadre du champ de saisie selon le mode. ChatModeEdge reprend les mêmes classes pour passer d'une teinte à
// l'autre : au relais, le cadre reprend la sienne au pixel près.
export const frameLook = {
  plain: 'composer-lift border-stroke group-has-[textarea:focus]/composer:border-stroke-focus',
  orchestra: 'border-violet/45 shadow-[0_0_22px_-8px_var(--color-violet)] group-has-[textarea:focus]/composer:border-violet/70',
  summary: 'border-note/45 shadow-[0_0_22px_-8px_var(--color-note)] group-has-[textarea:focus]/composer:border-note/70',
}

export type FrameTone = keyof typeof frameLook
