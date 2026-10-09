import type en from './en'

export default {
  rail: {
    label: '主导航',
    toggle: '展开或收起侧边栏',
    resize: '调整侧边栏大小',
    home: '首页',
    issues: '议题',
    pullRequests: '拉取请求',
    notes: '笔记',
    search: '搜索',
    chats: '聊天',
    projects: '项目',
    addProject: '添加项目',
    usage: '用量',
    updates: '更新',
    settings: '设置',
  },
  chats: {
    newChat: '新建聊天',
    toggle: '显示或隐藏侧面板',
    resize: '调整侧面板大小',
    empty: '暂无聊天。点击 + 开始一个。',
  },
  workspace: {
    tabs: '已打开的标签页',
    chatTitle: '聊天 {n}',
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
    close: '隐藏面板',
    resize: '调整面板大小',
    terminal: {
      title: '终端',
      empty: '终端将显示在这里。',
    },
    changes: {
      title: '更改',
      empty: '智能体所做的更改将显示在这里。',
    },
    files: {
      title: '文件',
      empty: '打开一个项目即可浏览其文件。',
    },
  },
  chat: {
    subtitle: '打开一个项目并启动编程智能体即可开始。',
  },
  composer: {
    label: '消息',
    placeholder: '描述你想要构建的内容…',
    send: '发送',
  },
  home: {
    subtitle: '你的活动摘要将显示在这里。',
    projects: '项目',
    chats: '聊天',
  },
  search: {
    placeholder: '搜索聊天…',
    hint: '输入以搜索你的聊天。',
    noResults: '无结果',
  },
  empty: {
    issues: '你项目中的议题将显示在这里。',
    pullRequests: '你项目中的拉取请求将显示在这里。',
    notes: '你的笔记将显示在这里。',
    usage: '连接智能体后，其用量和限额将显示在这里。',
    settings: '设置即将推出。',
  },
  select: {
    issues: '选择一个议题即可在此查看。',
    pullRequests: '选择一个拉取请求即可在此查看。',
    notes: '选择一条笔记即可在此查看。',
  },
  updates: {
    installed: '已安装版本：{version}',
    check: '检查更新',
    checking: '正在检查…',
    upToDate: '你使用的是最新版本。',
    available: '版本 {version} 已发布。',
    view: '查看版本',
    failed: '暂时无法检查。',
  },
} satisfies typeof en
