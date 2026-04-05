import { useMemo, useRef } from 'react'
import { useStore } from '@/store/useStore'
import styles from './DailyReportModal.module.css'

function fmtTime(d) {
  if (!d) return '--:--'
  const dt = new Date(d)
  return `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`
}

function fmtDuration(ms) {
  if (!ms || ms <= 0) return '–'
  const totalMin = Math.round(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h === 0) return `${m}分`
  if (m === 0) return `${h}時間`
  return `${h}時間${m}分`
}

function calcActualMs(ev) {
  if (!ev.actualStart) return null
  const rawMs = ev.actualEnd
    ? (ev.actualEnd - ev.actualStart)
    : (new Date() - new Date(ev.actualStart))
  // ポーズログ分を引く
  const pauseMs = (ev.pauseLog || []).reduce((sum, p) => {
    if (p.s && p.e) return sum + (new Date(p.e) - new Date(p.s))
    return sum
  }, 0)
  return Math.max(0, (ev.overrideElapsedMs ?? (rawMs - pauseMs)))
}

/**
 * 今日の報告書モーダル
 * @param {object[]} events   - todayEvents
 * @param {string}   dateStr  - 表示日付（YYYY-MM-DD）
 * @param {Function} onClose
 */
export default function DailyReportModal({ events, dateStr, onClose }) {
  const { projects, backlogToken } = useStore()
  const textRef = useRef(null)

  const reportText = useMemo(() => {
    const [y, m, d] = dateStr.split('-')
    const lines = [`■ 今日の報告書（${y}年${parseInt(m)}月${parseInt(d)}日）`, '']
    lines.push('【スケジュール】')

    const nonAllDay = events.filter(ev => !ev.isAllDay)
    if (nonAllDay.length === 0) {
      lines.push('（予定なし）')
    } else {
      nonAllDay.forEach(ev => {
        const startStr   = fmtTime(ev.plannedStart)
        const endStr     = fmtTime(ev.plannedEnd)
        const plannedMs  = ev.plannedEnd && ev.plannedStart
          ? (new Date(ev.plannedEnd) - new Date(ev.plannedStart)) : null
        const actualMs   = calcActualMs(ev)

        lines.push(`・${startStr}–${endStr}　${ev.calendarEventTitle}`)

        if (ev.task) {
          const pj = projects.find(p => p.id === ev.task.project_id)
          if (pj) lines.push(`  案件: ${pj.name}`)
          lines.push(`  タスク: ${ev.task.title}`)
        }

        lines.push(`  実工数: ${actualMs != null ? fmtDuration(actualMs) : '未計測'}`)
        lines.push(`  予定工数: ${plannedMs != null ? fmtDuration(plannedMs) : '–'}`)

        const backlogUrl = (ev.task?.backlog_issue_key && backlogToken?.space_key)
          ? `https://${backlogToken.space_key}.backlog.com/view/${ev.task.backlog_issue_key}`
          : null
        if (backlogUrl) lines.push(`  BacklogURL: ${backlogUrl}`)

        lines.push('')
      })
    }

    return lines.join('\n')
  }, [events, dateStr, projects, backlogToken])

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
