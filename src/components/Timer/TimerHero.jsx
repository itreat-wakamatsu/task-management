import { useState, useEffect } from 'react'
import { useStore } from '@/store/useStore'
import { getClientColor } from '@/lib/clientColor'
import {
  formatCountdown,
  formatDuration,
  getDisplayElapsed,
} from '@/hooks/useTimer'
import styles from './TimerHero.module.css'

const TIMER_MODE_KEY = 'timerMode'

export default function TimerHero({ event }) {
  const { isPaused, pausedAt, activeEventId } = useStore()
  const [, setTick] = useState(0)
  const [timerMode, setTimerMode] = useState(
    () => localStorage.getItem(TIMER_MODE_KEY) || 'calendar'
  )

  // 毎秒再レンダー
  useEffect(() => {
    if (!activeEventId) return
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [activeEventId])

  const client  = useStore(s => s.clients.find(c => c.id === event?.task?.client_id))
  const project = useStore(s => s.projects.find(p => p.id === event?.task?.project_id))

  if (!event) {
    return (
      <div className={styles.empty}>
        「開始」ボタンを押してタスクを開始してください
      </div>
    )
  }

  const now        = new Date()
  const remaining  = event.plannedEnd - now                         // カレンダー残り
  const planned    = event.plannedEnd - event.plannedStart          // カレンダー工数
  const elapsed    = getDisplayElapsed(event, isPaused, pausedAt)
  const workLeft   = planned - elapsed                              // 見積もり残り
  const progress   = Math.min(1, Math.max(0, elapsed / planned))
  const isAdjusted = event.overrideElapsedMs != null

  // モードごとの表示値
  const displayRemaining = timerMode === 'calendar' ? remaining : workLeft
  const isOvertime = displayRemaining < 0

  const state = isPaused ? 'pause' : isOvertime ? 'over' : 'run'

  function toggleMode() {
    const next = timerMode === 'calendar' ? 'estimate' : 'calendar'
    setTimerMode(next)
    localStorage.setItem(TIMER_MODE_KEY, next)
  }

  return (
    <div className={`${styles.box} ${styles[state]}`}>
      {/* クライアント・案件 */}
      {client && (() => {
        const clColor = getClientColor(client)
        return (
          <div className={styles.clientRow}>
            <span className={styles.dot} style={{ background: clColor }} />
            <span style={{ color: clColor }}>{client.display_name || client.name}</span>
            {project && (
              <span className={styles.projectName}>／{project.name}</span>
            )}
          </div>
        )
      })()}

      {/* タスク名 + モードトグル */}
      <div className={styles.taskRow}>
        <div className={styles.taskName}>{event.calendarEventTitle}</div>
        <button
          className={`${styles.modeToggle} ${timerMode === 'estimate' ? styles.modeToggleActive : ''}`}
          onClick={toggleMode}
          title={timerMode === 'calendar'
            ? 'クリックで予定工数モードに切替（残り工数ベース）'
            : 'クリックでカレンダーモードに切替（終了時刻ベース）'}
        >
          {timerMode === 'calendar' ? '終了時刻' : '見積工数'}
        </button>
      </div>

      {/* カウントダウン */}
      <div className={`${styles.countdown} ${styles[`cd_${state}`]}`}>
        {formatCountdown(displayRemaining, true)}
      </div>

      {/* ラベル */}
      <div className={`${styles.label} ${styles[`lbl_${state}`]}`}>
        {isPaused
          ? '⏸ 一時停止中'
          : isOvertime
            ? timerMode === 'calendar' ? '⚠ 終了時刻超過' : '⚠ 工数超過'
            : timerMode === 'calendar' ? '残り時間（終了時刻まで）' : '残り工数（見積もりまで）'
        }
        　{fmtTime(event.plannedStart)}–{fmtTime(event.plannedEnd)}
      </div>

      {/* プログレスバー（経過 / 計画工数） */}
      <div className={styles.progressWrap}>
        <div
          className={`${styles.progressFill} ${styles[`pf_${state}`]}`}
          style={{ width: `${Math.min(progress * 100, 100)}%` }}
        />
      </div>

      {/* メタ情報 */}
      <div className={styles.meta}>
        <span>
          正味経過　<strong>{formatDuration(elapsed)}</strong>
          {isAdjusted && <span className={styles.adjustedMark}> ✎</span>}
        </span>
        <span>計画 {formatDuration(planned)}</span>
      </div>
    </div>
  )
}

function fmtTime(d) {
  if (!d) return '--:--'
  const dt = new Date(d)
  return `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`
}
