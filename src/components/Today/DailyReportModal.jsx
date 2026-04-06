import { useMemo, useRef } from 'react'
import { useStore } from '@/store/useStore'
import styles from './DailyReportModal.module.css'

function calcActualMs(ev) {
  if (!ev.actualStart) return null
  const rawMs = ev.actualEnd
    ? (ev.actualEnd - ev.actualStart)
    : (new Date() - new Date(ev.actualStart))
  const pauseMs = (ev.pauseLog || []).reduce((sum, p) => {
    if (p.s && p.e) return sum + (new Date(p.e) - new Date(p.s))
    return sum
  }, 0)
  return Math.max(0, (ev.overrideElapsedMs ?? (rawMs - pauseMs)))
}

/** ミリ秒 → 小数時間（例: 90min → "1.5h"、180min → "3.0h"、75min → "1.25h"） */
function fmtH(ms) {
  if (!ms || ms <= 0) return '0h'
  const h = Math.round(ms / 60000) / 60
  const s = h.toFixed(2).replace(/0+$/, '').replace(/\.$/, '.0')
  return s + 'h'
}

/**
 * 今日の報告書モーダル
 * @param {object[]} events   - todayEvents
 * @param {string}   dateStr  - 表示日付（YYYY-MM-DD）
 * @param {Function} onClose
 */
export default function DailyReportModal({ events, dateStr, onClose }) {
  const { clients } = useStore()
  const textRef = useRef(null)

  const reportText = useMemo(() => {
    const nonAllDay = events.filter(ev => !ev.isAllDay)

    // クライアント別にグループ化（出現順を維持）
    const groupOrder = []
    const groups = {}
    nonAllDay.forEach(ev => {
      const cl  = clients.find(c => c.id === ev.task?.client_id)
      const key = cl ? String(cl.id) : 'none'
      if (!groups[key]) {
        groups[key] = { label: cl ? (cl.display_name || cl.name) : '未分類', evs: [] }
        groupOrder.push(key)
      }
      groups[key].evs.push(ev)
    })

    const lines = []
    groupOrder.forEach(key => {
      const { label, evs } = groups[key]
      const totalMs = evs.reduce((sum, ev) => {
        const ms = calcActualMs(ev)
          ?? (ev.plannedEnd && ev.plannedStart
            ? new Date(ev.plannedEnd) - new Date(ev.plannedStart) : 0)
        return sum + ms
      }, 0)
      lines.push(`■${label} - ${fmtH(totalMs)}`)
      evs.forEach(ev => {
        const ms = calcActualMs(ev)
          ?? (ev.plannedEnd && ev.plannedStart
            ? new Date(ev.plannedEnd) - new Date(ev.plannedStart) : 0)
        const name = ev.task?.title || ev.calendarEventTitle
        lines.push(`・${name} - ${fmtH(ms)}`)
      })
      lines.push('')
    })

    if (lines.length === 0) return '（予定なし）'
    return lines.join('\n').trimEnd()
  }, [events, clients])

  function handleCopy() {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(reportText)
    } else {
      textRef.current?.select()
      document.execCommand('copy')
    }
  }

  return (
    <div className={styles.backdrop} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.box}>
        <div className={styles.header}>
          <span className={styles.title}>今日の報告書</span>
          <div className={styles.headerRight}>
            <button className={styles.btnCopy} onClick={handleCopy}>コピー</button>
            <button className={styles.btnClose} onClick={onClose}>×</button>
          </div>
        </div>
        <textarea
          ref={textRef}
          className={styles.textarea}
          value={reportText}
          readOnly
        />
      </div>
    </div>
  )
}
