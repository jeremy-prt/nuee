import type en from './en'

export default {
  rail: {
    label: 'Navegação principal',
    toggle: 'Expandir ou recolher a barra lateral',
    resize: 'Redimensionar a barra lateral',
    home: 'Início',
    issues: 'Issues',
    pullRequests: 'Pull requests',
    notes: 'Notas',
    search: 'Pesquisar',
    chats: 'Chats',
    projects: 'Projetos',
    addProject: 'Adicionar um projeto',
    usage: 'Uso',
    updates: 'Atualizações',
    settings: 'Configurações',
  },
  chats: {
    newChat: 'Novo chat',
    toggle: 'Mostrar ou ocultar o painel lateral',
    resize: 'Redimensionar o painel lateral',
    empty: 'Nenhum chat ainda. Comece um com {shortcut}.',
  },
  workspace: {
    tabs: 'Abas abertas',
    chatTitle: 'Chat {n}',
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
    close: 'Ocultar painel',
    resize: 'Redimensionar o painel',
    terminal: {
      title: 'Terminal',
      empty: 'Os terminais aparecerão aqui.',
    },
    changes: {
      title: 'Alterações',
      empty: 'As alterações feitas pelos agentes aparecerão aqui.',
    },
    files: {
      title: 'Arquivos',
      empty: 'Abra um projeto para navegar pelos arquivos.',
    },
  },
  chat: {
    subtitle: 'Abra um projeto e inicie um agente de código para começar.',
  },
  composer: {
    label: 'Mensagem',
    placeholder: 'Descreva o que você quer construir…',
    send: 'Enviar',
  },
  home: {
    subtitle: 'Um resumo da sua atividade aparecerá aqui.',
    projects: 'Projetos',
    chats: 'Chats',
  },
  search: {
    placeholder: 'Pesquisar nos chats…',
    hint: 'Digite para pesquisar nos seus chats.',
    noResults: 'Nenhum resultado',
  },
  empty: {
    issues: 'As issues dos seus projetos aparecerão aqui.',
    pullRequests: 'Os pull requests dos seus projetos aparecerão aqui.',
    notes: 'Suas notas aparecerão aqui.',
    usage: 'O uso e os limites dos seus agentes aparecerão aqui assim que um estiver conectado.',
    settings: 'As configurações chegarão em breve.',
  },
  select: {
    issues: 'Selecione uma issue para exibi-la aqui.',
    pullRequests: 'Selecione um pull request para exibi-lo aqui.',
    notes: 'Selecione uma nota para exibi-la aqui.',
  },
  updates: {
    installed: 'Versão instalada: {version}',
    check: 'Procurar atualizações',
    checking: 'Procurando…',
    upToDate: 'Você está na versão mais recente.',
    available: 'A versão {version} está disponível.',
    view: 'Ver a versão',
    failed: 'Não foi possível verificar agora.',
  },
} satisfies typeof en
