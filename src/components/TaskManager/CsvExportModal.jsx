import { useState } from 'react'
import { useStore } from '@/store/useStore'
import styles from './CsvExportModal.module.css'
import { buildColState, saveSettings } from './csvColumns'

const STATUS_LABELS = ['未着手', '進行中', '完了', '保留中']

function escapeCsv(v) {
  if (v == null) return ''
  const s = String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

export default function CsvExportModal({ tasks, onClose }) {
  const { clients, projects, categories } = useStore()

  const [cols, setCols] = useState(() => buildColState())

  const [dragIdx,       setDragIdx]       = useState(null)
  const [dropTargetIdx, setDropTargetIdx] = useState(null)

  function toggleCol(idx) {
    setCols(prev => {
      const next = prev.map((c, i) => i === idx ? { ...c, enabled: !c.enabled } : c)
      saveSettings(next)
      return next
    })
  }

  function handleDragStart(e, idx) {
    setDragIdx(idx)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragOver(e, idx) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dropTargetIdx !== idx) setDropTargetIdx(idx)
  }

  function handleDrop(e, idx) {
    e.preventDefault()
    if (dragIdx === null || dragIdx === idx) {
      setDragIdx(null)
      setDropTargetIdx(null)
      return
    }
    setCols(prev => {
      const next = [...prev]
      const [item] = next.splice(dragIdx, 1)
      next.splice(idx, 0, item)
      saveSettings(next)
      return next
    })
    setDragIdx(null)
    setDropTargetIdx(null)
  }

  function handleDragEnd() {
    setDragIdx(null)
    setDropTargetIdx(null)
  }

  function getCellValue(task, key) {
    switch (key) {
      case 'title': return task.title
      case 'client': {
        const c = clients.find(c => c.id === task.client_id)
        return c ? (c.display_name || c.name) : ''
      }
      case 'project': {
        const p = projects.find(p => p.id === task.project_id)
        return p?.name || ''
      }
      case 'category': {
        const c = categories.find(c => c.id === task.category_id)
        return c?.name || ''
      }
      case 'subcategory': {
        const c = categories.find(c => c.id === task.subcategory_id)
        return c?.name || ''
      }
      case 'status':       return STATUS_LABELS[task.status] ?? ''
      case 'start_date':   return task.start_date || ''
      case 'due_date':     return task.due_date || ''
      case 'id':           return task.id
      case 'backlog_key':  return task.backlog_issue_key || ''
      case 'is_recurring': return task.is_recurring ? '定期' : '非定期'
      default:             return ''
    }
  }

  function handleExport() {
    const activeCols = cols.filter(c => c.enabled)
    const header = activeCols.map(c => escapeCsv(c.label)).join(',')
    const rows = tasks.map(task =>
      activeCols.map(c => escapeCsv(getCellValue(task, c.key))).join(',')
    )
    const bom = '\uFEFF'
    const csv = bom + header + '\n' + rows.join('\n') + '\n'
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const d = new Date()
    a.download = `タスク_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.csv`
    a.click()
    URL.revokeObjectURL(url)
    onClose()
  }

  const activeCols   = cols.filter(c => c.enabled)
  const previewTasks = tasks.slice(0, 3)

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.title}>CSV 出力</span>
            <span className={styles.taskCount}>{tasks.length} 件</span>
          </div>
          <button className={styles.close} onClick={onClose}>×</button>
        </div>

        <div className={styles.body}>
          {/* 列選択 + 並べ替え */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>出力列の選択・並べ替え</div>
            <div className={styles.sectionHint}>クリックで ON/OFF、ドラッグで順序を変更</div>
            <div className={styles.colList}>
              {cols.map((col, idx) => (
                <div
                  key={col.key}
                  className={[
                    styles.colItem,
                    col.enabled             ? styles.colItemOn        : styles.colItemOff,
                    dragIdx === idx         ? styles.colItemDragging  : '',
                    dropTargetIdx === idx && dragIdx !== idx ? styles.colItemDropTarget : '',
                  ].filter(Boolean).join(' ')}
                  draggable
                  onDragStart={e => handleDragStart(e, idx)}
                  onDragOver={e  => handleDragOver(e, idx)}
                  onDrop={e      => handleDrop(e, idx)}
                  onDragEnd={handleDragEnd}
                  onClick={() => toggleCol(idx)}
                >
                  <span className={styles.colDragHandle} onClick={e => e.stopPropagation()}>⠿</span>
                  <span className={styles.colCheck}>{col.enabled ? '✓' : ''}</span>
                  <span className={styles.colLabel}>{col.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* プレビュー */}
          {previewTasks.length > 0 && activeCols.length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionLabel}>
                プレビュー（先頭 {Math.min(previewTasks.length, 3)} 件）
              </div>
              <div className={styles.previewWrap}>
                <table className={styles.previewTable}>
                  <thead>
                    <tr>
                      {activeCols.map(c => (
                        <th key={c.key}>{c.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewTasks.map(task => (
                      <tr key={task.id}>
                        {activeCols.map(c => (
                          <td key={c.key}>{getCellValue(task, c.key) || '–'}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <span className={styles.footerInfo}>
            {activeCols.length} 列 × {tasks.length} 件
          </span>
          <button className={styles.btnCancel} onClick={onClose}>キャンセル</button>
          <button
            className={styles.btnExport}
            onClick={handleExport}
            disabled={activeCols.length === 0 || tasks.length === 0}
          >
            ダウンロード
          </button>
        </div>
      </div>
    </div>
  )
}
