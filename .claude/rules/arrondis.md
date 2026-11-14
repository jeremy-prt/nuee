---
paths:
  - "src/**/*.vue"
  - "src/**/*.ts"
  - "src/assets/css/**"
---

# Arrondis

Un seul rayon de base, `--radius` (8 px) dans `main.css` ; les classes en découlent : `rounded-sm` 4, `rounded-md` 6, `rounded-lg` 8, `rounded-xl` 12, `rounded-2xl` 16. Jamais de rayon en px dans un composant (`rounded-[5px]`, `border-radius: 10px`) : un token, ou `var(--radius-*)` en CSS.

| Élément | Rayon |
|---|---|
| Badge, `kbd`, case à cocher, bouton icône posé dans une ligne | `rounded-sm` |
| Ligne de liste, bouton, champ, onglet | `rounded-md` |
| Ligne de menu | `rounded-lg` (menu `rounded-xl` moins son padding) |
| Menu, popover, carte, toast, carte centrale | `rounded-xl` |
| Champ de saisie du chat, dialogue | `rounded-2xl` |
| Pastille, point, bouton rond | `rounded-full` |

Élément posé dans un autre : rayon intérieur = rayon extérieur − écart (padding + bordure), jamais moins de 4 px. Si l'écart dépasse le rayon du parent, l'enfant garde son rayon normal. Jamais un enfant plus arrondi que son parent.

`corner-shape: squircle` : pas dans le WebKit stable de macOS (Safari 27.3 en bêta au 14/11/2026), ne pas s'en servir.
