import { useRef, useEffect, useCallback, useState } from 'react'
import { useStore } from '@/store/useStore'
import { getClientColor, hexToRgba } from '@/lib/clientColor'
import ClientColorPicker from '@/components/shared/ClientColorPicker'
import styles from './CalendarDayView.module.css'

const HOUR_HEIGHT = 64
const START_HOUR  = 6
const END_HOUR    = 23
const SNAP_MIN    = 15
const TOTAL_HOURS = END_HOUR - START_HOUR

function timeToY(dt) {
  if (!dt) return 0
  const d = new Date(dt)
  const mins = (d.getHours() - START_HOUR) * 60 + d.getMinutes()
  return (mins / 60) * HOUR_HEIGHT
}

function fmtHour(h) {
  return `${String(h).padStart(2,'0')}:00`
}

function fmtTime(d) {
  if (!d) return ''
  const dt = new Date(d)
  return `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`
}

/** 重複イベントの列割り当て */
function assignColumns(events) {
  const sorted = [...events].sort((a, b) => new Date(a.plannedStart) - new Date(b.plannedStart))
  const cols = []

  return sorted.map(ev => {
    const start = new Date(ev.plannedStart).getTime()
    const end   = new Date(ev.plannedEnd).getTime()
    let col = cols.findIndex(endTime => endTime <= start)
    if (col === -1) col = cols.length
    cols[col] = end
    return { ...ev, _col: col }
  }).map((ev, _, arr) => {
    const overlapping = arr.filter(other => {
      const s1 = new Date(ev.plannedStart).getTime()
      const e1 = new Date(ev.plannedEnd).getTime()
      const s2 = new Date(other.plannedStart).getTime()
      const e2 = new Date(other.plannedEnd).getTime()
      return s1 < e2 && s2 < e1
    })
    const maxCol = Math.max(...overlapping.map(o => o._col))
    return { ...ev, _totalCols: maxCol + 1 }
  })
}

function PermIcon({ type }) {
  if (type === 'solo') return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
      <circle cx="8" cy="5" r="3"/>
      <path d="M2 14c0-3.314 2.686-6 6-6s6 2.686 6 6H2z"/>
    </svg>
  )
  if (type === 'multi') return (
    <svg width="13" height="11" viewBox="0 0 20 16" fill="currentColor">
      <circle cx="7" cy="5" r="3"/>
      <path d="M1 14c0-3.314 2.686-6 6-6s6 2.686 6 6H1z"/>
      <circle cx="14" cy="5" r="2.5"/>
      <path d="M11 14c.09-.98.49-1.87 1.12-2.57A5.98 5.98 0 0119 14h-8z"/>
    </svg>
  )
  if (type === 'readonly') return (
    <svg width="10" height="11" viewBox="0 0 16 16" fill="currentColor">
      <rect x="3" y="7" width="10" height="8" rx="1.5"/>
      <path d="M5 7V5a3 3 0 016 0v2" fill="none" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  )
  return null
}

export default function CalendarDayView({
  events,
  activeEventId,
  hiddenIds,
  showHidden,
  onStart,
  onEnd,
  onTimeChange,
  onHide,
  onOpenDetail,
  onCreateAt,    // (start: Date, end: Date) => void
}) {
  const clients      = useStore(s => s.clients)
  const containerRef = useRef(null)
  const gridRef      = useRef(null)
  const dragRef      = useRef(null)
  const didDragRef   = useRef(false)   // ドラッグが実際に行われたか
  const [nowY, setNowY] = useState(null)

  // カラーピッカー: イベントIDと位置で管理（複数の同一クライアント対策）
  const [colorPicker, setColorPicker] = useState(null)  // { eventId, client, top, left }

  const totalHeight = TOTAL_HOURS * HOUR_HEIGHT

  // 8:00 付近へ初期スクロール
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = Math.max(0, (8 - START_HOUR) * HOUR_HEIGHT - 16)
    }
  }, [])

  // 現在時刻ライン
  useEffect(() => {
    function updateNow() {
      const now = new Date()
      const mins = (now.getHours() - START_HOUR) * 60 + now.getMinutes()
      if (mins >= 0 && mins <= TOTAL_HOURS * 60) {
        setNowY((mins / 60) * HOUR_HEIGHT)
      } else {
        setNowY(null)
      }
    }
    updateNow()
    const timer = setInterval(updateNow, 60000)
    return () => clearInterval(timer)
  }, [])

  const visibleEvents = events.filter(ev => {
    if (ev.isAllDay) return false
    if (hiddenIds?.has(ev.id) && !showHidden) return false
    return true
  })

  const laidOut = assignColumns(visibleEvents)

  // ── Drag ──
  const onMouseMove = useCallback((e) => {
    const drag = dragRef.current
    if (!drag) return
    e.preventDefault()

    const dy    = e.clientY - drag.startY
    const dMins = Math.round((dy / HOUR_HEIGHT) * 60 / SNAP_MIN) * SNAP_MIN

    if (drag.type === 'move') {
      const dur          = drag.origEnd.getTime() - drag.origStart.getTime()
      const startMins    = (drag.origStart.getTime() - drag.baseDate.getTime()) / 60000
      const snapped      = Math.round((startMins + dMins) / SNAP_MIN) * SNAP_MIN
      const newStart     = new Date(drag.baseDate.getTime() + snapped * 60000)
      const newEnd       = new Date(newStart.getTime() + dur)
      drag.previewStart  = newStart
      drag.previewEnd    = newEnd
    } else {
      const endMins      = (drag.origEnd.getTime() - drag.baseDate.getTime()) / 60000
      const minEndMins   = (drag.origStart.getTime() - drag.baseDate.getTime()) / 60000 + SNAP_MIN
      const finalEndMins = Math.max(Math.round((endMins + dMins) / SNAP_MIN) * SNAP_MIN, minEndMins)
      drag.previewStart  = drag.origStart
      drag.previewEnd    = new Date(drag.baseDate.getTime() + finalEndMins * 60000)
    }

    if (drag.el) {
      const ps     = drag.previewStart
      const pe     = drag.previewEnd
      const top    = timeToY(ps)
      const height = Math.max(timeToY(pe) - top, HOUR_HEIGHT / 4)
      drag.el.style.top    = `${top}px`
      drag.el.style.height = `${height}px`
      const timeEl = drag.el.querySelector('[data-time]')
      if (timeEl) timeEl.textContent = `${fmtTime(ps)}–${fmtTime(pe)}`
    }
  }, [])

  const onMouseUp = useCallback(() => {
    const drag = dragRef.current
    dragRef.current = null
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup',   onMouseUp)

    if (!drag || !drag.previewStart) return
    if (
      drag.previewStart.getTime() === drag.origStart.getTime() &&
      drag.previewEnd.getTime()   === drag.origEnd.getTime()
    ) return

    // 実際に移動が発生 → clickで詳細を開かないようにフラグを立てる
    didDragRef.current = true
    onTimeChange?.(drag.eventId, drag.previewStart, drag.previewEnd)
  }, [onMouseMove, onTimeChange])

  function startDrag(e, ev, type) {
    if (!ev.canEdit) return
    e.preventDefault()

    const baseDate = new Date(ev.plannedStart)
    baseDate.setHours(0, 0, 0, 0)
    const el = document.getElementById(`cal-ev-${ev.id}`)

    dragRef.current = {
      eventId: ev.id, type,
      startY:  e.clientY,
      origStart: new Date(ev.plannedStart),
      origEnd:   new Date(ev.plannedEnd),
      baseDate,
      previewStart: null, previewEnd: null,
      el,
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup',   onMouseUp)
  }

  // グリッドの空白クリックで新規作成
  function handleGridClick(e) {
    if (!onCreateAt) return
    if (e.target.closest('[id^="cal-ev-"]')) return
    if (e.target.closest('button')) return
    if (e.target.closest('[data-resize]')) return
    if (dragRef.current) return

    const rect = gridRef.current.getBoundingClientRect()
    const y = e.clientY - rect.top
    const totalMins = (y / HOUR_HEIGHT) * 60
    const snappedMins = Math.round(totalMins / SNAP_MIN) * SNAP_MIN
    const absMins = START_HOUR * 60 + snappedMins

    const start = new Date()
    start.setHours(Math.floor(absMins / 60), absMins % 60, 0, 0)
    const end = new Date(start.getTime() + 30 * 60000)
    onCreateAt(start, end)
  }

  // クライアント名クリック → fixed 位置でピッカー表示
  function openColorPicker(e, ev, client) {
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    // 画面右端からはみ出さないよう調整
    const pickerW = 208
    let left = rect.left
    if (left + pickerW > window.innerWidth - 8) left = window.innerWidth - pickerW - 8
    setColorPicker({ eventId: ev.id, client, top: rect.bottom + 4, left })
  }

  const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => START_HOUR + i)

  return (
    <>
      <div className={styles.wrap} ref={containerRef}>
        <div className={styles.grid} style={{ height: totalHeight }} ref={gridRef} onClick={handleGridClick}>
          {/* 時間ラベル + 横線 */}
          {hours.map(h => (
            <div key={h} className={styles.hourRow} style={{ top: (h - START_HOUR) * HOUR_HEIGHT }}>
              <span className={styles.hourLabel}>{fmtHour(h)}</span>
              <div className={styles.hourLine} />
            </div>
          ))}

          {/* 現在時刻ライン */}
          {nowY !== null && (
            <div className={styles.nowLine} style={{ top: nowY }}>
              <div className={styles.nowDot} />
              <div className={styles.nowBar} />
            </div>
          )}

          {/* イベントブロック */}
          {laidOut.map(ev => {
            const top      = timeToY(ev.plannedStart)
            const height   = Math.max(timeToY(ev.plannedEnd) - top, HOUR_HEIGHT / 4)
            const isActive = ev.id === activeEventId
            const isDone   = ev.status === 'done'
            const isHiddenEv = hiddenIds?.has(ev.id)
            const perm     = ev.permissionType

            const colW    = 100 / ev._totalCols
            const colLeft = ev._col * colW

            const client   = clients.find(c => c.id === ev.task?.client_id)
            const clColor  = getClientColor(client)
            const isPaused = ev.status === 'paused'

            // Background and status class logic
            let evBg
            let statusCls
            if (isDone) {
              evBg = 'var(--color-bg-secondary)'
              statusCls = styles.eventDoneStyle
            } else if (isActive && !isPaused) {
              evBg = clColor ? hexToRgba(clColor, 0.25) : null
              statusCls = clColor ? '' : styles.eventActive
            } else {
              const clBgOther = clColor ? hexToRgba(clColor, 0.14) : null
              evBg = clBgOther || null
              statusCls = clColor ? ''
                : perm === 'readonly' ? styles.eventReadonly
                : styles.eventDefault
            }

            const statusBadgeLabel = isDone ? '完了'
              : isActive && ev.status === 'paused' ? '中断'
              : isActive ? '進行中'
              : null

            const isCompact = height < 42

            // アクションボタンの有無（padding-right 用）
            const hasActions = isActive || (!isDone) || !!onHide

            return (
              <div
                key={ev.id}
                id={`cal-ev-${ev.id}`}
                className={`${styles.event} ${statusCls} ${isHiddenEv ? styles.eventHidden : ''} ${clColor ? styles.eventColored : ''} ${isCompact ? styles.eventCompact : ''}`}
                style={{
                  top,
                  height,
                  left:  `calc(${colLeft}% + 56px)`,
                  width: `calc(${colW}% - 60px)`,
                  borderLeftColor: clColor || undefined,
                  ...(evBg ? { background: evBg } : {}),
                }}
                onMouseDown={ev.canEdit !== false ? (e) => {
                  if (e.target.closest('[data-resize]')) return
                  startDrag(e, ev, 'move')
                } : undefined}
                onClick={(e) => {
                  if (e.target.closest('[data-action]')) return
                  // ドラッグが発生したらクリックイベントを無視
                  if (didDragRef.current) { didDragRef.current = false; return }
                  onOpenDetail?.(ev)
                }}
              >
                {/* イベント内コンテンツ（アクションボタン分の右余白確保） */}
                <div className={styles.eventInner} style={hasActions ? { paddingRight: 42 } : undefined}>
                  <div className={styles.eventHeader}>
                    <span data-time className={styles.eventTime}>
                      {fmtTime(ev.plannedStart)}–{fmtTime(ev.plannedEnd)}
                    </span>
                    {perm && <PermIcon type={perm} />}
                    {isCompact && (
                      <span className={styles.eventTitleInline}>{ev.calendarEventTitle}</span>
                    )}
                    {isCompact && client && (
                      <button
                        className={styles.eventClientInline}
                        style={{ color: clColor || undefined }}
                        data-action="true"
                        onMouseDown={e => e.stopPropagation()}
                        onClick={e => openColorPicker(e, ev, client)}
                        title="色を変更"
                      >
                        {client.display_name || client.name}
                      </button>
                    )}
                    {isCompact && statusBadgeLabel && (
                      <span className={`${styles.statusBadge} ${isDone ? styles.badgeDone : isActive ? styles.badgeRun : ''}`}>
                        {statusBadgeLabel}
                      </span>
                    )}
                  </div>
                  {!isCompact && (
                    <>
                      <div className={styles.eventTitle}>{ev.calendarEventTitle}</div>
                      {client && (
                        <button
                          className={styles.eventClient}
                          style={{ color: clColor || undefined }}
                          data-action="true"
                          onMouseDown={e => e.stopPropagation()}
                          onClick={e => openColorPicker(e, ev, client)}
                          title="色を変更"
                        >
                          {client.display_name || client.name}
                        </button>
                      )}
                      {statusBadgeLabel && (
                        <span className={`${styles.statusBadge} ${isDone ? styles.badgeDone : isActive ? styles.badgeRun : ''}`}>
                          {statusBadgeLabel}
                        </span>
                      )}
                    </>
                  )}
                </div>

                {/* アクションボタン */}
                <div className={styles.eventActions}>
                  {isActive ? (
                    <button
                      className={styles.btnStop}
                      data-action="true"
                      onMouseDown={e => e.stopPropagation()}
                      onClick={e => { e.stopPropagation(); onEnd?.(ev.id) }}
                    >■</button>
                  ) : !isDone ? (
                    <button
                      className={styles.btnPlay}
                      data-action="true"
                      onMouseDown={e => e.stopPropagation()}
                      onClick={e => { e.stopPropagation(); onStart?.(ev.id) }}
                    >▶</button>
                  ) : null}
                  {onHide && (
                    <button
                      className={styles.btnHideEv}
                      data-action="true"
                      onMouseDown={e => e.stopPropagation()}
                      onClick={e => { e.stopPropagation(); onHide(ev.id) }}
                      title={isHiddenEv ? '表示する' : '非表示'}
                    >–</button>
                  )}
                </div>

                {/* リサイズハンドル */}
                {ev.canEdit !== false && (
                  <div
                    className={styles.resizeHandle}
                    data-resize="true"
                    onMouseDown={e => { e.stopPropagation(); startDrag(e, ev, 'resize') }}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* カラーピッカー: fixed 位置で枠外にはみ出さず表示（クリックバグ・複数イベントバグを同時解決） */}
      {colorPicker && (
        <ClientColorPicker
          client={colorPicker.client}
          onClose={() => setColorPicker(null)}
          style={{ position: 'fixed', top: colorPicker.top, left: colorPicker.left }}
        />
      )}
    </>
  )
}
