// 出力・取り込み共通の列定義
export const ALL_COLS = [
  { key: 'title',        label: 'タスク名',     defaultOn: true,  importable: true,  required: true  },
  { key: 'client',       label: 'クライアント', defaultOn: true,  importable: true  },
  { key: 'project',      label: '案件',         defaultOn: true,  importable: true  },
  { key: 'category',     label: '第1区分',      defaultOn: true,  importable: true  },
  { key: 'subcategory',  label: '第2区分',      defaultOn: true,  importable: true  },
  { key: 'status',       label: 'ステータス',   defaultOn: true,  importable: true  },
  { key: 'start_date',   label: '開始日',       defaultOn: true,  importable: true  },
  { key: 'due_date',     label: '期日',         defaultOn: true,  importable: true  },
  { key: 'is_recurring', label: '定期/非定期',  defaultOn: false, importable: true  },
  { key: 'id',           label: 'ID',           defaultOn: false, importable: false },
  { key: 'backlog_key',  label: 'Backlogキー',  defaultOn: false, importable: false },
]

// 旧バージョンのテンプレートとの後方互換ラベル
export const LABEL_ALIASES = {
  '第一区分': 'category',
  '第二区分': 'subcategory',
  '定期':     'is_recurring',
}

export const STORAGE_KEY = 'csv_export_format_v1'

export function loadSettings() {
  try {
    const s = localStorage.getItem(STORAGE_KEY)
    if (s) return JSON.parse(s)
  } catch {}
  return null
}

export function saveSettings(cols) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(
      cols.map(c => ({ key: c.key, enabled: c.enabled }))
    ))
  } catch {}
}

export function buildColState() {
  const saved = loadSettings()
  if (saved) {
    const ordered = saved
      .map(s => {
        const col = ALL_COLS.find(c => c.key === s.key)
        return col ? { ...col, enabled: s.enabled } : null
      })
      .filter(Boolean)
    const savedKeys = new Set(ordered.map(c => c.key))
    const newCols = ALL_COLS
      .filter(c => !savedKeys.has(c.key))
      .map(c => ({ ...c, enabled: c.defaultOn }))
    return [...ordered, ...newCols]
  }
  return ALL_COLS.map(c => ({ ...c, enabled: c.defaultOn }))
}
