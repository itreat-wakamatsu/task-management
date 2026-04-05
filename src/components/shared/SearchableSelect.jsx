import { useState, useRef, useEffect } from 'react'
import styles from './SearchableSelect.module.css'

/**
 * 検索機能付きドロップダウン（矢印キーナビゲーション対応）
 * @param {Array}    options     - [{ value, label, sub? }]
 * @param {string}   value       - 現在の選択値
 * @param {Function} onChange    - (value: string) => void
 * @param {string}   placeholder - 未選択時のプレースホルダー
 * @param {boolean}  disabled    - 無効化
 */
export default function SearchableSelect({ options = [], value, onChange, placeholder = '選択...', disabled }) {
  const [query,        setQuery]        = useState('')
  const [open,         setOpen]         = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const inputRef    = useRef(null)
  const dropdownRef = useRef(null)

  const selected = options.find(o => String(o.value) === String(value))
  const filtered  = options.filter(o =>
    !query || o.label.toLowerCase().includes(query.toLowerCase())
  )

  // フォーカスされた項目をスクロールして見せる
  useEffect(() => {
    if (!open || focusedIndex < 0) return
    const el = dropdownRef.current?.children[focusedIndex]
    el?.scrollIntoView({ block: 'nearest' })
  }, [focusedIndex, open])

  function handleFocus() {
    setQuery('')
    setOpen(true)
    setFocusedIndex(-1)
  }

  function handleBlur() {
    setTimeout(() => { setOpen(false); setQuery(''); setFocusedIndex(-1) }, 150)
  }

  function handleSelect(opt) {
    onChange(String(opt.value))
    setOpen(false)
    setQuery('')
    setFocusedIndex(-1)
    inputRef.current?.blur()
  }

  function handleClear(e) {
    e.preventDefault()
    onChange('')
    setOpen(false)
    setQuery('')
    setFocusedIndex(-1)
  }

  function handleKeyDown(e) {
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedIndex(i => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (focusedIndex >= 0 && filtered[focusedIndex]) {
        handleSelect(filtered[focusedIndex])
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
      setQuery('')
      setFocusedIndex(-1)
      inputRef.current?.blur()
    }
  }

  return (
    <div className={`${styles.wrap} ${disabled ? styles.disabled : ''}`}>
      <input
        ref={inputRef}
        className={styles.input}
        value={open ? query : (selected?.label ?? '')}
        onChange={e => { setQuery(e.target.value); setFocusedIndex(-1) }}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
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
        <div className={styles.dropdown} ref={dropdownRef}>
          {filtered.length === 0 && (
            <div className={styles.empty}>該当なし</div>
          )}
          {filtered.map((opt, idx) => (
            <div
              key={opt.value}
              className={`${styles.option} ${String(opt.value) === String(value) ? styles.selected : ''} ${idx === focusedIndex ? styles.focused : ''}`}
              onMouseDown={() => handleSelect(opt)}
              onMouseEnter={() => setFocusedIndex(idx)}
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
