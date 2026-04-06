import { useState, useRef, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/store/useStore'
import { getClientColor } from '@/lib/clientColor'
import styles from './ClientColorPicker.module.css'

const SWATCHES = [
  '#6366f1', '#8b5cf6', '#a855f7', '#ec4899',
  '#ef4444', '#f97316', '#f59e0b', '#84cc16',
  '#10b981', '#14b8a6', '#06b6d4', '#3b82f6',
  '#64748b', '#78716c', '#374151', '#1e293b',
]

/**
 * @param {object} client  - クライアントオブジェクト
 * @param {Function} onClose - 閉じる
 * @param {object} anchorRef - ポップオーバーの基準要素
 */
export default function ClientColorPicker({ client, onClose }) {
  const updateClient = useStore(s => s.updateClient)
  const [hex, setHex]     = useState(getClientColor(client) || '#6366f1')
  const [saving, setSaving] = useState(false)
  const ref = useRef(null)

  // 外クリックで閉じる
  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  async function handleSave() {
    if (!hex.match(/^#[0-9a-fA-F]{6}$/)) return
    setSaving(true)
    await supabase.from('clients').update({ color: hex }).eq('id', client.id)
    updateClient(client.id, { color: hex })
    setSaving(false)
    onClose()
  }

  return (
    <div className={styles.picker} ref={ref}>
      <div className={styles.title}>{client.display_name || client.name}</div>
      <div className={styles.swatches}>
        {SWATCHES.map(c => (
          <button
            key={c}
            className={`${styles.swatch} ${hex === c ? styles.swatchActive : ''}`}
            style={{ background: c }}
            onClick={() => setHex(c)}
          />
        ))}
      </div>
      <div className={styles.hexRow}>
        <input
          className={styles.hexInput}
          value={hex}
          onChange={e => setHex(e.target.value)}
          maxLength={7}
          spellCheck={false}
        />
        <div className={styles.hexPreview} style={{ background: hex }} />
      </div>
      <div className={styles.footer}>
        <button className={styles.btnCancel} onClick={onClose}>キャンセル</button>
        <button className={styles.btnSave} onClick={handleSave} disabled={saving}>
          {saving ? '保存中…' : '保存'}
        </button>
      </div>
    </div>
  )
}
