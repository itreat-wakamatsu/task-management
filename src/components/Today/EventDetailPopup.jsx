import { useStore } from '@/store/useStore'
import { getClientColor } from '@/lib/clientColor'
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
export default function EventDetailPopup({ event, onClose, onEdit, onEditEvent, onOpenLink }) {
  const { clients, projects, categories, backlogToken } = useStore()
  const task = event.task
  const client = clients.find(c => c.id === task?.client_id)
  const project = projects.find(p => p.id === task?.project_id)
  const category = categories.find(c => c.id === task?.category_id)
  const subcategory = categories.find(c => c.id === task?.subcategory_id)
  const clColor = getClientColor(client)

  const backlogUrl = (task?.backlog_issue_key && backlogToken?.space_key)
    ? `https://${backlogToken.space_key}.backlog.com/view/${task.backlog_issue_key}`
    : null

  function fmtDate(d) {
    if (!d) return null
    const dt = new Date(d)
    return `${dt.getFullYear()}/${String(dt.getMonth()+1).padStart(2,'0')}/${String(dt.getDate()).padStart(2,'0')}`
  }

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
        {task ? (
          <div className={styles.taskSection}>
            <div className={styles.sectionLabel}>紐付きタスク</div>

            <div className={styles.taskRow}>
              {task.backlog_issue_key && <BacklogBadge size={14} />}
              <span className={styles.taskName}>{task.title}</span>
            </div>

            {/* タスクステータス */}
            {task.status != null && (
              <span
                className={styles.taskStatusBadge}
                style={{ color: TASK_STATUS_COLORS[task.status] || undefined }}
              >
                {TASK_STATUS_LABELS[task.status] ?? '不明'}
              </span>
            )}

            {/* クライアント・案件 */}
            {client && (
              <div className={styles.clientChip} style={{ background: `${clColor}18`, color: clColor }}>
                {client.display_name || client.name}
              </div>
            )}
            {project && (
              <div className={styles.projectChip}>{project.name}</div>
            )}

            {/* 開始日・期日 */}
            {(task.start_date || task.due_date) && (
              <div className={styles.datesRow}>
                {task.start_date && (
                  <span className={styles.dateItem}>
                    <span className={styles.dateLabel}>開始</span>
                    <span className={styles.dateVal}>{fmtDate(task.start_date)}</span>
                  </span>
                )}
                {task.due_date && (
                  <span className={styles.dateItem}>
                    <span className={styles.dateLabel}>期日</span>
                    <span className={styles.dateVal}>{fmtDate(task.due_date)}</span>
                  </span>
                )}
              </div>
            )}

            {/* 第1区分・第2区分 */}
            {(category || subcategory) && (
              <div className={styles.catsRow}>
                {category && <span className={styles.catChip}><span className={styles.catLabel}>区分1</span>{category.name}</span>}
                {subcategory && <span className={styles.catChip}><span className={styles.catLabel}>区分2</span>{subcategory.name}</span>}
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
                {task.backlog_issue_key} を Backlog で開く
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
          {onEditEvent && (
            <button
              className={styles.btnEditEvent}
              onClick={() => onEditEvent(event)}
              title={event.permissionType === 'readonly' ? '読み取り専用のため編集できません' : '予定のタイトル・時刻を変更'}
            >
              予定を編集
            </button>
          )}
          {task && onEdit && (
            <button className={styles.btnEdit} onClick={() => onEdit(task)}>
              タスクを編集
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
