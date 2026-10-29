// Lignes de tous les menus (choix du chat, clic droit, « … ») : un seul style, celui de monocode. Icône à gauche,
// titre et aide dans la même colonne ; un choix se voit à son fond, sans coche. `py-2` avec une aide, `py-1.5` sans.
export const menuRow =
  'flex shrink-0 cursor-pointer items-start gap-2.5 rounded-lg px-2 text-content outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:not-data-[state=checked]:bg-selection-hover data-[state=checked]:bg-selection'
export const menuPanel = 'ui-pop z-50 flex flex-col gap-0.5 overflow-y-auto p-1.5 text-xs text-content select-none'
export const menuIcon = 'mt-0.5 size-4 shrink-0'
export const menuLabel = 'block truncate text-[13px] leading-5'
export const menuHint = 'block truncate text-[11px] leading-4 text-muted'
export const menuTitle = 'px-2 pt-1 pb-1.5 text-[10px] font-medium tracking-wide text-muted uppercase'
