import { useState, useRef, useEffect } from 'react'
import { TUTORIALS, getCompletedTutorials } from './tutorialData'
import styles from './HelpButton.module.css'

/**
 * ヘルプボタン（右上 ? アイコン + ドロップダウンメニュー）
 *
 * Props:
 *   onStartTutorial(tutorialId) - チュートリアル開始コールバック
 */
export default function HelpButton({ onStartTutorial }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)
  const btnRef  = useRef(null)

  // 外側クリックで閉じる
  useEffect(() => {
    if (!open) return
    function handleClick(e) {
      if (menuRef.current?.contains(e.target)) return
      if (btnRef.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const completed = getCompletedTutorials()

  return (
    <div className={styles.wrapper} data-tutorial="help-btn">
      <button
        ref={btnRef}
        className={styles.helpBtn}
        onClick={() => setOpen(v => !v)}
        title="使い方ガイド"
        aria-label="使い方ガイド"
      >
        ?
      </button>

      {open && (
        <div ref={menuRef} className={styles.menu}>
          <div className={styles.menuHeader}>使い方ガイド</div>
          {TUTORIALS.map(t => {
            const done = completed.includes(t.id)
            return (
              <button
                key={t.id}
                className={styles.menuItem}
                onClick={() => {
                  setOpen(false)
                  onStartTutorial(t.id)
                }}
              >
                <span className={styles.menuIcon}>{t.icon}</span>
                <div className={styles.menuText}>
                  <span className={styles.menuLabel}>{t.title}</span>
                  <span className={styles.menuDesc}>{t.description}</span>
                </div>
                {done && <span className={styles.menuCheck}>✓</span>}
              </button>
            )
          })}
          <div className={styles.menuFooter}>
            ← → キーでも操作できます
          </div>
        </div>
      )}
    </div>
  )
}
