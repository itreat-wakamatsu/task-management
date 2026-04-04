import { useState } from 'react'
import { useStore } from '@/store/useStore'
import { supabase } from '@/lib/supabase'
import TaskEditModal from './TaskEditModal'
import styles from './TaskManagerView.module.css'

const STATUS_LABELS = ['未着手', '進行中', '完了']
const STATUS_STYLES = ['statusPending', 'statusRunning', 'statusDone']

export default function TaskManagerView() {
  const { appTasks, setAppTasks, clients, projects, categories, session } = useStore()
  const [filterClient, setFilterClient] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [editTarget,   setEditTarget]   = useState(null)
  const [showNew,      setShowNew]      = useState(false)

  const filtered = appTasks.filter(t => {
    if (filterClient && t.client_id !== parseInt(filterClient)) return false
    if (filterStatus !== '' && t.status !== parseInt(filterStatus)) return false
    return true
  })

  async function handleSave(id, patch) {
    await supabase.from('app_tasks').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
    setAppTasks(appTasks.map(t => t.id === id ? { ...t, ...patch } : t))
    setEditTarget(null)
  }

  async function handleCreate(data) {
    const { data: created } = await supabase
      .from('app_tasks')
      .insert({ ...data, user_id: session.user.id })
      .select()
      .single()
    if (created) setAppTasks([...appTasks, created])
    setShowNew(false)
  }

  async function handleDelete(id) {
    if (!confirm('このタスクを削除しますか？')) return
    await supabase.from('app_tasks').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    setAppTasks(appTasks.filter(t => t.id !== id))
  }

  return (
    <div>
      {/* フィルターバー */}
      <div className={styles.filterBar}>
        <select value={filterClient} onChange={e => setFilterClient(e.target.value)}>
          <option value="">全クライアント</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">全ステータス</option>
          <option value="0">未着手</option>
          <option value="1">進行中</option>
          <option value="2">完了</option>
        </select>
        <button className={styles.btnAdd} onClick={() => setShowNew(true)}>＋ 新規タスク</button>
      </div>

      {/* テーブル */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>ID</th>
              <th>タスク名</th>
              <th>クライアント</th>
              <th>案件</th>
              <th>第一区分</th>
              <th>ステータス</th>
              <th>フラグ</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(task => {
              const cl  = clients.find(c => c.id === task.client_id)
              const pj  = projects.find(p => p.id === task.project_id)
              const c1  = categories.find(c => c.id === task.category_id)
              return (
                <tr key={task.id}>
                  <td className={styles.tdId}>{task.id}</td>
                  <td className={styles.tdTitle}>{task.title}</td>
                  <td>
                    {cl && (
                      <span className={styles.clientChip} style={{ background: `${cl.color}18`, color: cl.color }}>
                        {cl.display_name || cl.name}
                      </span>
                    )}
                  </td>
                  <td className={styles.tdSub}>{pj?.name || '–'}</td>
                  <td className={styles.tdSub}>{c1?.name || '–'}</td>
                  <td>
                    <span className={`${styles.status} ${styles[STATUS_STYLES[task.status]]}`}>
                      {STATUS_LABELS[task.status]}
                    </span>
                  </td>
                  <td>
                    {task.is_recurring && <span className={styles.recBadge}>定期</span>}
                  </td>
                  <td className={styles.tdActions}>
                    <button className={styles.btnEdit} onClick={() => setEditTarget(task)}>編集</button>
                    <button className={styles.btnDel}  onClick={() => handleDelete(task.id)}>削除</button>
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className={styles.empty}>タスクがありません</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 編集モーダル */}
      {editTarget && (
        <TaskEditModal
          task={editTarget}
          onSave={patch => handleSave(editTarget.id, patch)}
          onClose={() => setEditTarget(null)}
        />
      )}
      {showNew && (
        <TaskEditModal
          task={null}
          onSave={handleCreate}
          onClose={() => setShowNew(false)}
        />
      )}
    </div>
  )
}
