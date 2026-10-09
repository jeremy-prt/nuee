import type en from './en'

export default {
  shell: {
    toggleRail: 'Mostrar u ocultar la barra de proyectos',
    toggleConversations: 'Mostrar u ocultar las conversaciones',
    resizeRail: 'Cambiar el tamaño de la barra de proyectos',
    resizeConversations: 'Cambiar el tamaño de las conversaciones',
    newChat: 'Nueva conversación',
    projects: 'Proyectos',
    noProjects: 'Ningún proyecto abierto',
    conversations: 'Conversaciones',
    noConversations: 'Aún no hay conversaciones',
  },
  workspace: {
    tabs: 'Pestañas abiertas',
    chatTitle: 'Conversación {n}',
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
    moveToRight: 'Mover al panel derecho',
    moveToBottom: 'Mover al panel inferior',
    close: 'Ocultar panel',
    resize: 'Cambiar el tamaño del panel',
    terminal: { title: 'Terminal', empty: 'Las terminales aparecerán aquí.' },
    changes: { title: 'Cambios', empty: 'Los cambios hechos por los agentes aparecerán aquí.' },
    files: { title: 'Archivos', empty: 'Abre un proyecto para explorar sus archivos.' },
  },
  chat: {
    subtitle: 'Abre un proyecto y lanza un agente de código para empezar.',
  },
  composer: {
    label: 'Mensaje',
    placeholder: 'Describe lo que quieres construir…',
    send: 'Enviar',
  },
} satisfies typeof en
