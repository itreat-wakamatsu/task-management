import { useState, useMemo } from 'react'
import { useStore } from '@/store/useStore'
import { scoreCandidates } from '@/lib/autoLink'
import { getClientColor } from '@/lib/clientColor'
import { supabase } from '@/lib/supabase'
import TaskEditModal from '@/components/TaskManager/TaskEditModal'
import styles from './LinkModal.module.css'

export default function LinkModal({ event, onClose, onLinked }) {
  const { appTasks, clients, session, addAppTask } = useStore()
  const [search,      setSearch]      = useState('')
  const [recOnly,     setRecOnly]     = useState(false)
  const [selected,    setSelected]    = useState(null)
  const [saving,      setSaving]      = useState(false)
  const [showNewForm, setShowNewForm] = useState(false)

  // スコアリング済み候補（フィルター前）— 自動推測に使う
  const allCandidates = useMemo(
    () => scoreCandidates(event.calendarEventTitle, appTasks),
    [event.calendarEventTitle, appTasks]
  )

  // 表示用候補（検索・フィルター適用後）
  const candidates = useMemo(() => {
    return allCandidates
      .filter(t => !recOnly || t.is_recurring)
      .filter(t => {
        if (!search) return true
        const q = search.toLowerCase()
        return t.title.toLowerCase().includes(q) || String(t.id).includes(q)
      })
  }, [allCandidates, search, recOnly])

  // 自動推測: スコア 0.35 以上の最上位候補からクライアント・案件・区分を引き継ぐ
  const autoSuggest = useMemo(() => {
    const best = allCandidates[0]
    if (!best || best.score < 0.35) return {}
    return {
      client_id:      best.client_id      ?? '',
      project_id:     best.project_id     ?? '',
      category_id:    best.category_id    ?? '',
      subcategory_id: best.subcategory_id ?? '',
      is_recurring:   best.is_recurring   ?? false,
    }
  }, [allCandidates])

  async function handleConfirm() {
    if (!selected) return
    setSaving(true)
    onLinked(selected, false)
    await supabase
      .from('app_tasks')
      .update({ usage_count: (selected.usage_count || 0) + 1 })
      .eq('id', selected.id)
    onClose()
  }

  // LinkModal から新規タスクを作成して即紐付け
  async function handleCreateTask(data) {
    if (!session?.user?.id) return
    const { data: created } = await supabase
      .from('app_tasks')
      .insert({ ...data, user_id: session.user.id })
      .select()
      .single()
    if (created) {
      addAppTask(created)   // タスク管理タブに即反映
      onLinked(created, false)
    }
    onClose()
  }

  async function handleUnlink() {
    onLinked(null, true)
    onClose()
  }

  function scoreLabel(score) {
    if (score >= 0.65) return { text: '高一致', cls: styles.scoreHi }
    if (score >= 0.35) return { text: '中一致', cls: styles.scoreMid }
    return { text: '低一致', cls: styles.scoreLow }
  }

  return (
    <>
      <div className={styles.backdrop} onClick={e => e.target === e.currentTarget && onClose()}>
        <div className={styles.box}>
          <div className={styles.title}>タスクを紐付ける</div>
          <div className={styles.sub}>
            「{event.calendarEventTitle}」に対応するタスクを選択してください
            {event.taskId && <span className={styles.currentTag}>現在: {event.taskId}</span>}
          </div>

          {/* 検索・フィルター */}
          <div className={styles.searchRow}>
            <input
              className={styles.searchInput}
              placeholder="IDやタイトルで検索..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <label className={styles.recLabel}>
              <input
                type="checkbox"
                checked={recOnly}
                onChange={e => setRecOnly(e.target.checked)}
              />
              定期タスクのみ
            </label>
          </div>

          {/* 候補リスト */}
          <div className={styles.list}>
            {candidates.length === 0 && (
              <div className={styles.empty}>該当するタスクが見つかりません</div>
            )}
            {candidates.map(task => {
              const cl  = clients.find(c => c.id === task.client_id)
              const sc  = scoreLabel(task.score)
              const sel = selected?.id === task.id
              return (
                <div
                  key={task.id}
                  className={`${styles.option} ${sel ? styles.selected : ''}`}
                  onClick={() => setSelected(task)}
                >
                  <span className={styles.optId}>{task.id}</span>
                  <div className={styles.optBody}>
                    <div className={styles.optTitle}>
                      {task.title}
                      {task.is_recurring && <span className={styles.recBadge}>定期</span>}
                    </div>
                    {cl && (
                      <div className={styles.optSub} style={{ color: getClientColor(cl) }}>
                        {cl.display_name || cl.name}
                      </div>
                    )}
                  </div>
                  <span className={`${styles.score} ${sc.cls}`}>{sc.text}</span>
                </div>
              )
            })}
          </div>

          {/* フッター */}
          <div className={styles.footer}>
            <button
              className={styles.btnNew}
              onClick={() => setShowNewForm(true)}
              disabled={saving}
            >
              新規タスク作成
            </button>
            {event.taskId && (
              <button className={styles.btnUnlink} onClick={handleUnlink}>
                紐付けを解除
              </button>
            )}
            <button className={styles.btnCancel} onClick={onClose}>
              キャンセル
            </button>
            <button
              className={styles.btnConfirm}
              onClick={handleConfirm}
              disabled={!selected || saving}
            >
              紐付ける
            </button>
          </div>
        </div>
      </div>

      {/* 新規タスク作成フォーム（LinkModal の上に重ねて表示） */}
      {showNewForm && (
        <TaskEditModal
          task={null}
          initialValues={{
            title: event.calendarEventTitle,
            ...autoSuggest,
          }}
          onSave={handleCreateTask}
          onClose={() => setShowNewForm(false)}
        />
      )}
    </>
  )
}
