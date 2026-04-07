import { useState, useEffect, useRef } from 'react'
import { useStore } from '@/store/useStore'
import { fetchEventsRange } from '@/lib/googleCalendar'
import { getClientColor, hexToRgba } from '@/lib/clientColor'
import styles from './WeeklyView.module.css'

const HOUR_HEIGHT = 56
const START_HOUR  = 7
const END_HOUR    = 22
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

export default function WeeklyView({ onOpenDetail }) {
  const { session, appTasks, todayEvents, clients } = useStore()
  const providerToken = useStore(s => s.providerToken)
  const devDate = useStore(s => s.devDate)
  const [weekOffset, setWeekOffset] = useState(0)
  const [weekEvents, setWeekEvents]  = useState([])
  const [loading, setLoading]        = useState(false)
  const [fetchError, setFetchError]  = useState(null)
  const scrollRef = useRef(null)

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

  function loadWeek() {
    if (!token) {
      setFetchError('Googleトークンがありません。再ログインしてください。')
      return
    }
    setLoading(true)
    setFetchError(null)
    fetchEventsRange(token, weekDates[0], weekDates[4])
      .then(evs => setWeekEvents(evs.filter(ev => !ev.isAllDay)))
      .catch(err => {
        console.error(err)
        setFetchError('読み込みに失敗しました。再度お試しください。')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadWeek()
  }, [weekOffset, token])

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
          {isSameDay(weekDates[0], today) || weekDates.some(d => isSameDay(d, today)) ? (() => {
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

            return enriched.map((ev, ei) => {
              const top    = timeToY(ev.plannedStart)
              const bottom = timeToY(ev.plannedEnd)
              const height = Math.max(bottom - top, HOUR_HEIGHT / 4)
              const clColor = getClientColor(ev.client)
              const clBg    = clColor ? hexToRgba(clColor, 0.15) : null
              const isDone  = ev.status === 'done'

              return (
                <div
                  key={ev.calendarEventId}
                  className={`${styles.event} ${isDone ? styles.eventDone : ''}`}
                  style={{
                    top,
                    height,
                    left:    `calc(52px + ${dayIdx} * ((100% - 52px) / 5) + 2px)`,
                    width:   `calc((100% - 52px) / 5 - 4px)`,
                    borderLeftColor: clColor || undefined,
                    background: isDone ? 'var(--color-bg-secondary)' : (clBg || undefined),
                  }}
                  onClick={() => onOpenDetail?.({ ...ev, id: ev.calendarEventId })}
                >
                  <div className={styles.evTime}>{fmtTime(ev.plannedStart)}</div>
                  <div className={styles.evTitle}>{ev.calendarEventTitle}</div>
                  {ev.client && (
                    <div className={styles.evClient} style={{ color: clColor || undefined }}>
                      {ev.client.display_name || ev.client.name}
                    </div>
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
