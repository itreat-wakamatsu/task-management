import { useState, useRef, useCallback } from 'react'
import { useStore } from '@/store/useStore'
import { supabase } from '@/lib/supabase'
import styles from './CsvImportModal.module.css'

/* ── CSV ヘッダー定義 ── */
const CSV_COLUMNS = [
  { key: 'title',       label: 'タスク名',   required: true  },
  { key: 'client',      label: 'クライアント', required: false },
  { key: 'project',     label: '案件',       required: false },
  { key: 'category',    label: '第一区分',   required: false },
  { key: 'subcategory', label: '第二区分',   required: false },
  { key: 'status',      label: 'ステータス', required: false },
  { key: 'start_date',  label: '開始日',     required: false },
  { key: 'due_date',    label: '期日',       required: false },
  { key: 'is_recurring',label: '定期',       required: false },
]

const STATUS_MAP = {
  '未着手': 0, '進行中': 1, '完了': 2, '保留中': 3, '保留': 3,
  '0': 0, '1': 1, '2': 2, '3': 3,
}

const TEMPLATE_HEADER = CSV_COLUMNS.map(c => c.label).join(',')
const TEMPLATE_EXAMPLE = 'サンプルタスク,クライアントA,案件B,設計,,未着手,2026-04-07,2026-04-30,false'

/* ── CSV パーサー（ダブルクオート・カンマ対応） ── */
function parseCsvLine(line) {
  const fields = []
  let current = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuote) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++ }
      else if (ch === '"') { inQuote = false }
      else { current += ch }
    } else {
      if (ch === '"') { inQuote = true }
      else if (ch === ',') { fields.push(current.trim()); current = '' }
      else { current += ch }
    }
  }
  fields.push(current.trim())
  return fields
}

/* ── ファイル読み込み (UTF-8 / Shift-JIS 自動判定) ── */
function readFileAsText(file) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => {
      const text = reader.result
      // Shift-JIS の場合は文字化けする可能性があるためチェック
      if (text.includes('\ufffd')) {
        const sjisReader = new FileReader()
        sjisReader.onload = () => resolve(sjisReader.result)
        sjisReader.readAsText(file, 'Shift_JIS')
      } else {
        resolve(text)
      }
    }
    reader.readAsText(file, 'UTF-8')
  })
}

/* ── 日付文字列を YYYY-MM-DD に正規化 ── */
function normalizeDate(str) {
  if (!str) return null
  // YYYY/MM/DD or YYYY-MM-DD
  const m = str.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  return null
}

/* ── マスタ名前マッチング ── */
function findByName(list, name) {
  if (!name) return null
  const lower = name.toLowerCase()
  return list.find(item => {
    const n = (item.display_name || item.name || '').toLowerCase()
    return n === lower
  }) || null
}

export default function CsvImportModal({ onClose, onImported }) {
  const { session, clients, projects, categories, appTasks } = useStore()
  const fileRef = useRef(null)

  const [rows,      setRows]      = useState([])      // パース済み行
  const [selected,  setSelected]  = useState(new Set())
  const [dragOver,  setDragOver]  = useState(false)
  const [error,     setError]     = useState(null)
  const [importing, setImporting] = useState(false)
  const [result,    setResult]    = useState(null)    // { count }

  const existingTitles = new Set(appTasks.map(t => t.title.toLowerCase()))

  /* ── CSV パース処理 ── */
  const processFile = useCallback(async (file) => {
    setError(null)
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('CSV ファイル (.csv) を選択してください。')
      return
    }

    const text = await readFileAsText(file)
    const lines = text.split(/\r?\n/).filter(l => l.trim())
    if (lines.length < 2) {
      setError('CSV にデータ行がありません。ヘッダー行 + 1行以上のデータが必要です。')
      return
    }

    // ヘッダー解析：ラベル名 → key へのマッピング
    const headerFields = parseCsvLine(lines[0])
    const colMap = []
    for (const h of headerFields) {
      const col = CSV_COLUMNS.find(c => c.label === h.trim())
      colMap.push(col ? col.key : null)
    }

    if (!colMap.includes('title')) {
      setError(`「タスク名」列が見つかりません。ヘッダー行に「タスク名」を含めてください。\n検出されたヘッダー: ${headerFields.join(', ')}`)
      return
    }

    // データ行のパース
    const parsed = []
    for (let i = 1; i < lines.length; i++) {
      const fields = parseCsvLine(lines[i])
      const row = {}
      colMap.forEach((key, idx) => {
        if (key) row[key] = fields[idx] || ''
      })
      if (!row.title) continue  // タスク名なしはスキップ

      // マスタマッチング
      const matchedClient   = findByName(clients, row.client)
      const clientProjects  = matchedClient
        ? projects.filter(p => p.client_id === matchedClient.id)
        : projects
      const matchedProject  = findByName(clientProjects, row.project)

      const projCategories = matchedProject
        ? categories.filter(c => c.project_id === matchedProject.id && !c.parent_id)
        : categories.filter(c => !c.parent_id)
      const matchedCategory = findByName(projCategories, row.category)

      const subCategories = matchedCategory
        ? categories.filter(c => c.parent_id === matchedCategory.id)
        : []
      const matchedSubcategory = findByName(subCategories, row.subcategory)

      parsed.push({
        _idx:              i,
        title:             row.title,
        clientName:        row.client || '',
        projectName:       row.project || '',
        categoryName:      row.category || '',
        subcategoryName:   row.subcategory || '',
        status:            STATUS_MAP[row.status] ?? 0,
        statusRaw:         row.status || '',
        start_date:        normalizeDate(row.start_date),
        due_date:          normalizeDate(row.due_date),
        is_recurring:      ['true', '1', 'はい', 'yes', 'TRUE'].includes(row.is_recurring),
        matchedClient,
        matchedProject,
        matchedCategory,
        matchedSubcategory,
        isDuplicate:       existingTitles.has(row.title.toLowerCase()),
      })
    }

    if (parsed.length === 0) {
      setError('有効なデータ行がありません。「タスク名」列にデータがあることを確認してください。')
      return
    }

    setRows(parsed)
    setSelected(new Set(parsed.map((_, i) => i)))
  }, [clients, projects, categories, existingTitles])

  /* ── イベントハンドラ ── */
  function handleFileChange(e) {
    if (e.target.files?.[0]) processFile(e.target.files[0])
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files?.[0]) processFile(e.dataTransfer.files[0])
  }

  function handleDragOver(e) { e.preventDefault(); setDragOver(true) }
  function handleDragLeave() { setDragOver(false) }

  function toggleRow(idx) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(idx) ? next.delete(idx) : next.add(idx)
      return next
    })
  }

  function selectAll()   { setSelected(new Set(rows.map((_, i) => i))) }
  function deselectAll() { setSelected(new Set()) }

  function handleReset() {
    setRows([])
    setSelected(new Set())
    setError(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  /* ── テンプレートダウンロード ── */
  function downloadTemplate() {
    const bom = '\uFEFF'
    const csv = bom + TEMPLATE_HEADER + '\n' + TEMPLATE_EXAMPLE + '\n'
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'タスクインポートテンプレート.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  /* ── インポート実行 ── */
  async function handleImport() {
    const toImport = rows.filter((_, i) => selected.has(i))
    if (toImport.length === 0) return

    setImporting(true)
    setError(null)

    const inserts = toImport.map(row => ({
      user_id:        session.user.id,
      title:          row.title,
      client_id:      row.matchedClient?.id    || null,
      project_id:     row.matchedProject?.id   || null,
      category_id:    row.matchedCategory?.id   || null,
      subcategory_id: row.matchedSubcategory?.id || null,
      status:         row.status,
      start_date:     row.start_date  || null,
      due_date:       row.due_date    || null,
      is_recurring:   row.is_recurring,
    }))

    const { data, error: err } = await supabase
      .from('app_tasks')
      .insert(inserts)
      .select()

    setImporting(false)

    if (err) {
      console.error('CSV インポートエラー:', err)
      setError('インポートに失敗しました。しばらくしてから再度お試しください。')
      return
    }

    setResult({ count: data.length })
    if (onImported) onImported(data)
  }

  /* ── 完了画面 ── */
  if (result) {
    return (
      <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
        <div className={styles.modal}>
          <div className={styles.body}>
            <div className={styles.success}>
              <div className={styles.successIcon}>&#x2714;</div>
              <div className={styles.successTitle}>{result.count} 件のタスクをインポートしました</div>
              <div className={styles.successDesc}>
                タスク管理一覧に反映されています。
              </div>
              <button className={styles.btnClose} onClick={onClose}>閉じる</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const selectedCount = selected.size
  const hasPreview = rows.length > 0

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.title}>CSV インポート</span>
          <button className={styles.close} onClick={onClose}>×</button>
        </div>

        <div className={styles.body}>
          {error && <div className={styles.error}>{error}</div>}

          {!hasPreview ? (
            <>
              {/* ファイル選択 / ドロップゾーン */}
              <div
                className={`${styles.dropZone} ${dragOver ? styles.dropZoneActive : ''}`}
                onClick={() => fileRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
              >
                <div className={styles.dropIcon}>&#128196;</div>
                <div className={styles.dropText}>
                  CSV ファイルをドラッグ&ドロップ<br />
                  または <span className={styles.dropLink}>ファイルを選択</span>
                </div>
                <div className={styles.dropHint}>UTF-8 / Shift-JIS 対応</div>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
              <div className={styles.templateRow}>
                <button className={styles.btnTemplate} onClick={downloadTemplate}>
                  テンプレート CSV をダウンロード
                </button>
              </div>
            </>
          ) : (
            <>
              {/* ツールバー */}
              <div className={styles.toolbar}>
                <div className={styles.summary}>
                  <span className={styles.summaryCount}>{selectedCount}</span> / {rows.length} 件を選択中
                </div>
                <button className={styles.btnSelectAll} onClick={selectAll}>全選択</button>
                <button className={styles.btnDeselectAll} onClick={deselectAll}>全解除</button>
                <button className={styles.btnReset} onClick={handleReset}>別のファイル</button>
              </div>

              {/* プレビューテーブル */}
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.thCheck}>
                        <input
                          type="checkbox"
                          checked={selectedCount === rows.length}
                          onChange={() => selectedCount === rows.length ? deselectAll() : selectAll()}
                        />
                      </th>
                      <th>タスク名</th>
                      <th>クライアント</th>
                      <th>案件</th>
                      <th>ステータス</th>
                      <th>開始日</th>
                      <th>期日</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => {
                      const checked = selected.has(idx)
                      return (
                        <tr
                          key={idx}
                          className={checked ? '' : styles.rowUnchecked}
                          onClick={() => toggleRow(idx)}
                          style={{ cursor: 'pointer' }}
                        >
                          <td className={styles.tdCheck} onClick={e => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleRow(idx)}
                            />
                          </td>
                          <td className={styles.tdTitle}>
                            {row.is_recurring && <span style={{ fontSize: '0.5625rem', padding: '1px 4px', borderRadius: 3, background: 'var(--color-teal-bg)', color: 'var(--color-teal-text)', fontWeight: 600, marginRight: 4 }}>定期</span>}
                            {row.title}
                            {row.isDuplicate && <span className={styles.dupBadge}>重複あり</span>}
                          </td>
                          <td>
                            {row.clientName ? (
                              <span className={`${styles.matchChip} ${row.matchedClient ? styles.matchOk : styles.matchNone}`}>
                                {row.clientName}{!row.matchedClient && ' ?'}
                              </span>
                            ) : (
                              <span className={styles.tdSub}>–</span>
                            )}
                          </td>
                          <td>
                            {row.projectName ? (
                              <span className={`${styles.matchChip} ${row.matchedProject ? styles.matchOk : styles.matchNone}`}>
                                {row.projectName}{!row.matchedProject && ' ?'}
                              </span>
                            ) : (
                              <span className={styles.tdSub}>–</span>
                            )}
                          </td>
                          <td className={styles.tdSub}>
                            {['未着手', '進行中', '完了', '保留中'][row.status]}
                          </td>
                          <td className={styles.tdDate}>{row.start_date || '–'}</td>
                          <td className={styles.tdDate}>{row.due_date || '–'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {hasPreview && (
          <div className={styles.footer}>
            <div className={styles.footerInfo}>
              {rows.some(r => r.isDuplicate && selected.has(rows.indexOf(r))) && '同名タスクが含まれています'}
            </div>
            <button className={styles.btnCancel} onClick={onClose}>キャンセル</button>
            <button
              className={styles.btnImport}
              onClick={handleImport}
              disabled={selectedCount === 0 || importing}
            >
              {importing ? 'インポート中...' : `${selectedCount} 件をインポート`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
