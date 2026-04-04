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

const isDev = import.meta.env.DEV

export default function AppLayout() {
  const [activeTab, setActiveTab] = useState('today')
  const { session, loadMasters, loadAppTasks, devDate, setDevDate } = useStore()

  // マスタデータ初回読み込み
  useEffect(() => {
    loadMasters()
    if (session?.user?.id) loadAppTasks(session.user.id)
  }, [session?.user?.id])

  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  const displayDate = devDate ?? new Date()
  const dateStr = `${displayDate.getFullYear()}年${displayDate.getMonth() + 1}月${displayDate.getDate()}日（${'日月火水木金土'[displayDate.getDay()]}）`

  // <input type="date"> 用の値（YYYY-MM-DD）— toISOString() はUTC変換されるためローカル日付を使用
  const dateInputValue = [
    displayDate.getFullYear(),
    String(displayDate.getMonth() + 1).padStart(2, '0'),
    String(displayDate.getDate()).padStart(2, '0'),
  ].join('-')

  function handleDevDateChange(e) {
    const [y, m, d] = e.target.value.split('-').map(Number)
    const next = new Date(y, m - 1, d)
    setDevDate(next)
  }

  return (
    <div className={styles.shell}>
      {/* ヘッダー */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.dateRow}>
            <span className={styles.dateStr}>{dateStr}</span>
            {isDev && (
              <input
                type="date"
                className={styles.devDateInput}
                value={dateInputValue}
                onChange={handleDevDateChange}
                title="開発用：表示日付を変更"
              />
            )}
          </div>
          <div className={styles.appNameRow}>
            <span className={styles.appName}>タスクタイマー</span>
            {isDev && <span className={styles.devBadge}>DEV</span>}
          </div>
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
