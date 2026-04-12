import { useState } from 'react'
import { useStore } from '@/store/useStore'
import { updateCalendarEvent, deleteCalendarEvent } from '@/lib/googleCalendar'
import styles from './EventEditModal.module.css'

function fmtTimeInput(d) {
  if (!d) return ''
  const dt = new Date(d)
  return `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`
}

function applyTimeToDate(base, hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date(base)
  d.setHours(h, m, 0, 0)
  return d
}

/**
 * Google Calendar 予定を編集・削除するモーダル
 *
 * @param {object}   event      - todayEvents / weekEvents の1件
 * @param {Function} onUpdated  - (patch: { title, plannedStart, plannedEnd }) => void
 * @param {Function} onDeleted  - () => void
 * @param {Function} onClose    - () => void
 */
export default function EventEditModal({ event, onUpdated, onDeleted, onClose }) {
  const { providerToken, session } = useStore()
  const token = providerToken || session?.provider_token || null

  const [title,    setTitle]    = useState(event.calendarEventTitle)
  const [startStr, setStartStr] = useState(fmtTimeInput(event.plannedStart))
  const [endStr,   setEndStr]   = useState(fmtTimeInput(event.plannedEnd))
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState(false)

  const isReadonly = event.permissionType === 'readonly'
  const isMulti    = event.permissionType === 'multi'
  const busy       = saving || deleting

  async function handleSave() {
    if (isReadonly) return
    const newStart = applyTimeToDate(event.plannedStart, startStr)
    const newEnd   = applyTimeToDate(event.plannedStart, endStr)
    if (newEnd <= newStart) { alert('終了時間は開始時間より後にしてください'); return }

    if (isMulti) {
      const names = event.otherAttendees?.map(a => a.displayName).join('、') || ''
      if (!window.confirm(`${names} さんも参加しています。本当に変更しますか？`)) return
    }

    setSaving(true)
    try {
      await updateCalendarEvent(token, event.calendarEventId, {
        summary: title.trim() || event.calendarEventTitle,
        start: { dateTime: newStart.toISOString(), timeZone: 'Asia/Tokyo' },
        end:   { dateTime: newEnd.toISOString(),   timeZone: 'Asia/Tokyo' },
      })
      onUpdated({ title: title.trim() || event.calendarEventTitle, plannedStart: newStart, plannedEnd: newEnd })
      onClose()
    } catch (err) {
      console.error(err)
      alert('更新に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!event.canEdit) return
    if (!window.confirm(`「${event.calendarEventTitle}」を削除しますか？この操作は取り消せません。`)) return
    if (isMulti) {
      const names = event.otherAttendees?.map(a => a.displayName).join('、') || ''
      if (!window.confirm(`${names} さんも参加しています。本当に削除しますか？`)) return
    }

    setDeleting(true)
    try {
      await deleteCalendarEvent(token, event.calendarEventId)
      onDeleted()
      onClose()
    } catch (err) {
      console.error(err)
      alert('削除に失敗しました')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className={styles.backdrop} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.box}>
        {/* ヘッダー */}
        <div className={styles.header}>
          <div className={styles.title}>予定を編集</div>
          <button className={styles.btnClose} onClick={onClose} disabled={busy}>×</button>
        </div>

        {/* 権限バナー */}
        {isReadonly && (
          <div className={styles.bannerReadonly}>
            🔒 この予定は読み取り専用のため編集できません
          </div>
        )}
        {isMulti && !isReadonly && (
          <div className={styles.bannerMulti}>
            👥 複数の参加者がいる予定です。変更は参加者全員に影響します
          </div>
        )}

        {/* タイトル */}
        <label className={styles.fieldLabel}>タイトル</label>
        <input
          className={styles.titleInput}
          value={title}
          onChange={e => setTitle(e.target.value)}
          disabled={isReadonly}
          placeholder="予定のタイトル"
        />

        {/* 時刻 */}
        <label className={styles.fieldLabel}>時刻</label>
        <div className={styles.timeRow}>
          <input
            type="time"
            className={styles.timeInput}
            value={startStr}
            onChange={e => setStartStr(e.target.value)}
            disabled={isReadonly}
          />
          <span className={styles.timeSep}>～</span>
          <input
            type="time"
            className={styles.timeInput}
            value={endStr}
            onChange={e => setEndStr(e.target.value)}
            disabled={isReadonly}
          />
        </div>

        {/* フッター */}
        <div className={styles.footer}>
          {event.canEdit && (
            <button
              className={styles.btnDelete}
              onClick={handleDelete}
              disabled={busy}
            >
              {deleting ? '削除中...' : '削除'}
            </button>
          )}
          <div className={styles.footerRight}>
            <button className={styles.btnCancel} onClick={onClose} disabled={busy}>キャンセル</button>
            {!isReadonly && (
              <button className={styles.btnSave} onClick={handleSave} disabled={busy}>
                {saving ? '保存中...' : '保存'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
