import { useStore } from '@/store/useStore'
import BacklogBadge from '@/components/Backlog/BacklogBadge'
import styles from './EventDetailPopup.module.css'

const STATUS_LABELS = { pending: '未開始', running: '進行中', done: '完了' }
const STATUS_CLS    = { pending: styles.statusPending, running: styles.statusRunning, done: styles.statusDone }

// タスクステータス（app_tasks.status）の表示
const TASK_STATUS_LABELS = ['未着手', '進行中', '完了', '保留中']
const TASK_STATUS_COLORS = [null, 'var(--color-amber-text)', 'var(--color-green-text)', '#6D28D9']

const PERM_LABELS = { solo: '自分のみ', multi: '複数参加者', readonly: '編集不可（読み取り専用）' }

function fmtTime(d) {
  if (!d) return '--:--'
  const dt = new Date(d)
  return `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`
}

/**
 * GCalイベントの詳細ポップアップ（カレンダービュー・一覧ビュー共通）
 *
 * @param {object}   event       - todayEvents の1件
 * @param {Function} onClose     - () => void
 * @param {Function} onEdit      - (task) => void  ※タスクが紐付いている場合のみ
 * @param {Function} onOpenLink  - () => void  ※タスク紐付けモーダルを開く
 */
export default function EventDetailPopup({ event, onClose, onEdit, onOpenLink }) {
  const { clients, backlogToken } = useStore()
  const client = clients.find(c => c.id === event.task?.client_id)
  const clColor = client?.color || null

  const backlogUrl = (event.task?.backlog_issue_key && backlogToken?.space_key)
    ? `https://${backlogToken.space_key}.backlog.com/view/${event.task.backlog_issue_key}`
    : null

  return (
    <div className={styles.backdrop} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.box}>
        {/* ヘッダー */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={`${styles.statusBadge} ${STATUS_CLS[event.status] || styles.statusPending}`}>
              {STATUS_LABELS[event.status] || '未開始'}
            </span>
            {event.permissionType && (
              <span className={styles.permBadge}>{PERM_LABELS[event.permissionType]}</span>
            )}
          </div>
          <button className={styles.btnClose} onClick={onClose}>×</button>
        </div>

        {/* タイトル */}
        <div className={styles.title}>{event.calendarEventTitle}</div>

        {/* 時間 */}
        <div className={styles.time}>
          {fmtTime(event.plannedStart)} – {fmtTime(event.plannedEnd)}
        </div>

        {/* 参加者（multi/readonly） */}
        {event.otherAttendees?.length > 0 && (
          <div className={styles.attendees}>
            参加者: {event.otherAttendees.map(a => a.displayName).join('、')}
          </div>
        )}

        <div className={styles.divider} />

        {/* タスク情報 */}
        {event.task ? (
          <div className={styles.taskSection}>
            <div className={styles.sectionLabel}>紐付きタスク</div>

            <div className={styles.taskRow}>
              {event.task.backlog_issue_key && <BacklogBadge size={14} />}
              <span className={styles.taskName}>{event.task.title}</span>
            </div>

            {client && (
              <div className={styles.clientChip} style={{ background: `${clColor}18`, color: clColor }}>
                {client.display_name || client.name}
              </div>
            )}

            {/* Backlog リンク */}
            {backlogUrl && (
              <a
                href={backlogUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.backlogLink}
              >
                <BacklogBadge size={13} />
                {event.task.backlog_issue_key} を Backlog で開く
              </a>
            )}
          </div>
        ) : (
          <div className={styles.unlinked}>
            <span className={styles.unlinkedLabel}>タスク未紐付け</span>
            <button className={styles.btnLink} onClick={onOpenLink}>タスクを紐付ける ＋</button>
          </div>
        )}

        {/* フッター */}
        <div className={styles.footer}>
          {event.htmlLink && (
            <a
              href={event.htmlLink}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.btnGcal}
            >Google カレンダーで開く</a>
          )}
          {event.task && onEdit && (
            <button className={styles.btnEdit} onClick={() => onEdit(event.task)}>
              タスクを編集
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
