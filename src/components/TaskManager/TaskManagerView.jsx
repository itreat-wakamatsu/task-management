import { useState } from 'react'
import { useStore } from '@/store/useStore'
import { supabase } from '@/lib/supabase'
import { sortByRecent } from '@/lib/recentClients'
import TaskEditModal from './TaskEditModal'
import BacklogBadge  from '@/components/Backlog/BacklogBadge'
import SearchableSelect from '@/components/shared/SearchableSelect'
import styles from './TaskManagerView.module.css'

// 「今日の予定に追加」機能のためのプロップ（省略可）
// onAddToToday: (task) => void

const STATUS_LABELS = ['未着手', '進行中', '完了', '保留中']
const STATUS_STYLES = ['statusPending', 'statusRunning', 'statusDone', 'statusOnHold']
const ALL_STATUSES  = [0, 1, 2, 3]

function todayStr() {
  const t = new Date()
  return [t.getFullYear(), String(t.getMonth()+1).padStart(2,'0'), String(t.getDate()).padStart(2,'0')].join('-')
}

function fmtDate(d) {
  if (!d) return '–'
  return d.slice(0, 10).replace(/-/g, '/')
}

export default function TaskManagerView({ onAddToToday }) {
  const {
    appTasks, setAppTasks, addAppTask, clients, projects, categories,
    session, backlogToken,
  } = useStore()

  const [searchQuery,      setSearchQuery]      = useState('')
  const [filterClient,     setFilterClient]     = useState('')
  const [selectedStatuses, setSelectedStatuses] = useState([0, 1])  // デフォルト: 未着手+進行中（保留中・完了は非表示）
  const [filterBacklog,    setFilterBacklog]    = useState('all')
  const [filterRecurring,  setFilterRecurring]  = useState('false')  // 'all'|'true'|'false'
  const [editTarget,       setEditTarget]       = useState(null)
  const [showNew,          setShowNew]          = useState(false)

  const today = todayStr()

  function toggleStatus(s) {
    setSelectedStatuses(prev =>
      prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
    )
  }

  const clientOptions = sortByRecent(
    clients.map(c => ({ value: String(c.id), label: c.display_name || c.name }))
  )

  const filtered = appTasks
    .filter(t => {
      if (searchQuery && !t.title.toLowerCase().includes(searchQuery.toLowerCase())) return false
      if (filterClient && t.client_id !== parseInt(filterClient))  return false
      if (!selectedStatuses.includes(t.status))                    return false
      if (filterBacklog === 'backlog' && !t.backlog_issue_key)      return false
      if (filterBacklog === 'non'    &&  t.backlog_issue_key)       return false
      if (filterRecurring === 'true'  && !t.is_recurring)          return false
      if (filterRecurring === 'false' &&  t.is_recurring)          return false
      return true
    })
    .sort((a, b) => {
      // 期日昇順（期日なしは末尾）
      if (!a.due_date && !b.due_date) return 0
      if (!a.due_date) return 1
      if (!b.due_date) return -1
      return a.due_date.localeCompare(b.due_date)
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
        {/* フリーワード検索 */}
        <input
          type="text"
          className={styles.searchInput}
          placeholder="タスク名で検索..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />

        {/* クライアントフィルタ（検索機能付き・最近使用優先） */}
        <div className={styles.clientSelect}>
          <SearchableSelect
            options={[{ value: '', label: '全クライアント' }, ...clientOptions]}
            value={filterClient}
            onChange={v => setFilterClient(v)}
            placeholder="全クライアント"
          />
        </div>

        {/* ステータスバッジトグル */}
        <div className={styles.toggleGroup}>
          {ALL_STATUSES.map(s => (
            <button
              key={s}
              className={`${styles.toggleBtn} ${styles[`toggleBtn${s}`]} ${selectedStatuses.includes(s) ? styles.toggleBtnActive : ''}`}
              onClick={() => toggleStatus(s)}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>

        {/* 定期フィルタトグル */}
        <div className={styles.toggleGroup}>
          {[['all', 'すべて'], ['true', '定期'], ['false', '非定期']].map(([val, label]) => (
            <button
              key={val}
              className={`${styles.toggleBtn} ${filterRecurring === val ? styles.toggleBtnActiveNeutral : ''}`}
              onClick={() => setFilterRecurring(val)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Backlogフィルタトグル */}
        <div className={styles.toggleGroup}>
          {[['all', 'すべて'], ['backlog', 'Backlog'], ['non', '未連携']].map(([val, label]) => (
            <button
              key={val}
              className={`${styles.toggleBtn} ${filterBacklog === val ? styles.toggleBtnActiveNeutral : ''}`}
              onClick={() => setFilterBacklog(val)}
            >
              {label}
            </button>
          ))}
        </div>

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
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(task => {
              const cl        = clients.find(c => c.id === task.client_id)
              const pj        = projects.find(p => p.id === task.project_id)
              const c1        = categories.find(c => c.id === task.category_id)
              const c2        = categories.find(c => c.id === task.subcategory_id)
              const isOverdue = task.due_date && task.due_date < today && task.status !== 2

              // Backlog URL
              const backlogUrl = (task.backlog_issue_key && backlogToken?.space_key)
                ? `https://${backlogToken.space_key}.backlog.com/view/${task.backlog_issue_key}`
                : null

              return (
                <tr key={task.id} className={isOverdue ? styles.rowOverdue : ''}>
                  <td className={styles.tdId}>{task.id}</td>
                  <td>
                    <div className={styles.tdTitle}>
                      {/* 定期バッジ */}
                      {task.is_recurring && <span className={styles.recInline}>定期</span>}
                      {/* Backlogリンク or テキスト */}
                      {backlogUrl ? (
                        <a
                          href={backlogUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.backlogLink}
                          title={task.backlog_issue_key}
                        >
                          <BacklogBadge size={13} />
                          {task.title}
                        </a>
                      ) : (
                        task.title
                      )}
                    </div>
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
                    <div className={styles.tdActions}>
                      {onAddToToday && (
                        <button className={styles.btnAddToday} onClick={() => onAddToToday(task)} title="今日の予定に追加">＋今日</button>
                      )}
                      <button className={styles.btnEdit} onClick={() => setEditTarget(task)}>編集</button>
                      <button className={styles.btnDel}  onClick={() => handleDelete(task.id)}>削除</button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={10} className={styles.empty}>タスクがありません</td></tr>
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
