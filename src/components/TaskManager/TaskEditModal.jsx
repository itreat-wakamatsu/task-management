import { useState } from 'react'
import { useStore } from '@/store/useStore'
import SearchableSelect from '@/components/shared/SearchableSelect'
import styles from './TaskEditModal.module.css'

const STATUS_LABELS = ['未着手', '進行中', '完了']

/**
 * @param {object|null} task          - 編集対象タスク（null なら新規作成）
 * @param {object}      initialValues - 新規作成時の初期値
 * @param {Function}    onSave        - (patch) => void
 * @param {Function}    onClose       - () => void
 */
export default function TaskEditModal({ task, initialValues = {}, onSave, onClose }) {
  const { clients, projects, categories } = useStore()

  const isBacklog = !!task?.backlog_issue_key

  const [form, setForm] = useState({
    title:          task?.title          ?? initialValues.title          ?? '',
    status:         task?.status         ?? initialValues.status         ?? 0,
    client_id:      String(task?.client_id      ?? initialValues.client_id      ?? ''),
    project_id:     String(task?.project_id     ?? initialValues.project_id     ?? ''),
    category_id:    String(task?.category_id    ?? initialValues.category_id    ?? ''),
    subcategory_id: String(task?.subcategory_id ?? initialValues.subcategory_id ?? ''),
    is_recurring:   task?.is_recurring   ?? initialValues.is_recurring   ?? false,
    start_date:     task?.start_date     ?? initialValues.start_date     ?? '',
    due_date:       task?.due_date       ?? initialValues.due_date       ?? '',
  })

  const filteredProjects = projects.filter(p => p.client_id === parseInt(form.client_id))
  const cat1List         = categories.filter(c => c.project_id === parseInt(form.project_id) && !c.parent_id)
  const cat2List         = categories.filter(c => c.parent_id  === parseInt(form.category_id))

  const clientOptions  = clients.map(c => ({ value: String(c.id), label: c.display_name || c.name }))
  const projectOptions = filteredProjects.map(p => ({ value: String(p.id), label: p.name }))
  const cat1Options    = cat1List.map(c => ({ value: String(c.id), label: c.name }))
  const cat2Options    = cat2List.map(c => ({ value: String(c.id), label: c.name }))

  function set(key, val) {
    setForm(f => {
      const next = { ...f, [key]: val }
      if (key === 'client_id')   { next.project_id = ''; next.category_id = ''; next.subcategory_id = '' }
      if (key === 'project_id')  { next.category_id = ''; next.subcategory_id = '' }
      if (key === 'category_id') { next.subcategory_id = '' }
      return next
    })
  }

  function handleSave() {
    if (!form.title.trim()) return
    onSave({
      title:          form.title.trim(),
      status:         parseInt(form.status),
      client_id:      form.client_id      ? parseInt(form.client_id)      : null,
      project_id:     form.project_id     ? parseInt(form.project_id)     : null,
      category_id:    form.category_id    ? parseInt(form.category_id)    : null,
      subcategory_id: form.subcategory_id ? parseInt(form.subcategory_id) : null,
      is_recurring:   form.is_recurring,
      start_date:     form.start_date || null,
      due_date:       form.due_date   || null,
    })
  }

  return (
    <div className={styles.backdrop} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.box}>
        <div className={styles.titleRow}>
          <span className={styles.title}>{task ? 'タスク編集' : '新規タスク作成'}</span>
          {isBacklog && <span className={styles.backlogTag}>Backlog</span>}
        </div>
        {task && <div className={styles.sub}>ID: {task.id}{task.backlog_issue_key && ` / ${task.backlog_issue_key}`}</div>}

        <div className={styles.field}>
          <label className={styles.label}>タスク名 *{isBacklog && <span className={styles.locked}>編集不可</span>}</label>
          {isBacklog ? (
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
          <label className={styles.label}>ステータス{isBacklog && <span className={styles.locked}>編集不可</span>}</label>
          {isBacklog ? (
            <div className={styles.readonlyField}>{STATUS_LABELS[form.status]}</div>
          ) : (
            <select className={styles.select} value={form.status} onChange={e => set('status', e.target.value)}>
              <option value={0}>未着手</option>
              <option value={1}>進行中</option>
              <option value={2}>完了</option>
            </select>
          )}
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
            <label className={styles.label}>開始日</label>
            <input
              type="date"
              className={styles.dateInput}
              value={form.start_date ?? ''}
              onChange={e => set('start_date', e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>期日</label>
            <input
              type="date"
              className={styles.dateInput}
              value={form.due_date ?? ''}
              onChange={e => set('due_date', e.target.value)}
            />
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
  )
}
