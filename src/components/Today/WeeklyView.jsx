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
  const day = d.getDay() // 0=Sun
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

function fmtDate(d) {
  return `${d.getMonth()+1}/${d.getDate()}`
}

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

export default function WeeklyView({ onOpenDetail }) {
  const { session, appTasks, todayEvents, clients } = useStore()
  const providerToken = useStore(s => s.providerToken)
  const devDate = useStore(s => s.devDate)
  const [weekOffset, setWeekOffset] = useState(0)
  const [weekEvents, setWeekEvents]  = useState([])
  const [loading, setLoading]        = useState(false)
  const [fetchError, setFetchError]  = useState(null)
  const scrollRef = useRef(null)
  const dragRef   = useRef(null)
  const didDragRef = useRef(false)

  // 最新値をrefで保持（useCallbackの依存配列を安定させるため）
  const tokenRef = useRef(null)
  tokenRef.current = providerToken || session?.provider_token

  const token     = providerToken || session?.provider_token
  const weekDates = getWeekDates(devDate ?? new Date(), weekOffset)
  const today     = devDate ?? new Date()

  // 初回レンダリング時に現在時刻が見えるようにスクロール
  useEffect(() => {
    if (scrollRef.current && !loading) {
      const nowY = ((new Date().getHours() - START_HOUR - 1) / (END_HOUR - START_HOUR)) * scrollRef.current.scrollHeight
      scrollRef.current.scrollTop = Math.max(0, nowY)
    }
  }, [loading])

  const loadWeekRef = useRef(null)

  function loadWeek() {
    if (!tokenRef.current) {
      setFetchError('Googleトークンがありません。再ログインしてください。')
      return
    }
    setLoading(true)
    setFetchError(null)
    fetchEventsRange(tokenRef.current, weekDates[0], weekDates[4])
      .then(evs => setWeekEvents(evs.filter(ev => !ev.isAllDay)))
      .catch(err => {
        console.error(err)
        setFetchError('読み込みに失敗しました。再度お試しください。')
      })
      .finally(() => setLoading(false))
  }
  loadWeekRef.current = loadWeek

  useEffect(() => {
    loadWeek()
  }, [weekOffset, token]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── ドラッグ ──
  const onMouseMove = useCallback((e) => {
    const drag = dragRef.current
    if (!drag) return
    e.preventDefault()

    const dy    = e.clientY - drag.startY
    const dMins = Math.round((dy / HOUR_HEIGHT) * 60 / SNAP_MIN) * SNAP_MIN

    const dur       = drag.origEnd.getTime() - drag.origStart.getTime()
    const startMins = (drag.origStart.getTime() - drag.baseDate.getTime()) / 60000
    const snapped   = Math.round((startMins + dMins) / SNAP_MIN) * SNAP_MIN
    const newStart  = new Date(drag.baseDate.getTime() + snapped * 60000)
    const newEnd    = new Date(newStart.getTime() + dur)
    drag.previewStart = newStart
    drag.previewEnd   = newEnd

    if (drag.el) {
      const top    = timeToY(newStart)
      const height = Math.max(timeToY(newEnd) - top, HOUR_HEIGHT / 4)
      drag.el.style.top    = `${top}px`
      drag.el.style.height = `${height}px`
      const timeEl = drag.el.querySelector('[data-time]')
      if (timeEl) timeEl.textContent = `${fmtTime(newStart)}–${fmtTime(newEnd)}`
    }
  }, [])

  const onMouseUp = useCallback(() => {
    const drag = dragRef.current
    dragRef.current = null
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup',   onMouseUp)

    if (!drag?.previewStart) return
    if (
      drag.previewStart.getTime() === drag.origStart.getTime() &&
      drag.previewEnd.getTime()   === drag.origEnd.getTime()
    ) return

    didDragRef.current = true

    // 楽観的更新
    setWeekEvents(prev => prev.map(ev =>
      ev.calendarEventId === drag.eventId
        ? { ...ev, plannedStart: drag.previewStart, plannedEnd: drag.previewEnd }
        : ev
    ))

    // Google Calendar API で更新
    if (!tokenRef.current) return
    updateCalendarEvent(tokenRef.current, drag.eventId, {
      start: { dateTime: drag.previewStart.toISOString(), timeZone: 'Asia/Tokyo' },
      end:   { dateTime: drag.previewEnd.toISOString(),   timeZone: 'Asia/Tokyo' },
    }).catch(err => {
      console.error('時間変更失敗:', err)
      loadWeekRef.current?.()
    })
  }, [onMouseMove])

  function startDrag(e, ev, dayIdx) {
    if (!ev.canEdit) return
    e.preventDefault()

    if (ev.permissionType === 'multi' && ev.otherAttendees?.length > 0) {
      const names = ev.otherAttendees.map(a => a.displayName).join('、')
      if (!window.confirm(`${names} さんも参加しています。本当に変更しますか？`)) return
    }

    const baseDate = new Date(weekDates[dayIdx])
    baseDate.setHours(0, 0, 0, 0)
    const el = document.getElementById(`week-ev-${ev.calendarEventId}`)

    dragRef.current = {
      eventId:    ev.calendarEventId,
      startY:     e.clientY,
      origStart:  new Date(ev.plannedStart),
      origEnd:    new Date(ev.plannedEnd),
      baseDate,
      previewStart: null,
      previewEnd:   null,
      el,
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup',   onMouseUp)
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
      {fetchError && (
        <div className={styles.fetchError}>{fetchError}</div>
      )}

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
        <div className={styles.grid} style={{ height: totalH }}>
          {/* 時間軸 */}
          <div className={styles.timeAxis}>
            {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => (
              <div
                key={i}
                className={styles.hourLabel}
                style={{ top: i * HOUR_HEIGHT }}
              >
                {String(START_HOUR + i).padStart(2,'0')}:00
              </div>
            ))}
          </div>

          {/* 横線 */}
          {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => (
            <div
              key={i}
              className={styles.hourLine}
              style={{ top: i * HOUR_HEIGHT }}
            />
          ))}

          {/* 今日ハイライト列 */}
          {weekDates.map((d, i) => isSameDay(d, today) ? (
            <div key={i} className={styles.todayCol} style={{ left: `calc(52px + ${i} * ((100% - 52px) / 5))`, width: `calc((100% - 52px) / 5)` }} />
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
                  top: nowY,
                  left: `calc(52px + ${todayIdx} * ((100% - 52px) / 5))`,
                  width: `calc((100% - 52px) / 5)`,
                }}
              />
            )
          })() : null}

          {/* 各日のイベント */}
          {weekDates.map((d, dayIdx) => {
            const dayEvs = weekEvents.filter(ev => ev.plannedStart && isSameDay(new Date(ev.plannedStart), d))
            // 当日のイベントにはtodayEventsのstatus情報を合成
            const enriched = dayEvs.map(ev => {
              const te = todayEvents.find(t => t.calendarEventId === ev.calendarEventId)
              const task = te?.task ?? appTasks.find(t => autoMatchTitle(ev.calendarEventTitle, t))
              const client = clients.find(c => c.id === task?.client_id)
              return { ...ev, status: te?.status ?? 'pending', task, client }
            })

            return enriched.map((ev) => {
              const top    = timeToY(ev.plannedStart)
              const bottom = timeToY(ev.plannedEnd)
              const height = Math.max(bottom - top, HOUR_HEIGHT / 4)
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
                    left:    `calc(52px + ${dayIdx} * ((100% - 52px) / 5) + 2px)`,
                    width:   `calc((100% - 52px) / 5 - 4px)`,
                    borderLeftColor: clColor || undefined,
                    background: isDone ? 'var(--color-bg-secondary)' : (clBg || undefined),
                    cursor: ev.canEdit ? 'grab' : 'pointer',
                  }}
                  onMouseDown={ev.canEdit ? (e) => {
                    if (e.target.closest('[data-action]')) return
                    startDrag(e, ev, dayIdx)
                  } : undefined}
                  onClick={(e) => {
                    if (e.target.closest('[data-action]')) return
                    if (didDragRef.current) { didDragRef.current = false; return }
                    onOpenDetail?.({ ...ev, id: ev.calendarEventId })
                  }}
                >
                  <div className={styles.evHeader}>
                    <span data-time className={styles.evTime}>
                      {fmtTime(ev.plannedStart)}
                    </span>
                    {perm && <PermIcon type={perm} />}
                  </div>
                  <div className={styles.evTitle}>{ev.calendarEventTitle}</div>
                  {ev.client && (
                    <div className={styles.evClient} style={{ color: clColor || undefined }}>
                      {ev.client.display_name || ev.client.name}
                    </div>
                  )}

                  {/* リサイズハンドル（編集可能なイベントのみ） */}
                  {ev.canEdit && (
                    <div
                      className={styles.resizeHandle}
                      data-action="true"
                      onMouseDown={(e) => {
                        e.stopPropagation()
                        if (!ev.canEdit) return
                        e.preventDefault()

                        const baseDate = new Date(weekDates[dayIdx])
                        baseDate.setHours(0, 0, 0, 0)
                        const el = document.getElementById(`week-ev-${ev.calendarEventId}`)

                        dragRef.current = {
                          eventId:    ev.calendarEventId,
                          startY:     e.clientY,
                          origStart:  new Date(ev.plannedStart),
                          origEnd:    new Date(ev.plannedEnd),
                          baseDate,
                          previewStart: null,
                          previewEnd:   null,
                          el,
                          isResize: true,
                        }

                        const resizeMove = (re) => {
                          const drag = dragRef.current
                          if (!drag) return
                          re.preventDefault()
                          const dy = re.clientY - drag.startY
                          const dMins = Math.round((dy / HOUR_HEIGHT) * 60 / SNAP_MIN) * SNAP_MIN
                          const endMins = (drag.origEnd.getTime() - drag.baseDate.getTime()) / 60000
                          const minEnd  = (drag.origStart.getTime() - drag.baseDate.getTime()) / 60000 + SNAP_MIN
                          const newEndMins = Math.max(Math.round((endMins + dMins) / SNAP_MIN) * SNAP_MIN, minEnd)
                          drag.previewStart = drag.origStart
                          drag.previewEnd   = new Date(drag.baseDate.getTime() + newEndMins * 60000)
                          if (drag.el) {
                            const t = timeToY(drag.previewStart)
                            const h = Math.max(timeToY(drag.previewEnd) - t, HOUR_HEIGHT / 4)
                            drag.el.style.top    = `${t}px`
                            drag.el.style.height = `${h}px`
                            const timeEl = drag.el.querySelector('[data-time]')
                            if (timeEl) timeEl.textContent = `${fmtTime(drag.previewStart)}–${fmtTime(drag.previewEnd)}`
                          }
                        }
                        const resizeUp = () => {
                          const drag = dragRef.current
                          dragRef.current = null
                          window.removeEventListener('mousemove', resizeMove)
                          window.removeEventListener('mouseup', resizeUp)
                          if (!drag?.previewStart) return
                          if (drag.previewEnd.getTime() === drag.origEnd.getTime()) return
                          didDragRef.current = true
                          setWeekEvents(prev => prev.map(ev2 =>
                            ev2.calendarEventId === drag.eventId
                              ? { ...ev2, plannedStart: drag.previewStart, plannedEnd: drag.previewEnd }
                              : ev2
                          ))
                          if (!tokenRef.current) return
                          updateCalendarEvent(tokenRef.current, drag.eventId, {
                            start: { dateTime: drag.previewStart.toISOString(), timeZone: 'Asia/Tokyo' },
                            end:   { dateTime: drag.previewEnd.toISOString(),   timeZone: 'Asia/Tokyo' },
                          }).catch(err => {
                            console.error('リサイズ失敗:', err)
                            loadWeekRef.current?.()
                          })
                        }
                        window.addEventListener('mousemove', resizeMove)
                        window.addEventListener('mouseup', resizeUp)
                      }}
                    />
                  )}
                </div>
              )
            })
          })}

          {loading && <div className={styles.loadingOverlay}>読み込み中...</div>}
        </div>
      </div>
    </div>
  )
}

// シンプルなタイトルマッチ（autoLinkの簡易版）
function autoMatchTitle(title, task) {
  if (!title || !task) return false
  return title.includes(task.title) || task.title.includes(title)
}
