import { useStore } from '@/store/useStore'
import { getDisplayElapsed, formatDuration } from '@/hooks/useTimer'
import styles from './TaskCard.module.css'

function fmtTime(d) {
  if (!d) return '--:--'
  const dt = new Date(d)
  return `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`
}

export default function TaskCard({ event, isActive, isPaused, onStart, onEnd, onUndo, onOpenLink }) {
  const clients  = useStore(s => s.clients)
  const client   = clients.find(c => c.id === event.task?.client_id)
  const clColor  = client?.color || 'var(--color-border)'

  const statusLabel = isActive
    ? (isPaused ? '一時停止中' : '進行中')
    : event.status === 'done' ? '完了' : '未開始'

  const badgeCls = isActive
    ? (isPaused ? styles.badgePause : styles.badgeRun)
    : event.status === 'done' ? styles.badgeDone : styles.badgePending

  // 実績表示
  let actualInfo = null
  if (event.status === 'done' && event.actualStart) {
    const elapsed = event.overrideElapsedMs != null
      ? event.overrideElapsedMs
      : (event.actualEnd ? event.actualEnd - event.actualStart : 0)
    const planned = event.plannedEnd - event.plannedStart
    const diff    = elapsed - planned
    const diffCls = diff > 5 * 60000 ? styles.over : diff < -5 * 60000 ? styles.under : ''
    actualInfo = (
      <span className={`${styles.actual} ${diffCls}`}>
        {formatDuration(elapsed)}（{diff >= 0 ? '+' : ''}{Math.round(diff / 60000)}分）
      </span>
    )
  } else if (isActive && event.actualStart) {
    const disp = getDisplayElapsed(event, isPaused, null) // pausedAt は store から
    actualInfo = (
      <span className={styles.actual}>
        正味 {formatDuration(disp)}
      </span>
    )
  }

  return (
    <div className={`${styles.card} ${isActive ? styles.active : ''} ${event.status === 'done' ? styles.done : ''}`}>
      <div className={styles.accent} style={{ background: clColor }} />
      <div className={styles.body}>
        {/* 行1: 時間・タイトル・バッジ */}
        <div className={styles.row1}>
          <span className={styles.time}>
            {fmtTime(event.plannedStart)}–{fmtTime(event.plannedEnd)}
          </span>
          <span className={styles.title}>{event.calendarEventTitle}</span>
          <span className={`${styles.badge} ${badgeCls}`}>{statusLabel}</span>
        </div>

        {/* 行2: タスクID・クライアント・実績・アクション */}
        <div className={styles.row2}>
          <div className={styles.meta}>
            {/* タスクID チップ */}
            {event.taskId ? (
              <button className={styles.chipId} onClick={onOpenLink}>
                {event.taskId}
                {event.autoLinked && <span className={styles.autoTag}>自動</span>}
              </button>
            ) : (
              <button className={styles.chipUnlinked} onClick={onOpenLink}>
                未紐付け ＋
              </button>
            )}
            {/* クライアント */}
            {client && (
              <span className={styles.clientChip} style={{ background: `${clColor}18`, color: clColor }}>
                {client.display_name || client.name}
              </span>
            )}
            {actualInfo}
          </div>

          {/* アクションボタン */}
          <div className={styles.actions}>
            {!isActive && event.status !== 'done' && (
              <button className={styles.btnStart} onClick={onStart}>開始</button>
            )}
            {event.status === 'done' && (
              <button className={styles.btnUndo} onClick={onUndo}>取消</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
