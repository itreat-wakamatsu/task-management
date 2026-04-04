import { useState, useRef } from 'react'
import styles from './SearchableSelect.module.css'

/**
 * 検索機能付きドロップダウン
 * @param {Array}    options     - [{ value, label, sub? }]
 * @param {string}   value       - 現在の選択値
 * @param {Function} onChange    - (value: string) => void
 * @param {string}   placeholder - 未選択時のプレースホルダー
 * @param {boolean}  disabled    - 無効化
 */
export default function SearchableSelect({ options = [], value, onChange, placeholder = '選択...', disabled }) {
  const [query, setQuery]  = useState('')
  const [open,  setOpen]   = useState(false)
  const inputRef           = useRef(null)

  const selected = options.find(o => String(o.value) === String(value))
  const filtered = options.filter(o =>
    !query || o.label.toLowerCase().includes(query.toLowerCase())
  )

  function handleFocus() {
    setQuery('')
    setOpen(true)
  }

  function handleBlur() {
    setTimeout(() => { setOpen(false); setQuery('') }, 150)
  }

  function handleSelect(opt) {
    onChange(String(opt.value))
    setOpen(false)
    setQuery('')
    inputRef.current?.blur()
  }

  function handleClear(e) {
    e.preventDefault()
    onChange('')
    setOpen(false)
    setQuery('')
  }

  return (
    <div className={`${styles.wrap} ${disabled ? styles.disabled : ''}`}>
      <input
        ref={inputRef}
        className={styles.input}
        value={open ? query : (selected?.label ?? '')}
        onChange={e => setQuery(e.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={open ? '検索...' : placeholder}
        disabled={disabled}
        readOnly={!open}
      />
      {!disabled && value && !open && (
        <button className={styles.clear} onMouseDown={handleClear} tabIndex={-1}>×</button>
      )}
      {!disabled && !open && (
        <span className={styles.arrow} aria-hidden>▾</span>
      )}
      {open && (
        <div className={styles.dropdown}>
          {filtered.length === 0 && (
            <div className={styles.empty}>該当なし</div>
          )}
          {filtered.map(opt => (
            <div
              key={opt.value}
              className={`${styles.option} ${String(opt.value) === String(value) ? styles.selected : ''}`}
              onMouseDown={() => handleSelect(opt)}
            >
              <span className={styles.optLabel}>{opt.label}</span>
              {opt.sub && <span className={styles.optSub}>{opt.sub}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
