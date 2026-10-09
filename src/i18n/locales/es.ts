import type en from './en'

export default {
  rail: {
    label: 'Navegación principal',
    toggle: 'Expandir o contraer la barra lateral',
    resize: 'Cambiar el tamaño de la barra lateral',
    home: 'Inicio',
    issues: 'Issues',
    pullRequests: 'Pull requests',
    notes: 'Notas',
    search: 'Buscar',
    chats: 'Chats',
    projects: 'Proyectos',
    addProject: 'Añadir un proyecto',
    usage: 'Uso',
    updates: 'Actualizaciones',
    settings: 'Ajustes',
  },
  chats: {
    newChat: 'Nuevo chat',
    toggle: 'Mostrar u ocultar el panel lateral',
    resize: 'Cambiar el tamaño del panel lateral',
    empty: 'Aún no hay chats. Empieza uno con +.',
  },
  workspace: {
    tabs: 'Pestañas abiertas',
    chatTitle: 'Chat {n}',
    closeTab: 'Cerrar pestaña',
    split: 'Dividir a la derecha',
    closePane: 'Cerrar panel',
    empty: 'Ninguna pestaña abierta',
  },
  dock: {
    right: 'Panel derecho',
    bottom: 'Panel inferior',
    toggleRight: 'Mostrar u ocultar el panel derecho',
    toggleBottom: 'Mostrar u ocultar el panel inferior',
    close: 'Ocultar panel',
    resize: 'Cambiar el tamaño del panel',
    terminal: {
      title: 'Terminal',
      empty: 'Las terminales aparecerán aquí.',
    },
    changes: {
      title: 'Cambios',
      empty: 'Los cambios hechos por los agentes aparecerán aquí.',
    },
    files: {
      title: 'Archivos',
      empty: 'Abre un proyecto para explorar sus archivos.',
    },
  },
  chat: {
    subtitle: 'Abre un proyecto y lanza un agente de código para empezar.',
  },
  composer: {
    label: 'Mensaje',
    placeholder: 'Describe lo que quieres construir…',
    send: 'Enviar',
  },
  home: {
    subtitle: 'Aquí aparecerá un resumen de tu actividad.',
    projects: 'Proyectos',
    chats: 'Chats',
  },
  search: {
    placeholder: 'Buscar en los chats…',
    hint: 'Escribe para buscar en tus chats.',
    noResults: 'Sin resultados',
  },
  empty: {
    issues: 'Las issues de tus proyectos aparecerán aquí.',
    pullRequests: 'Las pull requests de tus proyectos aparecerán aquí.',
    notes: 'Tus notas aparecerán aquí.',
    usage: 'El uso y los límites de tus agentes aparecerán aquí en cuanto conectes uno.',
    settings: 'Los ajustes llegarán pronto.',
  },
  select: {
    issues: 'Selecciona una issue para verla aquí.',
    pullRequests: 'Selecciona una pull request para verla aquí.',
    notes: 'Selecciona una nota para verla aquí.',
  },
  updates: {
    installed: 'Versión instalada: {version}',
    check: 'Buscar actualizaciones',
    checking: 'Buscando…',
    upToDate: 'Tienes la última versión.',
    available: 'La versión {version} está disponible.',
    view: 'Ver la versión',
    failed: 'No se pudo comprobar ahora.',
  },
} satisfies typeof en
