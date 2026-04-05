import { useState, useRef, useEffect, useCallback } from 'react'
import styles from './AddToTodayModal.module.css'

const HOUR_HEIGHT = 56
const START_HOUR  = 6
const END_HOUR    = 23
const SNAP_MIN    = 15
const TOTAL_HOURS = END_HOUR - START_HOUR
const WORK_START  = 9 * 60
const WORK_END    = 18 * 60
const LUNCH_START = 12 * 60
const LUNCH_END   = 13 * 60

function timeToY(h, m = 0) {
  return ((h - START_HOUR) * 60 + m) / 60 * HOUR_HEIGHT
}

function minsToY(totalMins) {
  return (totalMins - START_HOUR * 60) / 60 * HOUR_HEIGHT
}

function yToMins(y, totalHeight) {
  const raw = Math.max(0, Math.min(y, totalHeight)) / HOUR_HEIGHT * 60 + START_HOUR * 60
  return Math.round(raw / SNAP_MIN) * SNAP_MIN
}

function fmtMins(totalMins) {
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
}

/** 既存イベントの空き枠から次の開始時刻（分）を探す */
export function findNextFreeSlot(events, durationMin = 60) {
  const now = new Date()
  const nowMins = now.getHours() * 60 + now.getMinutes()
  const cursor  = Math.max(WORK_START, Math.ceil(nowMins / SNAP_MIN) * SNAP_MIN)

  const busy = events
    .filter(ev => !ev.isAllDay && ev.plannedStart && ev.plannedEnd)
    .map(ev => ({
      start: new Date(ev.plannedStart).getHours() * 60 + new Date(ev.plannedStart).getMinutes(),
      end:   new Date(ev.plannedEnd).getHours()   * 60 + new Date(ev.plannedEnd).getMinutes(),
    }))
    .sort((a, b) => a.start - b.start)

  for (let t = cursor; t + durationMin <= WORK_END; t += SNAP_MIN) {
    if (t < LUNCH_END && t + durationMin > LUNCH_START) {
      t = LUNCH_END - SNAP_MIN; continue
    }
    const overlaps = busy.some(b => t < b.end && t + durationMin > b.start)
    if (!overlaps) return t
  }
  return null
}

/** 残り空き時間（分）を計算 */
export function calcFreeMinutes(events) {
  const now = new Date()
  const nowMins = now.getHours() * 60 + now.getMinutes()
  if (nowMins >= WORK_END) return 0
  const from = Math.max(WORK_START, nowMins)

  const busy = events
    .filter(ev => !ev.isAllDay && ev.plannedStart && ev.plannedEnd)
    .map(ev => ({
      start: new Date(ev.plannedStart).getHours() * 60 + new Date(ev.plannedStart).getMinutes(),
      end:   new Date(ev.plannedEnd).getHours()   * 60 + new Date(ev.plannedEnd).getMinutes(),
    }))

  let freeMins = 0
  for (let t = from; t < WORK_END; t += SNAP_MIN) {
    if (t >= LUNCH_START && t < LUNCH_END) continue
    const isBusy = busy.some(b => t >= b.start && t < b.end)
    if (!isBusy) freeMins += SNAP_MIN
  }
  return freeMins
}

/**
 * 今日の予定に追加モーダル
 * @param {object}   task          - 追加するタスク
 * @param {object[]} existingEvents - 既存の todayEvents
 * @param {string}   targetDateStr  - YYYY-MM-DD
 * @param {Function} onSave         - ({ title, start, end }) => void
 * @param {Function} onClose
 */
export default function AddToTodayModal({ task, existingEvents, targetDateStr, onSave, onClose }) {
  const totalHeight = TOTAL_HOURS * HOUR_HEIGHT
  const containerRef = useRef(null)
  const dragRef      = useRef(null)

  const initSlot = findNextFreeSlot(existingEvents, 60) ?? WORK_START
  const [newStart, setNewStart] = useState(initSlot)
  const [newEnd,   setNewEnd]   = useState(initSlot + 60)
  const [saving,   setSaving]   = useState(false)

  // 8:00 付近へスクロール
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = Math.max(0, (8 - START_HOUR) * HOUR_HEIGHT - 16)
    }
  }, [])

  // ── Drag（新イベントブロック）──
  const onMouseMove = useCallback((e) => {
    const drag = dragRef.current
    if (!drag) return
    e.preventDefault()
    const dy    = e.clientY - drag.startY
    const dMins = Math.round((dy / HOUR_HEIGHT) * 60 / SNAP_MIN) * SNAP_MIN

    if (drag.type === 'move') {
      const dur      = drag.origEnd - drag.origStart
      const ns       = Math.max(START_HOUR * 60, Math.min(drag.origStart + dMins, END_HOUR * 60 - dur))
      const snapped  = Math.round(ns / SNAP_MIN) * SNAP_MIN
      setNewStart(snapped)
      setNewEnd(snapped + dur)
    } else {
      const ne = Math.max(drag.origStart + SNAP_MIN, drag.origEnd + dMins)
      setNewEnd(Math.round(ne / SNAP_MIN) * SNAP_MIN)
    }
  }, [])

  const onMouseUp = useCallback(() => {
    dragRef.current = null
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup',   onMouseUp)
  }, [onMouseMove])

  function startDrag(e, type) {
    e.preventDefault()
    dragRef.current = { type, startY: e.clientY, origStart: newStart, origEnd: newEnd }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup',   onMouseUp)
  }

  async function handleSave() {
    setSaving(true)
    const [y, m, d] = targetDateStr.split('-').map(Number)
    const start = new Date(y, m - 1, d, Math.floor(newStart / 60), newStart % 60)
    const end   = new Date(y, m - 1, d, Math.floor(newEnd   / 60), newEnd   % 60)
    await onSave({ title: task?.title ?? '新しい予定', start, end })
    setSaving(false)
  }

  const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => START_HOUR + i)
  const newTop    = minsToY(newStart)
  const newHeight = Math.max(minsToY(newEnd) - newTop, HOUR_HEIGHT / 2)

  return (
    <div className={styles.backdrop} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.box}>
        <div className={styles.header}>
          <div className={styles.headerTitle}>
            <span className={styles.title}>今日の予定に追加</span>
            {task && <span className={styles.taskName}>{task.title}</span>}
          </div>
          <button className={styles.btnClose} onClick={onClose}>×</button>
        </div>
        <p className={styles.desc}>
          ブロックをドラッグして開始・終了時間を調整してください。
        </p>

        <div className={styles.calWrap} ref={containerRef}>
          <div className={styles.grid} style={{ height: totalHeight }}>
            {/* 時間ラベル + 横線 */}
            {hours.map(h => (
              <div key={h} className={styles.hourRow} style={{ top: timeToY(h) }}>
                <span className={styles.hourLabel}>{String(h).padStart(2,'0')}:00</span>
                <div className={styles.hourLine} />
              </div>
            ))}

            {/* 業務時間ハイライト */}
            <div className={styles.workZone} style={{
              top:    minsToY(WORK_START),
              height: minsToY(WORK_END) - minsToY(WORK_START),
            }} />

            {/* 既存イベント（参照用、クリック不可） */}
            {existingEvents.filter(ev => !ev.isAllDay && ev.plannedStart && ev.plannedEnd).map(ev => {
              const h = new Date(ev.plannedStart).getHours()
              const m = new Date(ev.plannedStart).getMinutes()
              const eh = new Date(ev.plannedEnd).getHours()
              const em = new Date(ev.plannedEnd).getMinutes()
              const top    = timeToY(h, m)
              const height = Math.max(timeToY(eh, em) - top, 12)
              return (
                <div key={ev.id} className={styles.existingEvent} style={{ top, height, left: 56, right: 4 }}>
                  <span className={styles.existingTitle}>{ev.calendarEventTitle}</span>
                </div>
              )
            })}

            {/* 新規イベントブロック（ドラッグ可） */}
            <div
              className={styles.newEvent}
              style={{ top: newTop, height: newHeight, left: 56, right: 4 }}
              onMouseDown={e => startDrag(e, 'move')}
            >
              <div className={styles.newEventInner}>
                <span className={styles.newEventTime}>{fmtMins(newStart)}–{fmtMins(newEnd)}</span>
                <span className={styles.newEventTitle}>{task?.title ?? '新しい予定'}</span>
              </div>
              {/* 下端リサイズ */}
              <div
                className={styles.resizeHandle}
                onMouseDown={e => { e.stopPropagation(); startDrag(e, 'resize') }}
              />
            </div>
          </div>
        </div>

        <div className={styles.footer}>
          <div className={styles.timeDisplay}>
            {fmtMins(newStart)} – {fmtMins(newEnd)}
            （{newEnd - newStart}分）
          </div>
          <button className={styles.btnCancel} onClick={onClose}>キャンセル</button>
          <button className={styles.btnSave} onClick={handleSave} disabled={saving}>
            {saving ? '追加中...' : 'カレンダーに追加'}
          </button>
        </div>
      </div>
    </div>
  )
}
