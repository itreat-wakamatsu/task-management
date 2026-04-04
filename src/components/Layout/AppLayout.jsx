import { useState, useEffect } from 'react'
import { useStore } from '@/store/useStore'
import { supabase } from '@/lib/supabase'
import TodayView       from '@/components/Today/TodayView'
import TaskManagerView from '@/components/TaskManager/TaskManagerView'
import AnalyticsView   from '@/components/Analytics/AnalyticsView'
import styles from './AppLayout.module.css'

const TABS = [
  { id: 'today',   label: '今日' },
  { id: 'tasks',   label: 'タスク管理' },
  { id: 'analytics', label: '集計・履歴' },
]

export default function AppLayout() {
  const [activeTab, setActiveTab] = useState('today')
  const { session, loadMasters, loadAppTasks } = useStore()

  // マスタデータ初回読み込み
  useEffect(() => {
    loadMasters()
    if (session?.user?.id) loadAppTasks(session.user.id)
  }, [session?.user?.id])

  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  const today = new Date()
  const dateStr = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日（${'日月火水木金土'[today.getDay()]}）`

  return (
    <div className={styles.shell}>
      {/* ヘッダー */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.dateStr}>{dateStr}</span>
          <span className={styles.appName}>タスクタイマー</span>
        </div>
        <button className={styles.signOut} onClick={handleSignOut} title="ログアウト">
          {session?.user?.email?.split('@')[0]}　⏏
        </button>
      </header>

      {/* タブナビ */}
      <nav className={styles.tabs}>
        {TABS.map(t => (
          <button
            key={t.id}
            className={`${styles.tab} ${activeTab === t.id ? styles.active : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* コンテンツ */}
      <main className={styles.main}>
        {activeTab === 'today'     && <TodayView />}
        {activeTab === 'tasks'     && <TaskManagerView />}
        {activeTab === 'analytics' && <AnalyticsView />}
      </main>
    </div>
  )
}
