import { useState, useRef } from 'react'
import { useStore } from '@/store/useStore'
import { getDisplayElapsed, formatDuration } from '@/hooks/useTimer'
import { getClientColor, hexToRgba } from '@/lib/clientColor'
import ClientColorPicker from '@/components/shared/ClientColorPicker'
import styles from './TaskCard.module.css'

function fmtTime(d) {
  if (!d) return '--:--'
  const dt = new Date(d)
  return `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`
}

function toTimeInputValue(d) {
  if (!d) return ''
  const dt = new Date(d)
  return `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`
}

function applyTimeToDate(base, timeStr) {
  const [h, m] = timeStr.split(':').map(Number)
  const d = new Date(base)
  d.setHours(h, m, 0, 0)
  return d
}

function PermIcon({ type }) {
  if (type === 'solo') return (
    <svg className={styles.permIcon} viewBox="0 0 16 16" fill="currentColor" title="自分のみ">
      <circle cx="8" cy="5" r="3"/>
      <path d="M2 14c0-3.314 2.686-6 6-6s6 2.686 6 6H2z"/>
    </svg>
  )
  if (type === 'multi') return (
    <svg className={styles.permIcon} viewBox="0 0 20 16" fill="currentColor" title="複数参加者">
      <circle cx="7" cy="5" r="3"/>
      <path d="M1 14c0-3.314 2.686-6 6-6s6 2.686 6 6H1z"/>
      <circle cx="14" cy="5" r="2.5"/>
      <path d="M11 14c.09-.98.49-1.87 1.12-2.57A5.98 5.98 0 0119 14h-8z"/>
    </svg>
  )
  if (type === 'readonly') return (
    <svg className={styles.permIcon} viewBox="0 0 16 16" fill="currentColor" title="編集不可">
      <rect x="3" y="7" width="10" height="8" rx="1.5"/>
      <path d="M5 7V5a3 3 0 016 0v2" fill="none" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  )
  return null
}

export default function TaskCard({
  event, isActive, isPaused, onStart, onEnd, onUndo, onResume, onOnTime, onOpenLink,
  onHide, isHidden, onTimeChange, onOpenDetail,
}) {
  const { clients, projects } = useStore(s => ({ clients: s.clients, projects: s.projects }))
  const client   = clients.find(c => c.id === event.task?.client_id)
  const project  = projects.find(p => p.id === event.task?.project_id)
  const clColor  = getClientColor(client) || null
  const clBg     = client ? hexToRgba(getClientColor(client), 0.1) : null

  const [editingTime,    setEditingTime]    = useState(false)
  const [editStart,      setEditStart]      = useState('')
  const [editEnd,        setEditEnd]        = useState('')
  const [colorPickerPos, setColorPickerPos] = useState(null)
  const colorBtnRef = useRef(null)

  const statusLabel = isActive
    ? (isPaused ? '一時停止中' : '進行中')
    : event.status === 'done' ? '完了' : '未開始'

  const badgeCls = isActive
    ? (isPaused ? styles.badgePause : styles.badgeRun)
    : event.status === 'done' ? styles.badgeDone : styles.badgePending

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
    const disp = getDisplayElapsed(event, isPaused, null)
    actualInfo = <span className={styles.actual}>正味 {formatDuration(disp)}</span>
  }

  function openTimeEdit() {
    setEditStart(toTimeInputValue(event.plannedStart))
    setEditEnd(toTimeInputValue(event.plannedEnd))
    setEditingTime(true)
  }

  function commitTimeEdit() {
    if (!editStart || !editEnd) { setEditingTime(false); return }
    const newStart = applyTimeToDate(event.plannedStart, editStart)
    const newEnd   = applyTimeToDate(event.plannedStart, editEnd)
    if (newEnd <= newStart) { alert('終了時間は開始時間より後にしてください'); return }
    onTimeChange?.(event.id, newStart, newEnd)
    setEditingTime(false)
  }

  function openClientColorPicker() {
    if (!colorBtnRef.current) return
    const rect = colorBtnRef.current.getBoundingClientRect()
    const PICKER_W = 208
    const PICKER_H = 300
    let left = rect.left
    if (left + PICKER_W > window.innerWidth - 8) left = window.innerWidth - PICKER_W - 8
    const top = rect.bottom + 4 + PICKER_H > window.innerHeight - 8
      ? rect.top - PICKER_H - 4
      : rect.bottom + 4
    setColorPickerPos({ top, left })
  }

  const permType = event.permissionType

  // Card background logic
  const isDone = event.status === 'done'

  let cardBg
  if (isDone) {
    cardBg = 'var(--color-bg-secondary)'
  } else if (isActive && !isPaused) {
    cardBg = clColor ? hexToRgba(clColor, 0.22) : 'var(--color-amber-bg)'
  } else {
    cardBg = clBg || undefined
  }

  const cardBorderColor = (isActive && !isDone) ? (clColor || '#EF9F27') : undefined

  return (
    <div
      className={`${styles.card} ${isActive ? styles.active : ''} ${isDone ? styles.done : ''} ${isHidden ? styles.hidden : ''}`}
      style={{
        ...(cardBg ? { background: cardBg } : {}),
        ...(cardBorderColor ? { borderColor: cardBorderColor, borderWidth: '1.5px' } : {}),
      }}
    >
      <div className={styles.accent} style={{ background: clColor }} />
      <div className={styles.body}>
        {/* 行1: 時間・タイトル・バッジ */}
        <div className={styles.row1}>
          {editingTime ? (
            <div className={styles.timeEdit}>
              <input type="time" value={editStart} onChange={e => setEditStart(e.target.value)} className={styles.timeInput} />
              <span>–</span>
              <input type="time" value={editEnd}   onChange={e => setEditEnd(e.target.value)}   className={styles.timeInput} />
              <button className={styles.btnTimeOk}     onClick={commitTimeEdit}>OK</button>
              <button className={styles.btnTimeCancel} onClick={() => setEditingTime(false)}>×</button>
            </div>
          ) : (
            <button
              className={styles.time}
              onClick={onTimeChange ? openTimeEdit : undefined}
              title={onTimeChange ? '時間を編集' : undefined}
            >
              {fmtTime(event.plannedStart)}–{fmtTime(event.plannedEnd)}
            </button>
          )}
          {permType && <PermIcon type={permType} />}
          {/* タイトルクリック → 詳細ポップアップ */}
          <button className={styles.titleBtn} onClick={() => onOpenDetail?.(event)}>
            {event.calendarEventTitle}
          </button>
          <span className={`${styles.badge} ${badgeCls}`}>{statusLabel}</span>
        </div>

        {/* 行2: タスクID・クライアント・実績・アクション */}
        <div className={styles.row2}>
          <div className={styles.meta}>
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
            {client && (
              <div className={styles.clientChipWrap}>
                <button
                  ref={colorBtnRef}
                  className={styles.clientChip}
                  style={{ background: clColor ? `${clColor}18` : undefined, color: clColor || undefined }}
                  onClick={openClientColorPicker}
                  title="色を変更"
                >
                  {client.display_name || client.name}
                </button>
                {colorPickerPos && (
                  <ClientColorPicker
                    client={client}
                    onClose={() => setColorPickerPos(null)}
                    style={{ position: 'fixed', top: colorPickerPos.top, left: colorPickerPos.left }}
                  />
                )}
              </div>
            )}
            {project && (
              <span className={styles.projectChip}>{project.name}</span>
            )}
            {actualInfo}
          </div>

          <div className={styles.actions}>
            {onHide && (
              <button className={styles.btnHide} onClick={() => onHide(event.id)} title={isHidden ? '表示する' : '非表示にする'}>
                {isHidden ? '表示' : '隠す'}
              </button>
            )}
            {!isActive && event.status !== 'done' && (
              <button className={styles.btnStart} onClick={onStart}>開始</button>
            )}
            {!isActive && event.status !== 'done' && onOnTime && (
              <button className={styles.btnOnTime} onClick={onOnTime} title="計画終了時刻で完了">予定通り</button>
            )}
            {event.status === 'done' && (
              <>
                <button className={styles.btnResume} onClick={onResume}>再開</button>
                <button className={styles.btnUndo}   onClick={onUndo}>取消</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── 重複タスク統合カード ──
// 同一 taskId を持つ複数イベントを1枚のカードにまとめて表示する。
const SLOT_STATUS_CLS = { done: styles.slotDone, running: styles.slotRun, paused: styles.slotPause, pending: styles.slotPending }
const SLOT_STATUS_LBL = { done: '完了', running: '進行中', paused: '停止中', pending: '未開始' }

export function MergedTaskGroup({
  events, activeEventId, isPaused,
  onStart, onEnd, onUndo, onOnTime, onResume, onOpenLink, onOpenDetail,
}) {
  const { clients, projects } = useStore(s => ({ clients: s.clients, projects: s.projects }))

  const task    = events[0].task
  const client  = clients.find(c => c.id === task?.client_id)
  const project = projects.find(p => p.id === task?.project_id)
  const clColor = getClientColor(client) || null

  // グループ内のアクティブ判定
  const activeEv = events.find(e => e.id === activeEventId)
  const isGroupActive = !!activeEv
  const isGroupPaused = isGroupActive && isPaused

  // アクション対象イベント（進行中 > 未開始の先頭 > 最後の完了）
  const leadEv = activeEv
    || events.find(e => e.status === 'pending')
    || events[events.length - 1]

  const allDone = events.every(e => e.status === 'done')

  // 各スロットのステータス
  function slotStatus(ev) {
    if (ev.id === activeEventId) return isPaused ? 'paused' : 'running'
    return ev.status
  }

  const cardBg = isGroupActive && !isGroupPaused && clColor
    ? hexToRgba(clColor, 0.22)
    : (allDone ? 'var(--color-bg-secondary)' : (client ? hexToRgba(getClientColor(client), 0.1) : undefined))

  return (
    <div
      className={`${styles.card} ${isGroupActive ? styles.active : ''} ${allDone ? styles.done : ''}`}
      style={{
        ...(cardBg ? { background: cardBg } : {}),
        ...(isGroupActive ? { borderColor: clColor || '#EF9F27', borderWidth: '1.5px' } : {}),
      }}
    >
      <div className={styles.accent} style={{ background: clColor }} />
      <div className={styles.body}>
        {/* 行1: 時間スロット群 + タイトル */}
        <div className={styles.mergedRow1}>
          <div className={styles.mergedSlots}>
            {events.map(ev => (
              <span
                key={ev.id}
                className={`${styles.mergedSlot} ${SLOT_STATUS_CLS[slotStatus(ev)] || styles.slotPending}`}
              >
                {fmtTime(ev.plannedStart)}–{fmtTime(ev.plannedEnd)}
              </span>
            ))}
          </div>
          <button className={styles.titleBtn} onClick={() => onOpenDetail?.(leadEv)}>
            {task?.title || leadEv.calendarEventTitle}
          </button>
        </div>

        {/* 行2: メタ情報 + アクション */}
        <div className={styles.row2}>
          <div className={styles.meta}>
            {task?.id ? (
              <button className={styles.chipId} onClick={() => onOpenLink?.(leadEv)}>
                {task.id}
              </button>
            ) : (
              <button className={styles.chipUnlinked} onClick={() => onOpenLink?.(leadEv)}>
                未紐付け ＋
              </button>
            )}
            {client && (
              <span
                className={styles.clientChip}
                style={{ background: clColor ? `${clColor}18` : undefined, color: clColor || undefined }}
              >
                {client.display_name || client.name}
              </span>
            )}
            {project && (
              <span className={styles.projectChip}>{project.name}</span>
            )}
            <span className={styles.actual}>
              {events.length}回に分けて実施
            </span>
          </div>

          <div className={styles.actions}>
            {!isGroupActive && !allDone && (
              <>
                <button className={styles.btnStart} onClick={() => onStart(leadEv.id)}>開始</button>
                {onOnTime && (
                  <button className={styles.btnOnTime} onClick={() => onOnTime(leadEv.id)} title="計画終了時刻で完了">予定通り</button>
                )}
              </>
            )}
            {allDone && (
              <button className={styles.btnResume} onClick={() => onResume?.(leadEv)}>再開</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
