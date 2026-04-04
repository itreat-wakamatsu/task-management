import { useState } from 'react'
import { useStore } from '@/store/useStore'
import { supabase } from '@/lib/supabase'
import TaskEditModal from './TaskEditModal'
import BacklogBadge  from '@/components/Backlog/BacklogBadge'
import styles from './TaskManagerView.module.css'

const STATUS_LABELS = ['未着手', '進行中', '完了']
const STATUS_STYLES = ['statusPending', 'statusRunning', 'statusDone']

function todayStr() {
  const t = new Date()
  return [t.getFullYear(), String(t.getMonth()+1).padStart(2,'0'), String(t.getDate()).padStart(2,'0')].join('-')
}

function fmtDate(d) {
  if (!d) return '–'
  return d.slice(0, 10).replace(/-/g, '/')
}

export default function TaskManagerView() {
  const { appTasks, setAppTasks, addAppTask, clients, projects, categories, session } = useStore()
  const [filterClient,    setFilterClient]    = useState('')
  const [filterStatus,    setFilterStatus]    = useState('')
  const [filterRecurring, setFilterRecurring] = useState('')
  const [editTarget,      setEditTarget]      = useState(null)
  const [showNew,         setShowNew]         = useState(false)

  const today = todayStr()

  const filtered = appTasks.filter(t => {
    if (filterClient    && t.client_id !== parseInt(filterClient))     return false
    if (filterStatus !== '' && t.status !== parseInt(filterStatus))    return false
    if (filterRecurring === 'true'  && !t.is_recurring)                return false
    if (filterRecurring === 'false' &&  t.is_recurring)                return false
    return true
  })

  async function handleSave(id, patch) {
    await supabase.from('app_tasks').update(patch).eq('id', id)
    setAppTasks(appTasks.map(t => t.id === id ? { ...t, ...patch } : t))
    setEditTarget(null)
  }

  async function handleCreate(data) {
    const { data: created } = await supabase
      .from('app_tasks')
      .insert({ ...data, user_id: session.user.id })
      .select()
      .single()
    if (created) addAppTask(created)
    setShowNew(false)
  }

  async function handleDelete(id) {
    if (!confirm('このタスクを削除しますか？')) return
    await supabase.from('app_tasks').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    setAppTasks(appTasks.filter(t => t.id !== id))
  }

  return (
    <div>
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
        <select value={filterRecurring} onChange={e => setFilterRecurring(e.target.value)}>
          <option value="">定期・非定期すべて</option>
          <option value="true">定期のみ</option>
          <option value="false">非定期のみ</option>
        </select>
        <button className={styles.btnAdd} onClick={() => setShowNew(true)}>＋ 新規タスク</button>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>ID</th>
              <th>タスク名</th>
              <th>クライアント</th>
              <th>案件</th>
              <th>第一区分</th>
              <th>第二区分</th>
              <th>ステータス</th>
              <th>開始日</th>
              <th>期日</th>
              <th>フラグ</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(task => {
              const cl       = clients.find(c => c.id === task.client_id)
              const pj       = projects.find(p => p.id === task.project_id)
              const c1       = categories.find(c => c.id === task.category_id)
              const c2       = categories.find(c => c.id === task.subcategory_id)
              const isOverdue = task.due_date && task.due_date < today && task.status !== 2
              return (
                <tr key={task.id} className={isOverdue ? styles.rowOverdue : ''}>
                  <td className={styles.tdId}>{task.id}</td>
                  <td className={styles.tdTitle}>
                    {task.backlog_issue_key && <BacklogBadge size={14} />}
                    {task.title}
                  </td>
                  <td>
                    {cl && (
                      <span className={styles.clientChip} style={{ background: `${cl.color}18`, color: cl.color }}>
                        {cl.display_name || cl.name}
                      </span>
                    )}
                  </td>
                  <td className={styles.tdSub}>{pj?.name || '–'}</td>
                  <td className={styles.tdSub}>{c1?.name || '–'}</td>
                  <td className={styles.tdSub}>{c2?.name || '–'}</td>
                  <td>
                    <span className={`${styles.status} ${styles[STATUS_STYLES[task.status]]}`}>
                      {STATUS_LABELS[task.status]}
                    </span>
                  </td>
                  <td className={styles.tdDate}>{fmtDate(task.start_date)}</td>
                  <td className={`${styles.tdDate} ${isOverdue ? styles.tdOverdue : ''}`}>
                    {fmtDate(task.due_date)}
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
              <tr><td colSpan={11} className={styles.empty}>タスクがありません</td></tr>
            )}
          </tbody>
        </table>
      </div>

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
