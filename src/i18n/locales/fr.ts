import type en from './en'

export default {
  shell: {
    toggleRail: 'Afficher ou masquer la barre des projets',
    toggleConversations: 'Afficher ou masquer les conversations',
    resizeRail: 'Redimensionner la barre des projets',
    resizeConversations: 'Redimensionner les conversations',
    newChat: 'Nouvelle conversation',
    projects: 'Projets',
    noProjects: 'Aucun projet ouvert',
    conversations: 'Conversations',
    noConversations: 'Aucune conversation pour le moment',
  },
  workspace: {
    tabs: 'Onglets ouverts',
    chatTitle: 'Conversation {n}',
    closeTab: 'Fermer l\'onglet',
    split: 'Diviser à droite',
    closePane: 'Fermer le panneau',
    empty: 'Aucun onglet ouvert',
  },
  dock: {
    right: 'Panneau de droite',
    bottom: 'Panneau du bas',
    toggleRight: 'Afficher ou masquer le panneau de droite',
    toggleBottom: 'Afficher ou masquer le panneau du bas',
    moveToRight: 'Déplacer dans le panneau de droite',
    moveToBottom: 'Déplacer dans le panneau du bas',
    close: 'Masquer le panneau',
    resize: 'Redimensionner le panneau',
    terminal: { title: 'Terminal', empty: 'Les terminaux apparaîtront ici.' },
    changes: { title: 'Modifications', empty: 'Les modifications faites par les agents apparaîtront ici.' },
    files: { title: 'Fichiers', empty: 'Ouvre un projet pour parcourir ses fichiers.' },
  },
  chat: {
    subtitle: 'Ouvre un projet et lance un agent de code pour commencer.',
  },
  composer: {
    label: 'Message',
    placeholder: 'Décris ce que tu veux construire…',
    send: 'Envoyer',
  },
} satisfies typeof en
