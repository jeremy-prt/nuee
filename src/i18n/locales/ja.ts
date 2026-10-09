import type en from './en'

export default {
  shell: {
    toggleRail: 'プロジェクトバーの表示を切り替え',
    toggleConversations: '会話の表示を切り替え',
    resizeRail: 'プロジェクトバーのサイズを変更',
    resizeConversations: '会話パネルのサイズを変更',
    newChat: '新しい会話',
    projects: 'プロジェクト',
    noProjects: '開いているプロジェクトはありません',
    conversations: '会話',
    noConversations: 'まだ会話はありません',
  },
  workspace: {
    tabs: '開いているタブ',
    chatTitle: '会話 {n}',
    closeTab: 'タブを閉じる',
    split: '右に分割',
    closePane: 'パネルを閉じる',
    empty: '開いているタブはありません',
  },
  dock: {
    right: '右パネル',
    bottom: '下パネル',
    toggleRight: '右パネルの表示を切り替え',
    toggleBottom: '下パネルの表示を切り替え',
    moveToRight: '右パネルに移動',
    moveToBottom: '下パネルに移動',
    close: 'パネルを隠す',
    resize: 'パネルのサイズを変更',
    terminal: { title: 'ターミナル', empty: 'ターミナルはここに表示されます。' },
    changes: { title: '変更', empty: 'エージェントによる変更はここに表示されます。' },
    files: { title: 'ファイル', empty: 'プロジェクトを開くとファイルを閲覧できます。' },
  },
  chat: {
    subtitle: 'プロジェクトを開いて、コーディングエージェントを起動しましょう。',
  },
  composer: {
    label: 'メッセージ',
    placeholder: '作りたいものを説明してください…',
    send: '送信',
  },
} satisfies typeof en
