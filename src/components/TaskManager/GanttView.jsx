import { useState, useMemo } from 'react'
import dayjs from 'dayjs'
import { getClientColor } from '@/lib/clientColor'
import styles from './GanttView.module.css'

const DAY_W  = 28   // px per day column
const LEFT_W = 300  // px for the fixed left panel

const STATUS_LABELS = ['未着手', '進行中', '完了', '保留中']
const STATUS_STYLES = ['statusPending', 'statusRunning', 'statusDone', 'statusOnHold']

export default function GanttView({ tasks, clients, onEditTask }) {
  const today = dayjs().format('YYYY-MM-DD')
  const [startDate, setStartDate] = useState(today)

  const startDay  = useMemo(() => dayjs(startDate), [startDate])
  const totalDays = useMemo(() => startDay.add(6, 'month').diff(startDay, 'day'), [startDay])

  // All day objects in the display range
  const days = useMemo(() => {
    const arr = []
    for (let i = 0; i < totalDays; i++) arr.push(startDay.add(i, 'day'))
    return arr
  }, [startDay, totalDays])

  // Contiguous month spans for the header
  const monthSpans = useMemo(() => {
    const spans = []
    let cur = null
    days.forEach((d, i) => {
      const key = d.format('YYYY-MM')
      if (!cur || cur.key !== key) {
        cur = { key, label: d.format('YYYY年M月'), count: 1 }
        spans.push(cur)
      } else {
        cur.count++
      }
    })
    return spans
  }, [days])

  // How many days today is from the start (may be negative or out of range)
  const todayOffset = useMemo(() => dayjs(today).diff(startDay, 'day'), [today, startDay])

  // Group tasks by client; tasks with no client go last
  const grouped = useMemo(() => {
    const map = new Map()
    tasks.forEach(t => {
      const key = t.client_id != null ? t.client_id : '__none__'
      if (!map.has(key)) {
        const cl = t.client_id != null ? clients.find(c => c.id === t.client_id) || null : null
        map.set(key, { key, client: cl, tasks: [] })
      }
      map.get(key).tasks.push(t)
    })
    return [...map.values()].sort((a, b) => {
      if (a.key === '__none__') return 1
      if (b.key === '__none__') return -1
      return 0
    })
  }, [tasks, clients])

  // Compute left offset + width for a task bar (returns null if out of range or no dates)
  function barProps(task) {
    const s = task.start_date ? dayjs(task.start_date).diff(startDay, 'day') : null
    const e = task.due_date   ? dayjs(task.due_date).diff(startDay, 'day')   : null
    if (s === null && e === null) return null

    let left, width
    if (s !== null && e !== null) {
      const cs = Math.max(0, s)
      const ce = Math.min(totalDays - 1, e)
      if (cs > ce) return null
      left  = cs * DAY_W
      width = (ce - cs + 1) * DAY_W
    } else if (s !== null) {
      if (s < 0 || s >= totalDays) return null
      left = s * DAY_W; width = DAY_W
    } else {
      if (e < 0 || e >= totalDays) return null
      left = e * DAY_W; width = DAY_W
    }
    return { left, width }
  }

  function goToday()      { setStartDate(today) }
  function shiftWeek(dir) { setStartDate(dayjs(startDate).add(dir * 7, 'day').format('YYYY-MM-DD')) }

  const innerWidth = LEFT_W + totalDays * DAY_W
  const todayVisible = todayOffset >= 0 && todayOffset < totalDays

  return (
    <div className={styles.gantt}>

      {/* ── Controls ── */}
      <div className={styles.controls}>
        <span className={styles.startLabel}>開始日</span>
        <input
          type="date"
          className={styles.dateInput}
          value={startDate}
          onChange={e => setStartDate(e.target.value)}
        />
        <button className={styles.btnToday} onClick={goToday}>今日</button>
        <button className={styles.btnNav} onClick={() => shiftWeek(-1)} title="1週間前">＜</button>
        <button className={styles.btnNav} onClick={() => shiftWeek(1)}  title="1週間後">＞</button>
      </div>

      {/* ── Gantt grid ── */}
      <div className={styles.wrapper}>
        <div className={styles.inner} style={{ minWidth: innerWidth }}>

          {/* Sticky date header */}
          <div className={styles.dateHeader}>
            <div className={styles.headerLeft} style={{ width: LEFT_W }}>
              <span>件名</span>
              <span className={styles.headerStatusLabel}>状態</span>
            </div>
            <div className={styles.dateColumns} style={{ width: totalDays * DAY_W }}>
              {/* Month row */}
              <div className={styles.monthRow}>
                {monthSpans.map(m => (
                  <div key={m.key} className={styles.monthCell} style={{ width: m.count * DAY_W }}>
                    {m.label}
                  </div>
                ))}
              </div>
              {/* Day number row */}
              <div className={styles.dayRow}>
                {days.map((d, i) => {
                  const isToday   = d.format('YYYY-MM-DD') === today
                  const dow       = d.day()
                  const isWeekend = dow === 0 || dow === 6
                  return (
                    <div
                      key={i}
                      className={[
                        styles.dayCell,
                        isToday   ? styles.dayCellToday   : '',
                        isWeekend ? styles.dayCellWeekend : '',
                      ].join(' ')}
                      style={{ width: DAY_W }}
                    >
                      {d.date()}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* ── Body ── */}
          {grouped.length === 0 ? (
            <div className={styles.empty}>表示できるタスクがありません</div>
          ) : grouped.map(group => {
            const color     = group.client ? getClientColor(group.client) : '#9ca3af'
            const groupName = group.client
              ? (group.client.display_name || group.client.name)
              : 'クライアント未設定'

            // Tasks with at least one date come first; no-date tasks are appended
            const withDates = group.tasks.filter(t => t.start_date || t.due_date)
            const noDates   = group.tasks.filter(t => !t.start_date && !t.due_date)
            const orderedTasks = [...withDates, ...noDates]

            return (
              <div key={group.key}>

                {/* Group header row */}
                <div className={styles.groupRow}>
                  <div className={styles.groupLeft} style={{ width: LEFT_W }}>
                    <span className={styles.groupDot} style={{ background: color }} />
                    <span className={styles.groupName}>{groupName}</span>
                    <span className={styles.groupCount}>{group.tasks.length}</span>
                  </div>
                  <div
                    className={styles.groupRight}
                    style={{ width: totalDays * DAY_W, background: `${color}12` }}
                  />
                </div>

                {/* Task rows */}
                {orderedTasks.map(task => {
                  const bp      = barProps(task)
                  const hasDate = !!(task.start_date || task.due_date)

                  return (
                    <div key={task.id} className={styles.taskRow}>

                      {/* Left: title + status */}
                      <div className={styles.taskLeft} style={{ width: LEFT_W }}>
                        <span className={styles.taskTitle} title={task.title}>
                          {task.title}
                        </span>
                        <span className={`${styles.taskStatus} ${styles[STATUS_STYLES[task.status]]}`}>
                          {STATUS_LABELS[task.status]}
                        </span>
                      </div>

                      {/* Right: bars */}
                      <div
                        className={[styles.taskRight, !hasDate ? styles.taskRightNoDate : ''].join(' ')}
                        style={{ width: totalDays * DAY_W }}
                      >
                        {/* Today line */}
                        {todayVisible && (
                          <div
                            className={styles.todayLine}
                            style={{ left: todayOffset * DAY_W + DAY_W / 2 }}
                          />
                        )}
                        {/* Task bar */}
                        {bp && (
                          <div
                            className={styles.bar}
                            style={{ left: bp.left, width: bp.width, background: color }}
                            onClick={() => onEditTask(task)}
                            title={task.title}
                          >
                            <span className={styles.barLabel}>{task.title}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}

        </div>
      </div>
    </div>
  )
}
