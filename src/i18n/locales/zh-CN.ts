import type en from './en'

export default {
  shell: {
    toggleRail: '显示或隐藏项目栏',
    toggleConversations: '显示或隐藏对话',
    resizeRail: '调整项目栏大小',
    resizeConversations: '调整对话面板大小',
    newChat: '新建对话',
    projects: '项目',
    noProjects: '尚未打开项目',
    conversations: '对话',
    noConversations: '暂无对话',
  },
  workspace: {
    tabs: '已打开的标签页',
    chatTitle: '对话 {n}',
    closeTab: '关闭标签页',
    split: '向右拆分',
    closePane: '关闭面板',
    empty: '没有打开的标签页',
  },
  dock: {
    right: '右侧面板',
    bottom: '底部面板',
    toggleRight: '显示或隐藏右侧面板',
    toggleBottom: '显示或隐藏底部面板',
    moveToRight: '移到右侧面板',
    moveToBottom: '移到底部面板',
    close: '隐藏面板',
    resize: '调整面板大小',
    terminal: { title: '终端', empty: '终端将显示在这里。' },
    changes: { title: '更改', empty: '智能体所做的更改将显示在这里。' },
    files: { title: '文件', empty: '打开一个项目即可浏览其文件。' },
  },
  chat: {
    subtitle: '打开一个项目并启动编程智能体即可开始。',
  },
  composer: {
    label: '消息',
    placeholder: '描述你想要构建的内容…',
    send: '发送',
  },
} satisfies typeof en
