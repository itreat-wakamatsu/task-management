import { useState } from 'react'
import { useStore } from '@/store/useStore'
import styles from './TaskEditModal.module.css'

export default function TaskEditModal({ task, onSave, onClose }) {
  const { clients, projects, categories } = useStore()

  const [form, setForm] = useState({
    title:          task?.title          || '',
    status:         task?.status         ?? 0,
    client_id:      task?.client_id      || '',
    project_id:     task?.project_id     || '',
    category_id:    task?.category_id    || '',
    subcategory_id: task?.subcategory_id || '',
    is_recurring:   task?.is_recurring   || false,
  })

  const filteredProjects = projects.filter(p => p.client_id === parseInt(form.client_id))
  const cat1List         = categories.filter(c => c.project_id === parseInt(form.project_id) && !c.parent_id)
  const cat2List         = categories.filter(c => c.parent_id  === parseInt(form.category_id))

  function set(key, val) {
    setForm(f => {
      const next = { ...f, [key]: val }
      // 連動リセット
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
          <input className={styles.input} value={form.title} onChange={e => set('title', e.target.value)} placeholder="タスク名を入力" />
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
          <select className={styles.select} value={form.client_id} onChange={e => set('client_id', e.target.value)}>
            <option value="">未設定</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>案件</label>
          <select className={styles.select} value={form.project_id} onChange={e => set('project_id', e.target.value)} disabled={!form.client_id}>
            <option value="">未設定</option>
            {filteredProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        <div className={styles.catRow}>
          <div className={styles.field}>
            <label className={styles.label}>第一区分（親カテゴリー）</label>
            <select className={styles.select} value={form.category_id} onChange={e => set('category_id', e.target.value)} disabled={!form.project_id}>
              <option value="">未設定</option>
              {cat1List.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>第二区分（子カテゴリー）</label>
            <select className={styles.select} value={form.subcategory_id} onChange={e => set('subcategory_id', e.target.value)} disabled={!form.category_id}>
              <option value="">未設定</option>
              {cat2List.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        <label className={styles.checkRow}>
          <input type="checkbox" checked={form.is_recurring} onChange={e => set('is_recurring', e.target.checked)} />
          定期タスク（ミーティングなど繰り返しの予定）
        </label>

        <div className={styles.footer}>
          <button className={styles.btnCancel} onClick={onClose}>キャンセル</button>
          <button className={styles.btnSave}   onClick={handleSave}>
            {task ? '保存' : '作成'}
          </button>
        </div>
      </div>
    </div>
  )
}
