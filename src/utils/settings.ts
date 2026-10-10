export const settingsGroups = [
  { id: 'app', sections: ['general', 'appearance', 'shortcuts'] },
  { id: 'agents', sections: ['agents', 'connections', 'skills'] },
  { id: 'workspace', sections: ['archive'] },
] as const

export type SettingsSection = (typeof settingsGroups)[number]['sections'][number]
