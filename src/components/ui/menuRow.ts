// Lignes des menus à choix du chat (mode, endroit, modèle, branche, « + ») : un seul style. Le choix se voit à son
// fond, sans coche ; l'aide est un frère de la première ligne, donc alignée à gauche sous l'icône.
export const menuRow =
  'flex shrink-0 cursor-pointer flex-col gap-0.5 rounded-md px-2 py-1.5 text-content/75 outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-selection-hover data-[highlighted]:text-content data-[state=checked]:bg-selection data-[state=checked]:text-content'
export const menuRowLine = 'flex min-w-0 items-center gap-2'
export const menuHint = 'text-[11px] leading-4 text-muted'
export const menuTitle = 'px-2 pt-1.5 pb-1 text-[11px] text-muted'
export const menuKbd = 'grid h-5 min-w-5 shrink-0 place-items-center rounded bg-content/8 px-1 font-sans text-xs leading-none text-muted'
