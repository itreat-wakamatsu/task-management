import { useState, useEffect, useMemo, useRef } from 'react'
import { useStore } from '@/store/useStore'
import { supabase } from '@/lib/supabase'
import { fetchTodayEvents, createCalendarEvent } from '@/lib/googleCalendar'
import { calcFreeMinutes } from '@/components/Today/AddToTodayModal'
import TodayView       from '@/components/Today/TodayView'
import TaskManagerView from '@/components/TaskManager/TaskManagerView'
import AnalyticsView   from '@/components/Analytics/AnalyticsView'
import BacklogModal    from '@/components/Backlog/BacklogModal'
import BacklogBadge    from '@/components/Backlog/BacklogBadge'
import AddToTodayModal   from '@/components/Today/AddToTodayModal'
import McpSettingsModal  from '@/components/Settings/McpSettingsModal'
import HelpButton        from '@/components/Tutorial/HelpButton'
import TutorialOverlay   from '@/components/Tutorial/TutorialOverlay'
import { TUTORIALS, getCompletedTutorials, isDismissedForever, dismissForever } from '@/components/Tutorial/tutorialData'
import FeedbackModal     from '@/components/Feedback/FeedbackModal'
import styles from './AppLayout.module.css'

const TABS = [
  { id: 'today',     label: '今日' },
  { id: 'tasks',     label: 'タスク管理' },
  { id: 'analytics', label: '集計・履歴' },
]

const isDev = import.meta.env.DEV || import.meta.env.VITE_APP_ENV === 'development'
const HIDDEN_KEY = 'hidden_calendar_events'

export default function AppLayout() {
  const [activeTab,       setActiveTab]      = useState('today')
  const [showBacklog,     setShowBacklog]    = useState(false)
  const [addToTodayTask,  setAddToTodayTask] = useState(null)
  const datePickerRef = useRef(null)
  const [showMcpSettings, setShowMcpSettings] = useState(false)
  const [activeTutorial,  setActiveTutorial]  = useState(null)

  // 初回アクセス時にチュートリアルを自動表示
  useEffect(() => {
    if (isDismissedForever()) return
    const completed = getCompletedTutorials()
    if (!completed.includes('daily-workflow')) {
      // 少し遅延させてUIが描画されてから表示
      const timer = setTimeout(() => {
        setActiveTutorial(TUTORIALS.find(t => t.id === 'daily-workflow'))
      }, 800)
      return () => clearTimeout(timer)
    }
  }, [])
  const [showFeedback,    setShowFeedback]   = useState(false)
  const {
    session, loadMasters, loadAppTasks, loadBacklogToken, backlogToken,
    devDate, setDevDate, setRawCalEvents, rawCalDate, rawCalEvents,
    todayEvents, setTodayEvents,
  } = useStore()

  useEffect(() => {
    loadMasters()
    if (session?.user?.id) {
      loadAppTasks(session.user.id)
      loadBacklogToken(session.user.id)
    }
  }, [session?.user?.id])

  // アプリ起動時に GCal を1回取得（キャッシュがなければ）
  useEffect(() => {
    if (!session) return
    const targetDate = devDate ?? new Date()
    const todayStr   = targetDate.toISOString().slice(0, 10)
    if (rawCalDate === todayStr) return
    // トークンが null でも gFetch() がリフレッシュトークン経由で自動取得する
    const token = session?.provider_token || null
    fetchTodayEvents(token, targetDate)
      .then(events => setRawCalEvents(events, todayStr))
      .catch(err => console.error('GCal 初回取得エラー:', err))
  }, [session?.user?.id])

  // 非表示イベントを除いた今日のイベント一覧（予定に追加モーダル用）
  const visibleTodayEvents = useMemo(() => {
    try {
      const raw = localStorage.getItem(HIDDEN_KEY)
      const hiddenIds = new Set(raw ? JSON.parse(raw) : [])
      return todayEvents.filter(ev => !hiddenIds.has(ev.id))
    } catch { return todayEvents }
  }, [todayEvents])

  // 残り空き時間（1分ごとに更新）
  const [freeMins, setFreeMins] = useState(0)
  useEffect(() => {
    function update() { setFreeMins(calcFreeMinutes(todayEvents)) }
    update()
    const timer = setInterval(update, 60000)
    return () => clearInterval(timer)
  }, [todayEvents])

  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  // 今日の予定に追加（GCal POST → todayEvents 更新）
  async function handleAddToToday({ title, start, end, taskId }) {
    const token = session?.provider_token || null

    try {
      const newEv = await createCalendarEvent(token, {
        summary: title,
        start: { dateTime: start.toISOString(), timeZone: 'Asia/Tokyo' },
        end:   { dateTime: end.toISOString(),   timeZone: 'Asia/Tokyo' },
      })
      // rawCalEvents と todayEvents に追加
      const todayStr = (devDate ?? new Date()).toISOString().slice(0, 10)
      setRawCalEvents([...rawCalEvents, newEv], todayStr)
      // TodayView 側のマージは次回ロード時に反映されるため、簡易的に todayEvents へ直接追加
      const merged = {
        id: newEv.calendarEventId, ...newEv,
        status: 'pending', detailId: null, taskId: taskId ?? null,
        autoLinked: !!taskId, actualStart: null, actualEnd: null,
        pauseLog: [], overrideElapsedMs: null,
        task: taskId ? (addToTodayTask ?? null) : null,
      }
      setTodayEvents([...todayEvents, merged].sort((a, b) =>
        new Date(a.plannedStart) - new Date(b.plannedStart)
      ))
    } catch (err) {
      console.error('GCal 追加エラー:', err)
      alert('Google カレンダーへの追加に失敗しました')
    }
    setAddToTodayTask(null)
  }

  const displayDate    = devDate ?? new Date()
  const dateStr        = `${displayDate.getFullYear()}年${displayDate.getMonth() + 1}月${displayDate.getDate()}日（${'日月火水木金土'[displayDate.getDay()]}）`
  const dateInputValue = [
    displayDate.getFullYear(),
    String(displayDate.getMonth() + 1).padStart(2, '0'),
    String(displayDate.getDate()).padStart(2, '0'),
  ].join('-')
  const targetDateStr = dateInputValue

  // 今日かどうか
  const today = new Date()
  const isToday = displayDate.getFullYear() === today.getFullYear() &&
                  displayDate.getMonth()    === today.getMonth()    &&
                  displayDate.getDate()     === today.getDate()

  function handleDateChange(e) {
    const [y, m, d] = e.target.value.split('-').map(Number)
    setDevDate(new Date(y, m - 1, d))
  }

  function handleGoToToday() {
    setDevDate(new Date())
  }

  function handleDateClick() {
    try {
      datePickerRef.current?.showPicker()
    } catch {
      datePickerRef.current?.click()
    }
  }

  // 残り空き時間の表示文字列
  const freeLabel = useMemo(() => {
    if (freeMins <= 0) return '空き時間なし'
    const h = Math.floor(freeMins / 60)
    const m = freeMins % 60
    if (h === 0) return `空き ${m}分`
    if (m === 0) return `空き ${h}時間`
    return `空き ${h}時間${m}分`
  }, [freeMins])

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.dateRow}>
            <button
              className={`${styles.dateTrigger} ${!isToday ? styles.dateTriggerOff : ''}`}
              onClick={handleDateClick}
              title="日付を変更"
            >
              <span className={styles.dateStr}>{dateStr}</span>
              <span className={styles.dateChevron}>▾</span>
            </button>
            {/* 非表示 input: showPicker() で直接開く */}
            <input
              ref={datePickerRef}
              type="date"
              className={styles.hiddenDateInput}
              value={dateInputValue}
              onChange={handleDateChange}
            />
            {!isToday && (
              <button className={styles.todayResetBtn} onClick={handleGoToToday}>
                今日
              </button>
            )}
          </div>
          <div className={styles.appNameRow}>
            <span className={styles.appName}>タスクタイマー</span>
            {isDev && <span className={styles.devBadge}>DEV</span>}
          </div>
        </div>
        <div className={styles.headerRight}>
          {/* 残り空き時間 */}
          <span data-tutorial="free-time" className={`${styles.freeTime} ${freeMins <= 0 ? styles.freeTimeNone : ''}`}>
            {freeLabel}
          </span>

          <button
            data-tutorial="btn-backlog"
            className={`${styles.btnBacklog} ${backlogToken ? styles.btnBacklogConnected : ''}`}
            onClick={() => setShowBacklog(true)}
            title={backlogToken ? `${backlogToken.space_key}.backlog.com と連携済み` : 'Backlog 連携'}
          >
            <BacklogBadge size={13} />
            Backlog
          </button>
          <button
            className={styles.btnMcp}
            onClick={() => setShowMcpSettings(true)}
            title="MCP 連携設定"
          >
            MCP
          </button>
          <HelpButton
            onStartTutorial={id => {
              const t = TUTORIALS.find(x => x.id === id)
              if (t) setActiveTutorial(t)
            }}
          />
          <button
            className={styles.btnFeedback}
            onClick={() => setShowFeedback(true)}
            title="フィードバックを送る"
          >
            Feedback
          </button>
          <button className={styles.signOut} onClick={handleSignOut} title="ログアウト">
            {session?.user?.email?.split('@')[0]}　⏏
          </button>
        </div>
      </header>

      <nav className={styles.tabs}>
        {TABS.map(t => (
          <button
            key={t.id}
            data-tutorial={`tab-${t.id}`}
            className={`${styles.tab} ${activeTab === t.id ? styles.active : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className={styles.main}>
        {activeTab === 'today'     && <TodayView />}
        {activeTab === 'tasks'     && (
          <TaskManagerView onAddToToday={task => setAddToTodayTask(task)} />
        )}
        {activeTab === 'analytics' && <AnalyticsView />}
      </main>

      {showBacklog     && <BacklogModal      onClose={() => setShowBacklog(false)} />}
      {showMcpSettings && <McpSettingsModal onClose={() => setShowMcpSettings(false)} />}
      {showFeedback    && <FeedbackModal    onClose={() => setShowFeedback(false)} activeTab={activeTab} />}

      {addToTodayTask && (
        <AddToTodayModal
          task={addToTodayTask}
          existingEvents={visibleTodayEvents}
          targetDateStr={targetDateStr}
          onSave={handleAddToToday}
          onClose={() => setAddToTodayTask(null)}
        />
      )}

      {activeTutorial && (
        <TutorialOverlay
          tutorial={activeTutorial}
          onClose={() => setActiveTutorial(null)}
          onDismiss={() => {
            dismissForever()
            setActiveTutorial(null)
          }}
        />
      )}
    </div>
  )
}
