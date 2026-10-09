import type en from './en'

export default {
  shell: {
    toggleRail: 'Mostrar ou ocultar a barra de projetos',
    toggleConversations: 'Mostrar ou ocultar as conversas',
    resizeRail: 'Redimensionar a barra de projetos',
    resizeConversations: 'Redimensionar as conversas',
    newChat: 'Nova conversa',
    projects: 'Projetos',
    noProjects: 'Nenhum projeto aberto',
    conversations: 'Conversas',
    noConversations: 'Nenhuma conversa ainda',
  },
  workspace: {
    tabs: 'Abas abertas',
    chatTitle: 'Conversa {n}',
    closeTab: 'Fechar aba',
    split: 'Dividir à direita',
    closePane: 'Fechar painel',
    empty: 'Nenhuma aba aberta',
  },
  dock: {
    right: 'Painel direito',
    bottom: 'Painel inferior',
    toggleRight: 'Mostrar ou ocultar o painel direito',
    toggleBottom: 'Mostrar ou ocultar o painel inferior',
    moveToRight: 'Mover para o painel direito',
    moveToBottom: 'Mover para o painel inferior',
    close: 'Ocultar painel',
    resize: 'Redimensionar o painel',
    terminal: { title: 'Terminal', empty: 'Os terminais aparecerão aqui.' },
    changes: { title: 'Alterações', empty: 'As alterações feitas pelos agentes aparecerão aqui.' },
    files: { title: 'Arquivos', empty: 'Abra um projeto para navegar pelos arquivos.' },
  },
  chat: {
    subtitle: 'Abra um projeto e inicie um agente de código para começar.',
  },
  composer: {
    label: 'Mensagem',
    placeholder: 'Descreva o que você quer construir…',
    send: 'Enviar',
  },
} satisfies typeof en
