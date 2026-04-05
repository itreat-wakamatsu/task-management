import { useState } from 'react'
import { useStore } from '@/store/useStore'
import { sortByRecent, pushRecentClientId } from '@/lib/recentClients'
import SearchableSelect from '@/components/shared/SearchableSelect'
import BacklogLinkModal from './BacklogLinkModal'
import styles from './TaskEditModal.module.css'

export const STATUS_LABELS = ['未着手', '進行中', '完了', '保留中']

/**
 * @param {object|null} task          - 編集対象タスク（null なら新規作成）
 * @param {object}      initialValues - 新規作成時の初期値
 * @param {Function}    onSave        - (patch) => void
 * @param {Function}    onClose       - () => void
 */
export default function TaskEditModal({ task, initialValues = {}, onSave, onClose }) {
  const { clients, projects, categories, backlogToken } = useStore()

  const isBacklog = !!task?.backlog_issue_key

  const [form, setForm] = useState({
    title:             task?.title             ?? initialValues.title          ?? '',
    status:            task?.status            ?? initialValues.status         ?? 0,
    client_id:         String(task?.client_id      ?? initialValues.client_id      ?? ''),
    project_id:        String(task?.project_id     ?? initialValues.project_id     ?? ''),
    category_id:       String(task?.category_id    ?? initialValues.category_id    ?? ''),
    subcategory_id:    String(task?.subcategory_id ?? initialValues.subcategory_id ?? ''),
    is_recurring:      task?.is_recurring      ?? initialValues.is_recurring   ?? false,
    start_date:        task?.start_date        ?? initialValues.start_date     ?? '',
    due_date:          task?.due_date          ?? initialValues.due_date       ?? '',
    backlog_issue_id:  task?.backlog_issue_id  ?? null,
    backlog_issue_key: task?.backlog_issue_key ?? null,
  })

  const [showBacklogLink, setShowBacklogLink] = useState(false)

  const filteredProjects = projects.filter(p => p.client_id === parseInt(form.client_id))
  const cat1List         = categories.filter(c => c.project_id === parseInt(form.project_id) && !c.parent_id)
  const cat2List         = categories.filter(c => c.parent_id  === parseInt(form.category_id))

  const clientOptions  = sortByRecent(clients.map(c => ({ value: String(c.id), label: c.display_name || c.name })))
  const projectOptions = filteredProjects.map(p => ({ value: String(p.id), label: p.name }))
  const cat1Options    = cat1List.map(c => ({ value: String(c.id), label: c.name }))
  const cat2Options    = cat2List.map(c => ({ value: String(c.id), label: c.name }))

  // isBacklog = フォームにbacklog_issue_keyがある状態
  const hasBacklog = !!form.backlog_issue_key

  function set(key, val) {
    setForm(f => {
      const next = { ...f, [key]: val }
      if (key === 'client_id')   { next.project_id = ''; next.category_id = ''; next.subcategory_id = '' }
      if (key === 'project_id')  { next.category_id = ''; next.subcategory_id = '' }
      if (key === 'category_id') { next.subcategory_id = '' }
      return next
    })
  }

  function handleBacklogLinked(issue) {
    setForm(f => ({
      ...f,
      title:             issue.summary,
      start_date:        issue.startDate ? issue.startDate.slice(0, 10) : f.start_date,
      due_date:          issue.dueDate   ? issue.dueDate.slice(0, 10)   : f.due_date,
      backlog_issue_id:  issue.id,
      backlog_issue_key: issue.issueKey,
    }))
    setShowBacklogLink(false)
  }

  function handleSave() {
    if (!form.title.trim()) return
    if (form.client_id) pushRecentClientId(form.client_id)
    onSave({
      title:             form.title.trim(),
      status:            parseInt(form.status),
      client_id:         form.client_id      ? parseInt(form.client_id)      : null,
      project_id:        form.project_id     ? parseInt(form.project_id)     : null,
      category_id:       form.category_id    ? parseInt(form.category_id)    : null,
      subcategory_id:    form.subcategory_id ? parseInt(form.subcategory_id) : null,
      is_recurring:      form.is_recurring,
      start_date:        form.start_date || null,
      due_date:          form.due_date   || null,
      backlog_issue_id:  form.backlog_issue_id  ?? null,
      backlog_issue_key: form.backlog_issue_key ?? null,
    })
  }

  return (
    <>
      <div className={styles.backdrop} onClick={e => e.target === e.currentTarget && onClose()}>
        <div className={styles.box}>
          <div className={styles.titleRow}>
            <span className={styles.title}>{task ? 'タスク編集' : '新規タスク作成'}</span>
            <div className={styles.titleRowRight}>
              {hasBacklog && <span className={styles.backlogTag}>Backlog</span>}
              {/* Backlog連携ボタン（未連携タスクのみ、backlogToken がある場合） */}
              {!hasBacklog && backlogToken && (
                <button className={styles.btnBacklogLink} onClick={() => setShowBacklogLink(true)}>
                  Backlog 連携
                </button>
              )}
            </div>
          </div>
          {task && (
            <div className={styles.sub}>
              ID: {task.id}
              {form.backlog_issue_key && ` / ${form.backlog_issue_key}`}
            </div>
          )}

          <div className={styles.field}>
            <label className={styles.label}>タスク名 *{hasBacklog && <span className={styles.locked}>編集不可</span>}</label>
            {hasBacklog ? (
              <div className={styles.readonlyField}>{form.title}</div>
            ) : (
              <input
                className={styles.input}
                value={form.title}
                onChange={e => set('title', e.target.value)}
                placeholder="タスク名を入力"
              />
            )}
          </div>

          <div className={styles.field}>
            <label className={styles.label}>ステータス</label>
            <select className={styles.select} value={form.status} onChange={e => set('status', e.target.value)}>
              <option value={0}>未着手</option>
              <option value={1}>進行中</option>
              <option value={2}>完了</option>
              <option value={3}>保留中</option>
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>クライアント</label>
            <SearchableSelect
              options={clientOptions}
              value={form.client_id}
              onChange={v => set('client_id', v)}
              placeholder="クライアントを選択"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>案件</label>
            <SearchableSelect
              options={projectOptions}
              value={form.project_id}
              onChange={v => set('project_id', v)}
              placeholder="案件を選択"
              disabled={!form.client_id}
            />
          </div>

          <div className={styles.catRow}>
            <div className={styles.field}>
              <label className={styles.label}>第一区分</label>
              <SearchableSelect
                options={cat1Options}
                value={form.category_id}
                onChange={v => set('category_id', v)}
                placeholder="第一区分を選択"
                disabled={!form.project_id}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>第二区分</label>
              <SearchableSelect
                options={cat2Options}
                value={form.subcategory_id}
                onChange={v => set('subcategory_id', v)}
                placeholder="第二区分を選択"
                disabled={!form.category_id}
              />
            </div>
          </div>

          <div className={styles.dateRow}>
            <div className={styles.field}>
              <label className={styles.label}>開始日{hasBacklog && <span className={styles.locked}>編集不可</span>}</label>
              {hasBacklog ? (
                <div className={styles.readonlyField}>{form.start_date || '–'}</div>
              ) : (
                <input
                  type="date"
                  className={styles.dateInput}
                  value={form.start_date ?? ''}
                  onChange={e => set('start_date', e.target.value)}
                />
              )}
            </div>
            <div className={styles.field}>
              <label className={styles.label}>期日{hasBacklog && <span className={styles.locked}>編集不可</span>}</label>
              {hasBacklog ? (
                <div className={styles.readonlyField}>{form.due_date || '–'}</div>
              ) : (
                <input
                  type="date"
                  className={styles.dateInput}
                  value={form.due_date ?? ''}
                  onChange={e => set('due_date', e.target.value)}
                />
              )}
            </div>
          </div>

          <label className={styles.checkRow}>
            <input
              type="checkbox"
              checked={form.is_recurring}
              onChange={e => set('is_recurring', e.target.checked)}
            />
            定期タスク（ミーティングなど繰り返しの予定）
          </label>

          <div className={styles.footer}>
            <button className={styles.btnCancel} onClick={onClose}>キャンセル</button>
            <button className={styles.btnSave} onClick={handleSave} disabled={!form.title.trim()}>
              {task ? '保存' : '作成'}
            </button>
          </div>
        </div>
      </div>

      {showBacklogLink && (
        <BacklogLinkModal
          onLinked={handleBacklogLinked}
          onClose={() => setShowBacklogLink(false)}
        />
      )}
    </>
  )
}
