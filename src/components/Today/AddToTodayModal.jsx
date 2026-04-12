import { useState, useRef, useEffect, useCallback } from 'react'
import { useStore } from '@/store/useStore'
import { fetchTodayEvents } from '@/lib/googleCalendar'
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

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土']

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
function dateToStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function addDays(d, n) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}
/** Mon-Fri の5日間を取得 */
function getWeekDays(base) {
  const d = new Date(base)
  const dow = d.getDay() // 0=Sun
  const monday = new Date(d)
  monday.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1))
  return Array.from({ length: 5 }, (_, i) => { const dd = new Date(monday); dd.setDate(monday.getDate() + i); return dd })
}
function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
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
    if (t < LUNCH_END && t + durationMin > LUNCH_START) { t = LUNCH_END - SNAP_MIN; continue }
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
 * 予定に追加モーダル
 * @param {object}   task          - 追加するタスク
 * @param {object[]} existingEvents - 既存の todayEvents（今日分）
 * @param {string}   targetDateStr  - YYYY-MM-DD（初期表示日）
 * @param {Function} onSave         - ({ title, start, end, taskId }) => void
 * @param {Function} onClose
 */
export default function AddToTodayModal({ task, existingEvents, targetDateStr, onSave, onClose }) {
  const totalHeight = TOTAL_HOURS * HOUR_HEIGHT
  const containerRef = useRef(null)
  const weekContainerRef = useRef(null)
  const dragRef  = useRef(null)

  // GCal トークン（日付別イベント取得用）
  const { providerToken, session } = useStore(s => ({ providerToken: s.providerToken, session: s.session }))

  // 日付ごとのイベントキャッシュ（dateStr → events[]）
  const eventsCache = useRef({})
  const [cacheVersion, setCacheVersion] = useState(0) // eslint-disable-line no-unused-vars

  // キャッシュ取得・更新ヘルパー
  function getCachedEvents(d) {
    return eventsCache.current[dateToStr(d)] || []
  }
  function cacheSet(d, evs) {
    eventsCache.current[dateToStr(d)] = evs
    setCacheVersion(v => v + 1)
  }

  // 選択中の日付
  const [selectedDate, setSelectedDate] = useState(() => {
    const [y, m, d] = (targetDateStr || dateToStr(new Date())).split('-').map(Number)
    return new Date(y, m - 1, d)
  })
  // 表示モード
  const [viewMode, setViewMode] = useState('day')  // 'day' | 'week'
  // 週間ビューで選択中の列 (0-4, Mon-Fri)
  const [weekDayCol, setWeekDayCol] = useState(() => {
    const [y, m, d] = (targetDateStr || dateToStr(new Date())).split('-').map(Number)
    const base = new Date(y, m - 1, d)
    const dow = base.getDay()
    return dow === 0 ? 4 : dow === 6 ? 0 : dow - 1  // 0=Mon…4=Fri
  })

  const initSlot = findNextFreeSlot(existingEvents, 60) ?? WORK_START
  const [newStart, setNewStart] = useState(initSlot)
  const [newEnd,   setNewEnd]   = useState(initSlot + 60)
  const [saving,   setSaving]   = useState(false)

  const weekDays = getWeekDays(selectedDate)

  // モーダル初期化：targetDate 分は既存イベントでキャッシュ埋め
  useEffect(() => {
    const initStr = targetDateStr || dateToStr(new Date())
    if (!eventsCache.current[initStr]) {
      eventsCache.current[initStr] = existingEvents
      setCacheVersion(v => v + 1)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 選択日が変わったら未キャッシュならフェッチ
  useEffect(() => {
    const dateStr = dateToStr(selectedDate)
    if (eventsCache.current[dateStr] !== undefined) return
    const token = providerToken || session?.provider_token || null
    fetchTodayEvents(token, selectedDate)
      .then(evs => cacheSet(selectedDate, evs))
      .catch(() => cacheSet(selectedDate, []))
  }, [selectedDate, providerToken, session?.provider_token]) // eslint-disable-line react-hooks/exhaustive-deps

  // 週ビュー切替時に5日分を先行フェッチ
  useEffect(() => {
    if (viewMode !== 'week') return
    const token = providerToken || session?.provider_token || null
    weekDays.forEach(d => {
      const dateStr = dateToStr(d)
      if (eventsCache.current[dateStr] !== undefined) return
      fetchTodayEvents(token, d)
        .then(evs => cacheSet(d, evs))
        .catch(() => cacheSet(d, []))
    })
  }, [viewMode, weekDays[0]?.toDateString()]) // eslint-disable-line react-hooks/exhaustive-deps

  // 8:00 付近へスクロール
  useEffect(() => {
    const el = viewMode === 'week' ? weekContainerRef.current : containerRef.current
    if (el) el.scrollTop = Math.max(0, (8 - START_HOUR) * HOUR_HEIGHT - 16)
  }, [viewMode])

  // 日付ナビゲーション
  function prevDay() {
    const d = addDays(selectedDate, -1)
    setSelectedDate(d)
    if (viewMode === 'week') {
      const dow = d.getDay()
      setWeekDayCol(dow === 0 ? 4 : dow === 6 ? 0 : dow - 1)
    }
  }
  function nextDay() {
    const d = addDays(selectedDate, 1)
    setSelectedDate(d)
    if (viewMode === 'week') {
      const dow = d.getDay()
      setWeekDayCol(dow === 0 ? 4 : dow === 6 ? 0 : dow - 1)
    }
  }

  // 週間ビューで別の日を選択
  function selectWeekDay(colIdx) {
    setWeekDayCol(colIdx)
    setSelectedDate(weekDays[colIdx])
  }

  // ── Drag（1日ビュー）──
  const onMouseMove = useCallback((e) => {
    const drag = dragRef.current
    if (!drag || drag.mode !== 'day') return
    e.preventDefault()
    const dy    = e.clientY - drag.startY
    const dMins = Math.round((dy / HOUR_HEIGHT) * 60 / SNAP_MIN) * SNAP_MIN
    if (drag.type === 'move') {
      const dur     = drag.origEnd - drag.origStart
      const ns      = Math.max(START_HOUR * 60, Math.min(drag.origStart + dMins, END_HOUR * 60 - dur))
      const snapped = Math.round(ns / SNAP_MIN) * SNAP_MIN
      setNewStart(snapped); setNewEnd(snapped + dur)
    } else {
      const ne = Math.max(drag.origStart + SNAP_MIN, drag.origEnd + dMins)
      setNewEnd(Math.round(ne / SNAP_MIN) * SNAP_MIN)
    }
  }, [])

  // ── Drag（週間ビュー）──
  const onMouseMoveWeek = useCallback((e) => {
    const drag = dragRef.current
    if (!drag || drag.mode !== 'week') return
    e.preventDefault()

    // 列判定
    if (drag.gridRef?.current) {
      const rect = drag.gridRef.current.getBoundingClientRect()
      const colW = (rect.width - 44) / 5  // 44px = time label
      const x = e.clientX - rect.left - 44
      const col = Math.max(0, Math.min(4, Math.floor(x / colW)))
      if (col !== drag.currentCol) {
        drag.currentCol = col
        setWeekDayCol(col)
        setSelectedDate(weekDays[col])
      }
    }

    const dy    = e.clientY - drag.startY
    const dMins = Math.round((dy / HOUR_HEIGHT) * 60 / SNAP_MIN) * SNAP_MIN
    if (drag.type === 'move') {
      const dur     = drag.origEnd - drag.origStart
      const ns      = Math.max(START_HOUR * 60, Math.min(drag.origStart + dMins, END_HOUR * 60 - dur))
      const snapped = Math.round(ns / SNAP_MIN) * SNAP_MIN
      setNewStart(snapped); setNewEnd(snapped + dur)
    } else {
      const ne = Math.max(drag.origStart + SNAP_MIN, drag.origEnd + dMins)
      setNewEnd(Math.round(ne / SNAP_MIN) * SNAP_MIN)
    }
  }, [weekDays])

  const onMouseUp = useCallback(() => {
    dragRef.current = null
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mousemove', onMouseMoveWeek)
    window.removeEventListener('mouseup',   onMouseUp)
  }, [onMouseMove, onMouseMoveWeek])

  function startDrag(e, type, mode = 'day') {
    e.preventDefault()
    dragRef.current = {
      mode, type,
      startY: e.clientY,
      origStart: newStart, origEnd: newEnd,
      currentCol: weekDayCol,
      gridRef: mode === 'week' ? weekContainerRef : null,
    }
    if (mode === 'week') {
      window.addEventListener('mousemove', onMouseMoveWeek)
    } else {
      window.addEventListener('mousemove', onMouseMove)
    }
    window.addEventListener('mouseup', onMouseUp)
  }

  async function handleSave() {
    setSaving(true)
    const d = selectedDate
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(newStart / 60), newStart % 60)
    const end   = new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(newEnd   / 60), newEnd   % 60)
    await onSave({ title: task?.title ?? '新しい予定', start, end, taskId: task?.id ?? null })
    setSaving(false)
  }

  const hours   = Array.from({ length: TOTAL_HOURS }, (_, i) => START_HOUR + i)
  const newTop    = minsToY(newStart)
  const newHeight = Math.max(minsToY(newEnd) - newTop, HOUR_HEIGHT / 2)

  // 今日かどうか
  const today = new Date()
  const isToday = isSameDay(selectedDate, today)

  const dateLabel = `${selectedDate.getMonth()+1}/${selectedDate.getDate()}（${DAY_NAMES[selectedDate.getDay()]}）`

  // 選択日の既存イベント（1日ビュー用）※キャッシュから取得
  const todayExisting = getCachedEvents(selectedDate).filter(ev =>
    !ev.isAllDay && ev.plannedStart && ev.plannedEnd
  )

  return (
    <div className={styles.backdrop} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.box}>
        {/* ヘッダー */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.title}>予定に追加</span>
            {task && <span className={styles.taskName}>{task.title}</span>}
          </div>
          <button className={styles.btnClose} onClick={onClose}>×</button>
        </div>

        {/* 日付ナビゲーション + ビュー切替 */}
        <div className={styles.toolbar}>
          <div className={styles.dateNav}>
            <button className={styles.navBtn} onClick={prevDay} title="前の日">‹</button>
            <span className={`${styles.dateLabel} ${isToday ? styles.dateLabelToday : ''}`}>
              {dateLabel}
            </span>
            <button className={styles.navBtn} onClick={nextDay} title="次の日">›</button>
          </div>
          <div className={styles.viewToggle}>
            <button
              className={`${styles.viewBtn} ${viewMode === 'day' ? styles.viewBtnActive : ''}`}
              onClick={() => setViewMode('day')}
            >1日</button>
            <button
              className={`${styles.viewBtn} ${viewMode === 'week' ? styles.viewBtnActive : ''}`}
              onClick={() => setViewMode('week')}
            >週</button>
          </div>
        </div>

        {/* ── 1日ビュー ── */}
        {viewMode === 'day' && (
          <div className={styles.calWrap} ref={containerRef}>
            <div className={styles.grid} style={{ height: totalHeight }}>
              {hours.map(h => (
                <div key={h} className={styles.hourRow} style={{ top: timeToY(h) }}>
                  <span className={styles.hourLabel}>{String(h).padStart(2,'0')}:00</span>
                  <div className={styles.hourLine} />
                </div>
              ))}
              <div className={styles.workZone} style={{
                top:    minsToY(WORK_START),
                height: minsToY(WORK_END) - minsToY(WORK_START),
              }} />

              {/* 既存イベント（キャッシュから） */}
              {todayExisting.map(ev => {
                const h  = new Date(ev.plannedStart).getHours()
                const m  = new Date(ev.plannedStart).getMinutes()
                const eh = new Date(ev.plannedEnd).getHours()
                const em = new Date(ev.plannedEnd).getMinutes()
                const top    = timeToY(h, m)
                const height = Math.max(timeToY(eh, em) - top, 12)
                const key = ev.calendarEventId || ev.id
                return (
                  <div key={key} className={styles.existingEvent} style={{ top, height, left: 56, right: 4 }}>
                    <span className={styles.existingTitle}>{ev.calendarEventTitle}</span>
                  </div>
                )
              })}

              {/* 新規イベントブロック */}
              <div
                className={styles.newEvent}
                style={{ top: newTop, height: newHeight, left: 56, right: 4 }}
                onMouseDown={e => startDrag(e, 'move', 'day')}
              >
                <div className={styles.newEventInner}>
                  <span className={styles.newEventTime}>{fmtMins(newStart)}–{fmtMins(newEnd)}</span>
                  <span className={styles.newEventTitle}>{task?.title ?? '新しい予定'}</span>
                </div>
                <div
                  className={styles.resizeHandle}
                  onMouseDown={e => { e.stopPropagation(); startDrag(e, 'resize', 'day') }}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── 週間ビュー ── */}
        {viewMode === 'week' && (
          <>
            {/* 曜日ヘッダー */}
            <div className={styles.weekHeader}>
              <div className={styles.weekTimeGutter} />
              {weekDays.map((d, i) => {
                const isSelected = i === weekDayCol
                const isDay = isSameDay(d, today)
                return (
                  <div
                    key={i}
                    className={`${styles.weekDayHead} ${isSelected ? styles.weekDayHeadActive : ''} ${isDay ? styles.weekDayHeadToday : ''}`}
                    onClick={() => selectWeekDay(i)}
                  >
                    <span className={styles.weekDayName}>{DAY_NAMES[d.getDay()]}</span>
                    <span className={styles.weekDayDate}>{d.getMonth()+1}/{d.getDate()}</span>
                  </div>
                )
              })}
            </div>

            {/* 週間グリッド本体 */}
            <div className={styles.weekCalWrap} ref={weekContainerRef}>
              <div className={styles.weekGrid} style={{ height: totalHeight }}>
                {/* 時間ラベル */}
                {hours.map(h => (
                  <div key={h} className={styles.weekHourRow} style={{ top: timeToY(h) }}>
                    <span className={styles.weekHourLabel}>{String(h).padStart(2,'0')}:00</span>
                    <div className={styles.weekHourLine} />
                  </div>
                ))}

                {/* 業務時間ハイライト */}
                <div className={styles.weekWorkZone} style={{
                  top:    minsToY(WORK_START),
                  height: minsToY(WORK_END) - minsToY(WORK_START),
                }} />

                {/* 5列のカラム */}
                {weekDays.map((d, colIdx) => {
                  const isSelected = colIdx === weekDayCol
                  // ヘッダーと幅を合わせる: (全幅 - 44px) / 5
                  const colStyle = {
                    position: 'absolute',
                    left:  `calc(44px + ${colIdx} * (100% - 44px) / 5)`,
                    width: 'calc((100% - 44px) / 5)',
                    top: 0,
                    bottom: 0,
                  }
                  // キャッシュから該当日の既存イベントを取得
                  const colEvents = getCachedEvents(d).filter(ev =>
                    !ev.isAllDay && ev.plannedStart && ev.plannedEnd
                  )
                  return (
                    <div
                      key={colIdx}
                      className={`${styles.weekCol} ${isSelected ? styles.weekColActive : ''}`}
                      style={colStyle}
                      onClick={e => {
                        if (dragRef.current) return
                        const rect = e.currentTarget.getBoundingClientRect()
                        const y = e.clientY - rect.top
                        const mins = yToMins(y, totalHeight)
                        const snapped = Math.round(mins / SNAP_MIN) * SNAP_MIN
                        selectWeekDay(colIdx)
                        setNewStart(snapped)
                        setNewEnd(Math.min(END_HOUR * 60, snapped + (newEnd - newStart)))
                      }}
                    >
                      {/* 既存イベント */}
                      {colEvents.map(ev => {
                        const h  = new Date(ev.plannedStart).getHours()
                        const m  = new Date(ev.plannedStart).getMinutes()
                        const eh = new Date(ev.plannedEnd).getHours()
                        const em = new Date(ev.plannedEnd).getMinutes()
                        const top    = timeToY(h, m)
                        const height = Math.max(timeToY(eh, em) - top, 10)
                        const key = ev.calendarEventId || ev.id
                        return (
                          <div key={key} className={styles.weekExistingEvent}
                            style={{ position: 'absolute', top, height, left: 2, right: 2 }}>
                            <span className={styles.existingTitle}>{ev.calendarEventTitle}</span>
                          </div>
                        )
                      })}

                      {/* 新規ブロック（選択列のみ） */}
                      {isSelected && (
                        <div
                          className={styles.newEvent}
                          style={{ position: 'absolute', top: newTop, height: newHeight, left: 2, right: 2 }}
                          onMouseDown={e => { e.stopPropagation(); startDrag(e, 'move', 'week') }}
                        >
                          <div className={styles.newEventInner}>
                            <span className={styles.newEventTime}>{fmtMins(newStart)}–{fmtMins(newEnd)}</span>
                            <span className={styles.newEventTitle}>{task?.title ?? '新しい予定'}</span>
                          </div>
                          <div
                            className={styles.resizeHandle}
                            onMouseDown={e => { e.stopPropagation(); startDrag(e, 'resize', 'week') }}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}

        {/* フッター */}
        <div className={styles.footer}>
          <div className={styles.timeDisplay}>
            {dateLabel}　{fmtMins(newStart)} – {fmtMins(newEnd)}
            <span className={styles.timeDur}>（{newEnd - newStart}分）</span>
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
