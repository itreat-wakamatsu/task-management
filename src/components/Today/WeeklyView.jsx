import { useState, useEffect, useRef, useCallback } from 'react'
import { useStore } from '@/store/useStore'
import { fetchEventsRange, updateCalendarEvent } from '@/lib/googleCalendar'
import { getClientColor, hexToRgba } from '@/lib/clientColor'
import styles from './WeeklyView.module.css'

const HOUR_HEIGHT = 56
const START_HOUR  = 7
const END_HOUR    = 22
const SNAP_MIN    = 15
const DAYS = ['月', '火', '水', '木', '金']

function getWeekDates(baseDate, weekOffset = 0) {
  const d = new Date(baseDate)
  const day = d.getDay()
  const monday = new Date(d)
  monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1) + weekOffset * 7)
  return Array.from({ length: 5 }, (_, i) => {
    const dd = new Date(monday)
    dd.setDate(monday.getDate() + i)
    return dd
  })
}

function timeToY(dt) {
  if (!dt) return 0
  const d = new Date(dt)
  const mins = (d.getHours() - START_HOUR) * 60 + d.getMinutes()
  return Math.max(0, (mins / 60) * HOUR_HEIGHT)
}

function fmtDate(d) { return `${d.getMonth()+1}/${d.getDate()}` }

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

function fmtTime(d) {
  if (!d) return ''
  const dt = new Date(d)
  return `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`
}

function PermIcon({ type }) {
  if (type === 'solo') return (
    <svg width="9" height="9" viewBox="0 0 16 16" fill="currentColor" style={{ flexShrink: 0, opacity: 0.6 }}>
      <circle cx="8" cy="5" r="3"/>
      <path d="M2 14c0-3.314 2.686-6 6-6s6 2.686 6 6H2z"/>
    </svg>
  )
  if (type === 'multi') return (
    <svg width="11" height="9" viewBox="0 0 20 16" fill="currentColor" style={{ flexShrink: 0, opacity: 0.6 }}>
      <circle cx="7" cy="5" r="3"/>
      <path d="M1 14c0-3.314 2.686-6 6-6s6 2.686 6 6H1z"/>
      <circle cx="14" cy="5" r="2.5"/>
      <path d="M11 14c.09-.98.49-1.87 1.12-2.57A5.98 5.98 0 0119 14h-8z"/>
    </svg>
  )
  if (type === 'readonly') return (
    <svg width="8" height="9" viewBox="0 0 16 16" fill="currentColor" style={{ flexShrink: 0, opacity: 0.6 }}>
      <rect x="3" y="7" width="10" height="8" rx="1.5"/>
      <path d="M5 7V5a3 3 0 016 0v2" fill="none" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  )
  return null
}

export default function WeeklyView({ onOpenDetail, refreshKey, onCreateAt, hiddenIds, showHidden, onAuthError }) {
  const { session, appTasks, todayEvents, clients } = useStore()
  const providerToken = useStore(s => s.providerToken)
  const devDate = useStore(s => s.devDate)
  const [weekOffset, setWeekOffset] = useState(0)
  const [weekEvents, setWeekEvents]  = useState([])
  const [loading, setLoading]        = useState(false)
  const [fetchError, setFetchError]  = useState(null)
  const [createPreview, setCreatePreview] = useState(null) // { dayIdx, top, height }
  const scrollRef = useRef(null)
  const gridRef   = useRef(null)
  const dragRef   = useRef(null)
  const didDragRef = useRef(false)
  const createDragRef = useRef(null)
  const onCreateAtRef = useRef(onCreateAt)
  const tokenRef   = useRef(null)
  const loadWeekRef = useRef(null)
  onCreateAtRef.current = onCreateAt

  const token     = providerToken || session?.provider_token
  const weekDates = getWeekDates(devDate ?? new Date(), weekOffset)
  const today     = devDate ?? new Date()

  tokenRef.current = token

  // 初回レンダリング時に現在時刻が見えるようにスクロール
  useEffect(() => {
    if (scrollRef.current && !loading) {
      const nowY = ((new Date().getHours() - START_HOUR - 1) / (END_HOUR - START_HOUR)) * scrollRef.current.scrollHeight
      scrollRef.current.scrollTop = Math.max(0, nowY)
    }
  }, [loading])

  function loadWeek() {
    setLoading(true)
    setFetchError(null)
    // トークンが null でも gFetch() がリフレッシュトークン経由で自動取得する
    const t = tokenRef.current || null
    fetchEventsRange(t, weekDates[0], weekDates[4])
      .then(evs => setWeekEvents(evs.filter(ev => !ev.isAllDay)))
      .catch(err => {
        console.error(err)
        if (err.message === 'GOOGLE_AUTH_EXPIRED') {
          // 認証エラーは親コンポーネント（TodayView）に伝播
          onAuthError?.()
        } else {
          setFetchError('読み込みに失敗しました。再度お試しください。')
        }
      })
      .finally(() => setLoading(false))
  }
  loadWeekRef.current = loadWeek

  useEffect(() => { loadWeek() }, [weekOffset, token]) // eslint-disable-line

  // refreshKey が変わったらリロード（TodayView から予定を編集・削除したとき）
  useEffect(() => {
    if (refreshKey > 0) loadWeek()
  }, [refreshKey]) // eslint-disable-line

  // ── ドラッグ共通ハンドラ（move / resize 両対応） ──
  const onMouseMove = useCallback((e) => {
    const drag = dragRef.current
    if (!drag) return
    e.preventDefault()

    const dy    = e.clientY - drag.startY
    const dMins = Math.round((dy / HOUR_HEIGHT) * 60 / SNAP_MIN) * SNAP_MIN

    if (drag.isResize) {
      // リサイズ: 終了時刻だけ変える
      const endMins    = (drag.origEnd.getTime()   - drag.baseDate.getTime()) / 60000
      const minEndMins = (drag.origStart.getTime() - drag.baseDate.getTime()) / 60000 + SNAP_MIN
      const newEndMins = Math.max(Math.round((endMins + dMins) / SNAP_MIN) * SNAP_MIN, minEndMins)
      drag.previewStart = drag.origStart
      drag.previewEnd   = new Date(drag.baseDate.getTime() + newEndMins * 60000)
    } else {
      // 移動: 開始・終了ともに変える
      const dur       = drag.origEnd.getTime() - drag.origStart.getTime()
      const startMins = (drag.origStart.getTime() - drag.baseDate.getTime()) / 60000
      const snapped   = Math.round((startMins + dMins) / SNAP_MIN) * SNAP_MIN
      drag.previewStart = new Date(drag.baseDate.getTime() + snapped * 60000)
      drag.previewEnd   = new Date(drag.previewStart.getTime() + dur)
    }

    if (drag.el) {
      const top    = timeToY(drag.previewStart)
      const height = Math.max(timeToY(drag.previewEnd) - top, HOUR_HEIGHT / 4)
      drag.el.style.top    = `${top}px`
      drag.el.style.height = `${height}px`
      const timeEl = drag.el.querySelector('[data-time]')
      if (timeEl) timeEl.textContent = `${fmtTime(drag.previewStart)}–${fmtTime(drag.previewEnd)}`
    }
  }, [])

  const onMouseUp = useCallback(() => {
    const drag = dragRef.current
    dragRef.current = null
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup',   onMouseUp)

    if (!drag?.previewStart) return
    const startChanged = drag.previewStart.getTime() !== drag.origStart.getTime()
    const endChanged   = drag.previewEnd.getTime()   !== drag.origEnd.getTime()
    if (!startChanged && !endChanged) return

    // 複数参加者の確認（ドラッグ完了後に表示）
    if (drag.isMulti) {
      if (!window.confirm(`${drag.attendeeNames} さんも参加しています。本当に変更しますか？`)) {
        // DOM を元に戻す
        if (drag.el) {
          drag.el.style.top    = `${timeToY(drag.origStart)}px`
          drag.el.style.height = `${Math.max(timeToY(drag.origEnd) - timeToY(drag.origStart), HOUR_HEIGHT / 4)}px`
          const timeEl = drag.el.querySelector('[data-time]')
          if (timeEl) timeEl.textContent = fmtTime(drag.origStart)
        }
        return
      }
    }

    didDragRef.current = true

    // 楽観的更新
    setWeekEvents(prev => prev.map(ev =>
      ev.calendarEventId === drag.eventId
        ? { ...ev, plannedStart: drag.previewStart, plannedEnd: drag.previewEnd }
        : ev
    ))

    if (!tokenRef.current) return
    updateCalendarEvent(tokenRef.current, drag.eventId, {
      start: { dateTime: drag.previewStart.toISOString(), timeZone: 'Asia/Tokyo' },
      end:   { dateTime: drag.previewEnd.toISOString(),   timeZone: 'Asia/Tokyo' },
    }).catch(err => {
      console.error('時間変更失敗:', err)
      loadWeekRef.current?.()
    })
  }, [onMouseMove])

  // ── ドラッグで新規作成 ──
  const onCreateMouseMove = useCallback((e) => {
    const drag = createDragRef.current
    if (!drag) return
    const rect = gridRef.current?.getBoundingClientRect()
    if (!rect) return
    const y = e.clientY - rect.top
    const snappedMins = Math.round(((y / HOUR_HEIGHT) * 60) / SNAP_MIN) * SNAP_MIN
    const endAbsMins = Math.max(START_HOUR * 60 + snappedMins, drag.startAbsMins + SNAP_MIN)
    drag.endAbsMins = endAbsMins
    drag.isDragging = true
    const startY = ((drag.startAbsMins - START_HOUR * 60) / 60) * HOUR_HEIGHT
    const endY   = ((endAbsMins        - START_HOUR * 60) / 60) * HOUR_HEIGHT
    setCreatePreview({ dayIdx: drag.dayIdx, top: startY, height: Math.max(endY - startY, HOUR_HEIGHT / 4) })
  }, [])

  const onCreateMouseUp = useCallback(() => {
    const drag = createDragRef.current
    createDragRef.current = null
    window.removeEventListener('mousemove', onCreateMouseMove)
    window.removeEventListener('mouseup',   onCreateMouseUp)
    setCreatePreview(null)
    if (!drag?.isDragging) return
    didDragRef.current = true
    const start = new Date(drag.dayDate)
    start.setHours(Math.floor(drag.startAbsMins / 60), drag.startAbsMins % 60, 0, 0)
    const end = new Date(drag.dayDate)
    end.setHours(Math.floor(drag.endAbsMins / 60), drag.endAbsMins % 60, 0, 0)
    onCreateAtRef.current?.(start, end)
  }, [onCreateMouseMove])

  function handleGridMouseDown(e) {
    if (!onCreateAt) return
    if (e.button !== 0) return
    if (e.target.closest('[id^="week-ev-"]')) return
    if (e.target.closest('button')) return
    if (e.target.closest('[data-action]')) return
    if (dragRef.current) return
    const rect = gridRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const gutterW = 52
    const colW = (rect.width - gutterW) / 5
    const dayIdx = Math.floor((x - gutterW) / colW)
    if (dayIdx < 0 || dayIdx >= 5) return
    const snappedMins = Math.round(((y / HOUR_HEIGHT) * 60) / SNAP_MIN) * SNAP_MIN
    const startAbsMins = START_HOUR * 60 + snappedMins
    createDragRef.current = {
      dayIdx,
      dayDate:       new Date(weekDates[dayIdx]),
      startAbsMins,
      endAbsMins:    startAbsMins + 30,
      isDragging:    false,
    }
    window.addEventListener('mousemove', onCreateMouseMove)
    window.addEventListener('mouseup',   onCreateMouseUp)
  }

  function startDrag(e, ev, dayIdx, isResize = false) {
    if (!ev.canEdit) return
    e.preventDefault()

    const baseDate = new Date(weekDates[dayIdx])
    baseDate.setHours(0, 0, 0, 0)
    const el = document.getElementById(`week-ev-${ev.calendarEventId}`)

    dragRef.current = {
      eventId:      ev.calendarEventId,
      startY:       e.clientY,
      origStart:    new Date(ev.plannedStart),
      origEnd:      new Date(ev.plannedEnd),
      baseDate,
      previewStart: null,
      previewEnd:   null,
      el,
      isResize,
      isMulti:      ev.permissionType === 'multi',
      attendeeNames: ev.otherAttendees?.map(a => a.displayName).join('、') || '',
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup',   onMouseUp)
  }

  // 空きグリッドをクリック → 新しい予定を作成
  function handleGridClick(e) {
    if (!onCreateAt) return
    if (e.target.closest('[id^="week-ev-"]')) return
    if (e.target.closest('button')) return
    if (e.target.closest('[data-action]')) return
    if (dragRef.current) return
    if (didDragRef.current) { didDragRef.current = false; return }

    const rect = gridRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const gutterW = 52
    const colW    = (rect.width - gutterW) / 5
    const dayIdx  = Math.floor((x - gutterW) / colW)
    if (dayIdx < 0 || dayIdx >= 5) return

    const totalMins   = (y / HOUR_HEIGHT) * 60
    const snappedMins = Math.round(totalMins / SNAP_MIN) * SNAP_MIN
    const absMins     = START_HOUR * 60 + snappedMins

    const clickedDate = weekDates[dayIdx]
    const start = new Date(clickedDate)
    start.setHours(Math.floor(absMins / 60), absMins % 60, 0, 0)
    const end = new Date(start.getTime() + 30 * 60000)

    onCreateAt(start, end)
  }

  const totalH = (END_HOUR - START_HOUR) * HOUR_HEIGHT

  return (
    <div className={styles.wrap}>
      {/* ナビゲーション */}
      <div className={styles.nav}>
        <button className={styles.navBtn} onClick={() => setWeekOffset(v => v - 1)}>‹ 前週</button>
        <span className={styles.navLabel}>
          {fmtDate(weekDates[0])} – {fmtDate(weekDates[4])}
        </span>
        <button className={styles.navBtn} onClick={() => setWeekOffset(v => v + 1)}>次週 ›</button>
        {weekOffset !== 0 && (
          <button className={styles.navBtnToday} onClick={() => setWeekOffset(0)}>今週</button>
        )}
        <button
          className={styles.navBtnRefresh}
          onClick={loadWeek}
          disabled={loading}
          title="再読み込み"
        >↺</button>
      </div>
      {fetchError && <div className={styles.fetchError}>{fetchError}</div>}

      {/* カラムヘッダー */}
      <div className={styles.header}>
        <div className={styles.timeGutter} />
        {weekDates.map((d, i) => (
          <div
            key={i}
            className={`${styles.dayHeader} ${isSameDay(d, today) ? styles.dayHeaderToday : ''}`}
          >
            <span className={styles.dayName}>{DAYS[i]}</span>
            <span className={styles.dayNum}>{fmtDate(d)}</span>
          </div>
        ))}
      </div>

      {/* グリッド */}
      <div className={styles.body} ref={scrollRef}>
        <div
          className={styles.grid}
          style={{ height: totalH }}
          ref={gridRef}
          onMouseDown={handleGridMouseDown}
          onClick={handleGridClick}
        >
          {/* 時間軸 */}
          <div className={styles.timeAxis}>
            {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => (
              <div key={i} className={styles.hourLabel} style={{ top: i * HOUR_HEIGHT }}>
                {String(START_HOUR + i).padStart(2,'0')}:00
              </div>
            ))}
          </div>

          {/* 横線 */}
          {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => (
            <div key={i} className={styles.hourLine} style={{ top: i * HOUR_HEIGHT }} />
          ))}

          {/* 今日ハイライト列 */}
          {weekDates.map((d, i) => isSameDay(d, today) ? (
            <div
              key={i}
              className={styles.todayCol}
              style={{ left: `calc(52px + ${i} * ((100% - 52px) / 5))`, width: `calc((100% - 52px) / 5)` }}
            />
          ) : null)}

          {/* 現在時刻ライン */}
          {weekDates.some(d => isSameDay(d, today)) ? (() => {
            const nowY = timeToY(new Date())
            const todayIdx = weekDates.findIndex(d => isSameDay(d, today))
            if (todayIdx < 0 || nowY <= 0) return null
            return (
              <div
                className={styles.nowLine}
                style={{
                  top:   nowY,
                  left:  `calc(52px + ${todayIdx} * ((100% - 52px) / 5))`,
                  width: `calc((100% - 52px) / 5)`,
                }}
              />
            )
          })() : null}

          {/* 各日のイベント */}
          {weekDates.map((d, dayIdx) => {
            const dayEvs = weekEvents.filter(ev =>
              ev.plannedStart && isSameDay(new Date(ev.plannedStart), d) &&
              (showHidden || !hiddenIds?.has(ev.calendarEventId))
            )
            const enriched = dayEvs.map(ev => {
              const te = todayEvents.find(t => t.calendarEventId === ev.calendarEventId)
              const task = te?.task ?? appTasks.find(t => autoMatchTitle(ev.calendarEventTitle, t))
              const client = clients.find(c => c.id === task?.client_id)
              return { ...ev, status: te?.status ?? 'pending', task, client }
            })

            return enriched.map((ev) => {
              const top     = timeToY(ev.plannedStart)
              const bottom  = timeToY(ev.plannedEnd)
              const height  = Math.max(bottom - top, HOUR_HEIGHT / 4)
              const clColor = getClientColor(ev.client)
              const clBg    = clColor ? hexToRgba(clColor, 0.15) : null
              const isDone  = ev.status === 'done'
              const perm    = ev.permissionType

              return (
                <div
                  key={ev.calendarEventId}
                  id={`week-ev-${ev.calendarEventId}`}
                  className={`${styles.event} ${isDone ? styles.eventDone : ''} ${ev.canEdit ? styles.eventEditable : ''}`}
                  style={{
                    top,
                    height,
                    left:            `calc(52px + ${dayIdx} * ((100% - 52px) / 5) + 2px)`,
                    width:           `calc((100% - 52px) / 5 - 4px)`,
                    borderLeftColor: clColor || undefined,
                    background:      isDone ? 'var(--color-bg-secondary)' : (clBg || undefined),
                    cursor:          ev.canEdit ? 'grab' : 'pointer',
                  }}
                  onMouseDown={ev.canEdit ? (e) => {
                    if (e.target.closest('[data-action]')) return
                    startDrag(e, ev, dayIdx, false)
                  } : undefined}
                  onClick={(e) => {
                    if (e.target.closest('[data-action]')) return
                    if (didDragRef.current) { didDragRef.current = false; return }
                    onOpenDetail?.({ ...ev, id: ev.calendarEventId })
                  }}
                >
                  <div className={styles.evHeader}>
                    <span data-time className={styles.evTime}>{fmtTime(ev.plannedStart)}</span>
                    {perm && <PermIcon type={perm} />}
                  </div>
                  <div className={styles.evTitle}>{ev.calendarEventTitle}</div>
                  {ev.client && (
                    <div className={styles.evClient} style={{ color: clColor || undefined }}>
                      {ev.client.display_name || ev.client.name}
                    </div>
                  )}

                  {/* リサイズハンドル */}
                  {ev.canEdit && (
                    <div
                      className={styles.resizeHandle}
                      data-action="true"
                      onMouseDown={e => {
                        e.stopPropagation()
                        e.preventDefault()
                        startDrag(e, ev, dayIdx, true)
                      }}
                    />
                  )}
                </div>
              )
            })
          })}

          {/* ドラッグ作成プレビュー */}
          {createPreview && (
            <div
              className={styles.createPreview}
              style={{
                top:    createPreview.top,
                height: createPreview.height,
                left:   `calc(52px + ${createPreview.dayIdx} * ((100% - 52px) / 5) + 2px)`,
                width:  `calc((100% - 52px) / 5 - 4px)`,
              }}
            />
          )}

          {loading && <div className={styles.loadingOverlay}>読み込み中...</div>}
        </div>
      </div>
    </div>
  )
}

function autoMatchTitle(title, task) {
  if (!title || !task) return false
  return title.includes(task.title) || task.title.includes(title)
}
