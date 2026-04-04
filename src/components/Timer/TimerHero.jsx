import { useState, useEffect, useCallback } from 'react'
import { useStore } from '@/store/useStore'
import {
  formatCountdown,
  formatDuration,
  getDisplayElapsed,
} from '@/hooks/useTimer'
import styles from './TimerHero.module.css'

export default function TimerHero({ event }) {
  const { isPaused, pausedAt, activeEventId } = useStore()
  const [, setTick] = useState(0)

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
  const remaining  = event.plannedEnd - now
  const planned    = event.plannedEnd - event.plannedStart
  const elapsed    = getDisplayElapsed(event, isPaused, pausedAt)
  const progress   = Math.min(1, Math.max(0, elapsed / planned))
  const isOvertime = remaining < 0
  const isAdjusted = event.overrideElapsedMs != null

  const state = isPaused ? 'pause' : isOvertime ? 'over' : 'run'

  return (
    <div className={`${styles.box} ${styles[state]}`}>
      {/* クライアント・案件 */}
      {client && (
        <div className={styles.clientRow}>
          <span className={styles.dot} style={{ background: client.color }} />
          <span style={{ color: client.color }}>{client.display_name || client.name}</span>
          {project && (
            <span className={styles.projectName}>／{project.name}</span>
          )}
        </div>
      )}

      {/* タスク名 */}
      <div className={styles.taskName}>{event.calendarEventTitle}</div>

      {/* カウントダウン */}
      <div className={`${styles.countdown} ${styles[`cd_${state}`]}`}>
        {formatCountdown(remaining, true)}
      </div>

      {/* ラベル */}
      <div className={`${styles.label} ${styles[`lbl_${state}`]}`}>
        {isPaused
          ? '⏸ 一時停止中'
          : isOvertime
            ? '⚠ 超過中'
            : '残り時間'}
        　{fmtTime(event.plannedStart)}–{fmtTime(event.plannedEnd)}
      </div>

      {/* プログレスバー */}
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
