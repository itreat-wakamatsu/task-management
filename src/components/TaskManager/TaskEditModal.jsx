import { useState } from 'react'
import { useStore } from '@/store/useStore'
import SearchableSelect from '@/components/shared/SearchableSelect'
import styles from './TaskEditModal.module.css'

/**
 * @param {object|null} task          - 編集対象タスク（null なら新規作成）
 * @param {object}      initialValues - 新規作成時の初期値（LinkModal からの引き継ぎ等）
 * @param {Function}    onSave        - (patch) => void
 * @param {Function}    onClose       - () => void
 */
export default function TaskEditModal({ task, initialValues = {}, onSave, onClose }) {
  const { clients, projects, categories } = useStore()

  const [form, setForm] = useState({
    title:          task?.title          ?? initialValues.title          ?? '',
    status:         task?.status         ?? initialValues.status         ?? 0,
    client_id:      String(task?.client_id      ?? initialValues.client_id      ?? ''),
    project_id:     String(task?.project_id     ?? initialValues.project_id     ?? ''),
    category_id:    String(task?.category_id    ?? initialValues.category_id    ?? ''),
    subcategory_id: String(task?.subcategory_id ?? initialValues.subcategory_id ?? ''),
    is_recurring:   task?.is_recurring   ?? initialValues.is_recurring   ?? false,
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
    })
  }

  return (
    <div className={styles.backdrop} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.box}>
        <div className={styles.title}>{task ? 'タスク編集' : '新規タスク作成'}</div>
        {task && <div className={styles.sub}>ID: {task.id}</div>}

        <div className={styles.field}>
          <label className={styles.label}>タスク名 *</label>
          <input
            className={styles.input}
            value={form.title}
            onChange={e => set('title', e.target.value)}
            placeholder="タスク名を入力"
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>ステータス</label>
          <select className={styles.select} value={form.status} onChange={e => set('status', e.target.value)}>
            <option value={0}>未着手</option>
            <option value={1}>進行中</option>
            <option value={2}>完了</option>
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
