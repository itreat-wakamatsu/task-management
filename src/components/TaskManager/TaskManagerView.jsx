import { useState, useEffect, useRef } from 'react'
import { useStore } from '@/store/useStore'
import { supabase } from '@/lib/supabase'
import { sortByRecent } from '@/lib/recentClients'
import { getClientColor } from '@/lib/clientColor'
import { syncBacklogTasks, shouldAutoSync } from '@/lib/backlogSync'
import TaskEditModal  from './TaskEditModal'
import CsvImportModal from './CsvImportModal'
import CsvExportModal from './CsvExportModal'
import BacklogBadge   from '@/components/Backlog/BacklogBadge'
import SearchableSelect from '@/components/shared/SearchableSelect'
import ClientColorPicker from '@/components/shared/ClientColorPicker'
import styles from './TaskManagerView.module.css'

// 「今日の予定に追加」機能のためのプロップ（省略可）
// onAddToToday: (task) => void

const STATUS_LABELS = ['未着手', '進行中', '完了', '保留中']
const STATUS_STYLES = ['statusPending', 'statusRunning', 'statusDone', 'statusOnHold']
const ALL_STATUSES  = [0, 1, 2, 3]

const BULK_INIT = { status: '', client_id: '', project_id: '', category_id: '', subcategory_id: '' }

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
    appTasks, setAppTasks, addAppTask, updateAppTask, clients, projects, categories,
    session, backlogToken, setBacklogToken,
  } = useStore()

  const [syncStatus, setSyncStatus] = useState(null)  // null | 'syncing' | { updated: number }
  const syncStartedRef = useRef(false)

  // タスク管理タブ表示時に自動同期（15 分クールダウン）
  useEffect(() => {
    if (!backlogToken || !shouldAutoSync() || syncStartedRef.current) return
    syncStartedRef.current = true
    setSyncStatus('syncing')
    syncBacklogTasks({ backlogToken, session, appTasks, updateAppTask, setBacklogToken })
      .then(({ updated }) => {
        setSyncStatus({ updated })
        setTimeout(() => setSyncStatus(null), 3000)
      })
      .catch(err => {
        console.warn('[Backlog auto-sync]', err)
        setSyncStatus(null)
      })
  }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  const [searchQuery,      setSearchQuery]      = useState('')
  const [filterClient,     setFilterClient]     = useState('')
  const [selectedStatuses, setSelectedStatuses] = useState([0, 1])  // デフォルト: 未着手+進行中（保留中・完了は非表示）
  const [filterBacklog,    setFilterBacklog]    = useState('all')
  const [filterRecurring,  setFilterRecurring]  = useState('false')  // 'all'|'true'|'false'
  const [editTarget,       setEditTarget]       = useState(null)
  const [showNew,          setShowNew]          = useState(false)
  const [showCsvImport,    setShowCsvImport]   = useState(false)
  const [showCsvExport,    setShowCsvExport]   = useState(false)
  const [colorPicker,      setColorPicker]      = useState(null)  // { client, top, left }

  // ── 一括編集 ──
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [bulkForm,    setBulkForm]    = useState(BULK_INIT)

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

  // チェックボックス操作
  const allSelected  = filtered.length > 0 && filtered.every(t => selectedIds.has(t.id))
  const someSelected = !allSelected && filtered.some(t => selectedIds.has(t.id))

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map(t => t.id)))
    }
  }

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // bulkForm のカスケード選択肢
  const bulkFilteredProjects = bulkForm.client_id
    ? projects.filter(p => String(p.client_id) === bulkForm.client_id)
    : projects
  const bulkCat1List = bulkForm.project_id
    ? categories.filter(c => String(c.project_id) === bulkForm.project_id && !c.parent_id)
    : []
  const bulkCat2List = bulkForm.category_id
    ? categories.filter(c => String(c.parent_id) === bulkForm.category_id)
    : []

  function setBulkField(field, value) {
    setBulkForm(prev => {
      const next = { ...prev, [field]: value }
      // カスケードリセット
      if (field === 'client_id')  { next.project_id = ''; next.category_id = ''; next.subcategory_id = '' }
      if (field === 'project_id') { next.category_id = ''; next.subcategory_id = '' }
      if (field === 'category_id') { next.subcategory_id = '' }
      return next
    })
  }

  async function handleBulkApply() {
    const patch = {}
    if (bulkForm.status        !== '') patch.status        = parseInt(bulkForm.status)
    if (bulkForm.client_id     !== '') patch.client_id     = parseInt(bulkForm.client_id)
    if (bulkForm.project_id    !== '') patch.project_id    = parseInt(bulkForm.project_id)
    if (bulkForm.category_id   !== '') patch.category_id   = parseInt(bulkForm.category_id)
    if (bulkForm.subcategory_id !== '') patch.subcategory_id = parseInt(bulkForm.subcategory_id)

    if (Object.keys(patch).length === 0) return

    const ids = [...selectedIds]
    await supabase.from('app_tasks').update(patch).in('id', ids)
    setAppTasks(appTasks.map(t => ids.includes(t.id) ? { ...t, ...patch } : t))
    setSelectedIds(new Set())
    setBulkForm(BULK_INIT)
  }

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

  function openColorPicker(e, client) {
    const rect = e.currentTarget.getBoundingClientRect()
    const PICKER_W = 208
    const PICKER_H = 300
    let left = rect.left
    if (left + PICKER_W > window.innerWidth - 8) left = window.innerWidth - PICKER_W - 8
    const top = rect.bottom + 4 + PICKER_H > window.innerHeight - 8
      ? rect.top - PICKER_H - 4
      : rect.bottom + 4
    setColorPicker({ client, top, left })
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

        {syncStatus === 'syncing' && (
          <span className={styles.syncBadge}>↺ Backlog同期中</span>
        )}
        {syncStatus && syncStatus !== 'syncing' && (
          <span className={`${styles.syncBadge} ${styles.syncBadgeDone}`}>
            {syncStatus.updated > 0 ? `↺ ${syncStatus.updated}件更新` : '↺ 最新'}
          </span>
        )}

        <div className={styles.csvBtnGroup}>
          <button className={styles.btnCsvExport} onClick={() => setShowCsvExport(true)}>CSV 出力</button>
          <button className={styles.btnCsvImport} onClick={() => setShowCsvImport(true)}>CSV 取込</button>
        </div>
        <button className={styles.btnAdd} onClick={() => setShowNew(true)}>＋ 新規タスク</button>
      </div>

      {/* ── 一括編集バー（1件以上選択時に表示） ── */}
      {selectedIds.size > 0 && (
        <div className={styles.bulkBar}>
          <span className={styles.bulkCount}>{selectedIds.size}件選択中</span>
          <span className={styles.bulkLabel}>変更内容：</span>

          {/* ステータス */}
          <select
            className={styles.bulkSelect}
            value={bulkForm.status}
            onChange={e => setBulkField('status', e.target.value)}
          >
            <option value="">ステータス：変更しない</option>
            {STATUS_LABELS.map((lbl, i) => (
              <option key={i} value={String(i)}>{lbl}</option>
            ))}
          </select>

          {/* クライアント */}
          <select
            className={styles.bulkSelect}
            value={bulkForm.client_id}
            onChange={e => setBulkField('client_id', e.target.value)}
          >
            <option value="">クライアント：変更しない</option>
            {clients.map(c => (
              <option key={c.id} value={String(c.id)}>{c.display_name || c.name}</option>
            ))}
          </select>

          {/* 案件 */}
          <select
            className={styles.bulkSelect}
            value={bulkForm.project_id}
            onChange={e => setBulkField('project_id', e.target.value)}
          >
            <option value="">案件：変更しない</option>
            {bulkFilteredProjects.map(p => (
              <option key={p.id} value={String(p.id)}>{p.name}</option>
            ))}
          </select>

          {/* 第1区分 */}
          <select
            className={styles.bulkSelect}
            value={bulkForm.category_id}
            onChange={e => setBulkField('category_id', e.target.value)}
            disabled={!bulkForm.project_id}
            title={!bulkForm.project_id ? '案件を選択してください' : ''}
          >
            <option value="">第1区分：変更しない</option>
            {bulkCat1List.map(c => (
              <option key={c.id} value={String(c.id)}>{c.name}</option>
            ))}
          </select>

          {/* 第2区分 */}
          <select
            className={styles.bulkSelect}
            value={bulkForm.subcategory_id}
            onChange={e => setBulkField('subcategory_id', e.target.value)}
            disabled={!bulkForm.category_id}
            title={!bulkForm.category_id ? '第1区分を選択してください' : ''}
          >
            <option value="">第2区分：変更しない</option>
            {bulkCat2List.map(c => (
              <option key={c.id} value={String(c.id)}>{c.name}</option>
            ))}
          </select>

          <button className={styles.bulkApply} onClick={handleBulkApply}>
            一括更新
          </button>
          <button
            className={styles.bulkCancel}
            onClick={() => { setSelectedIds(new Set()); setBulkForm(BULK_INIT) }}
          >
            選択解除
          </button>
        </div>
      )}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.thCheck}>
                <label className={styles.checkCell} title="全選択 / 全解除">
                  <input
                    type="checkbox"
                    className={styles.checkboxInput}
                    checked={allSelected}
                    ref={el => { if (el) el.indeterminate = someSelected }}
                    onChange={toggleSelectAll}
                  />
                  <span className={styles.checkboxCustom} />
                </label>
              </th>
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
              const isSelected = selectedIds.has(task.id)

              // Backlog URL
              const backlogUrl = (task.backlog_issue_key && backlogToken?.space_key)
                ? `https://${backlogToken.space_key}.backlog.com/view/${task.backlog_issue_key}`
                : null

              return (
                <tr
                  key={task.id}
                  className={[
                    isOverdue  ? styles.rowOverdue  : '',
                    isSelected ? styles.rowSelected : '',
                  ].join(' ')}
                >
                  <td className={styles.tdCheck}>
                    <label className={styles.checkCell}>
                      <input
                        type="checkbox"
                        className={styles.checkboxInput}
                        checked={isSelected}
                        onChange={() => toggleSelect(task.id)}
                      />
                      <span className={styles.checkboxCustom} />
                    </label>
                  </td>
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
                    {cl && (() => { const cc = getClientColor(cl); return (
                      <button
                        className={styles.clientChip}
                        style={{ background: `${cc}18`, color: cc }}
                        onClick={e => openColorPicker(e, cl)}
                        title="色を変更"
                      >
                        {cl.display_name || cl.name}
                      </button>
                    )})()}
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
                        <button className={styles.btnAddToday} onClick={() => onAddToToday(task)} title="予定に追加">＋予定</button>
                      )}
                      <button className={styles.btnEdit} onClick={() => setEditTarget(task)}>編集</button>
                      <button className={styles.btnDel}  onClick={() => handleDelete(task.id)}>削除</button>
                    </div>
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
      {showCsvImport && (
        <CsvImportModal
          onClose={() => setShowCsvImport(false)}
          onImported={(newTasks) => {
            setAppTasks([...newTasks, ...appTasks])
            setShowCsvImport(false)
          }}
        />
      )}
      {showCsvExport && (
        <CsvExportModal
          tasks={selectedIds.size > 0 ? filtered.filter(t => selectedIds.has(t.id)) : filtered}
          onClose={() => setShowCsvExport(false)}
        />
      )}
      {colorPicker && (
        <ClientColorPicker
          client={colorPicker.client}
          onClose={() => setColorPicker(null)}
          style={{ position: 'fixed', top: colorPicker.top, left: colorPicker.left }}
        />
      )}
    </div>
  )
}
