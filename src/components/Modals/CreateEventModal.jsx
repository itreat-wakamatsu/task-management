import { useState, useMemo } from 'react'
import { useStore } from '@/store/useStore'
import { getClientColor } from '@/lib/clientColor'
import { supabase } from '@/lib/supabase'
import TaskEditModal from '@/components/TaskManager/TaskEditModal'
import styles from './CreateEventModal.module.css'

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土']

function fmtTime(d) {
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

function fmtDateLabel(d) {
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} (${DAY_NAMES[d.getDay()]})`
}

function parseTime(hhmm, baseDate) {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date(baseDate)
  d.setHours(h, m, 0, 0)
  return d
}

/**
 * 空き枠クリック時に表示する「新しい予定を作成」モーダル
 * タスクを先に紐付け → タスクが選択できない場合は新規作成 という流れ
 *
 * @param {object}   slot      - { start: Date, end: Date }
 * @param {Function} onSave    - ({ title, start, end, task }) => Promise<void>
 * @param {Function} onClose
 */
export default function CreateEventModal({ slot, onSave, onClose }) {
  const { appTasks, clients, session, addAppTask } = useStore()

  const [title,        setTitle]        = useState('')
  const [startStr,     setStartStr]     = useState(fmtTime(slot.start))
  const [endStr,       setEndStr]       = useState(fmtTime(slot.end))
  const [search,       setSearch]       = useState('')
  const [selectedTask, setSelectedTask] = useState(null)
  const [showNewTask,  setShowNewTask]  = useState(false)
  const [saving,       setSaving]       = useState(false)

  function selectTask(task) {
    setSelectedTask(prev => prev?.id === task.id ? null : task) // トグル
    if (!title) setTitle(task.title)
  }

  // 検索フィルタ済みタスク一覧（usage_count 降順）
  const candidates = useMemo(() => {
    const q = search.toLowerCase()
    return [...appTasks]
      .filter(t => !q || t.title.toLowerCase().includes(q) || String(t.id).includes(q))
      .sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0))
  }, [appTasks, search])

  // 新規タスク作成 → 自動選択
  async function handleCreateNewTask(taskData) {
    const { data: newTask } = await supabase
      .from('app_tasks')
      .insert({ ...taskData, user_id: session.user.id })
      .select()
      .single()
    if (newTask) {
      addAppTask(newTask)
      setSelectedTask(newTask)
      if (!title) setTitle(newTask.title)
    }
    setShowNewTask(false)
  }

  async function handleSave() {
    const startDate = parseTime(startStr, slot.start)
    const endDate   = parseTime(endStr,   slot.start)
    if (endDate <= startDate) { alert('終了時間は開始時間より後にしてください'); return }
    const finalTitle = title.trim() || selectedTask?.title || '（タイトルなし）'
    setSaving(true)
    try {
      await onSave({ title: finalTitle, start: startDate, end: endDate, task: selectedTask })
      onClose()
    } catch (err) {
      console.error(err)
      alert('作成に失敗しました')
      setSaving(false)
    }
  }

  return (
    <>
      <div className={styles.backdrop} onClick={e => e.target === e.currentTarget && onClose()}>
        <div className={styles.box}>
          {/* ヘッダー */}
          <div className={styles.header}>
            <div className={styles.title}>新しい予定を作成</div>
            <button className={styles.btnClose} onClick={onClose}>×</button>
          </div>

          {/* 日付・時刻 */}
          <div className={styles.dateLabel}>{fmtDateLabel(slot.start)}</div>
          <div className={styles.timeRow}>
            <input
              type="time"
              className={styles.timeInput}
              value={startStr}
              onChange={e => setStartStr(e.target.value)}
            />
            <span className={styles.timeSep}>～</span>
            <input
              type="time"
              className={styles.timeInput}
              value={endStr}
              onChange={e => setEndStr(e.target.value)}
            />
          </div>

          {/* タイトル */}
          <label className={styles.fieldLabel}>タイトル</label>
          <input
            className={styles.titleInput}
            placeholder={selectedTask ? selectedTask.title : '予定のタイトル（未入力の場合はタスク名を使用）'}
            value={title}
            onChange={e => setTitle(e.target.value)}
          />

          {/* タスク選択 */}
          <div className={styles.sectionLabel}>タスクを紐付ける（任意）</div>
          <input
            className={styles.searchInput}
            placeholder="IDやタイトルで検索..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div className={styles.list}>
            {candidates.length === 0 && (
              <div className={styles.empty}>タスクが見つかりません</div>
            )}
            {candidates.map(task => {
              const cl  = clients.find(c => c.id === task.client_id)
              const sel = selectedTask?.id === task.id
              return (
                <div
                  key={task.id}
                  className={`${styles.option} ${sel ? styles.selected : ''}`}
                  onClick={() => selectTask(task)}
                >
                  <span className={styles.optId}>{task.id}</span>
                  <div className={styles.optBody}>
                    <div className={styles.optTitle}>{task.title}</div>
                    {cl && (
                      <div className={styles.optSub} style={{ color: getClientColor(cl) }}>
                        {cl.display_name || cl.name}
                      </div>
                    )}
                  </div>
                  {sel && <span className={styles.checkMark}>✓</span>}
                </div>
              )
            })}
          </div>

          {/* フッター */}
          <div className={styles.footer}>
            <button className={styles.btnNew} onClick={() => setShowNewTask(true)}>
              新規タスク作成
            </button>
            <button className={styles.btnCancel} onClick={onClose} disabled={saving}>
              キャンセル
            </button>
            <button className={styles.btnCreate} onClick={handleSave} disabled={saving}>
              {saving ? '作成中...' : '作成'}
            </button>
          </div>
        </div>
      </div>

      {showNewTask && (
        <TaskEditModal
          task={null}
          onSave={handleCreateNewTask}
          onClose={() => setShowNewTask(false)}
        />
      )}
    </>
  )
}
