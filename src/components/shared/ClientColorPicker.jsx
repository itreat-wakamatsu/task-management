import { useState, useRef, useEffect } from 'react'
import { useStore } from '@/store/useStore'
import { getClientColor, saveClientColor } from '@/lib/clientColor'
import styles from './ClientColorPicker.module.css'

const SWATCHES = [
  '#6366f1', '#8b5cf6', '#a855f7', '#ec4899',
  '#ef4444', '#f97316', '#f59e0b', '#84cc16',
  '#10b981', '#14b8a6', '#06b6d4', '#3b82f6',
  '#64748b', '#78716c', '#374151', '#1e293b',
]

/**
 * @param {object}   client   - クライアントオブジェクト
 * @param {Function} onClose  - 閉じるコールバック
 * @param {object}   style    - position: fixed 用のスタイル上書き（top/left など）
 */
export default function ClientColorPicker({ client, onClose, style }) {
  const updateClient = useStore(s => s.updateClient)
  const session      = useStore(s => s.session)
  const [hex, setHex] = useState(getClientColor(client) || '#6366f1')
  const ref = useRef(null)

  // 外クリック（mousedown）で閉じる
  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    // capture:true で先に判定し、イベントブロックの mousedown より前に評価
    document.addEventListener('mousedown', handler, true)
    return () => document.removeEventListener('mousedown', handler, true)
  }, [onClose])

  function handleSave() {
    if (!hex.match(/^#[0-9a-fA-F]{6}$/)) return
    if (session?.user?.id) saveClientColor(session.user.id, client.id, hex)
    updateClient(client.id, { color: hex })
    onClose()
  }

  return (
    <div
      className={styles.picker}
      ref={ref}
      style={style}
      // ピッカー内のクリック・マウスダウンが親要素に伝播しないようにする
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
    >
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
        <button className={styles.btnSave} onClick={handleSave}>
          保存
        </button>
      </div>
    </div>
  )
}
