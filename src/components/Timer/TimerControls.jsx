import { useState } from 'react'
import { useStore } from '@/store/useStore'
import { getDisplayElapsed, formatDuration } from '@/hooks/useTimer'
import styles from './TimerControls.module.css'

export default function TimerControls({ event, onEnd }) {
  const { isPaused, setIsPaused, setPausedAt, pausedAt, updateEvent } = useStore()
  const [adjOpen, setAdjOpen] = useState(false)

  if (!event) return null

  const planned   = Math.round((new Date(event.plannedEnd) - new Date(event.plannedStart)) / 60000)
  const displayed = Math.round(getDisplayElapsed(event, isPaused, pausedAt) / 60000)

  function handlePause() {
    const now = new Date().toISOString()
    if (!isPaused) {
      // 一時停止
      setIsPaused(true)
      setPausedAt(now)
      const log = [...(event.pauseLog || []), { s: now, e: null }]
      updateEvent(event.id, { pauseLog: log, status: 'paused' })
    } else {
      // 再開
      const log = (event.pauseLog || []).map((p, i) =>
        i === event.pauseLog.length - 1 ? { ...p, e: now } : p
      )
      setIsPaused(false)
      setPausedAt(null)
      updateEvent(event.id, { pauseLog: log, status: 'running' })
    }
  }

  function handleReset() {
    updateEvent(event.id, { overrideElapsedMs: 0 })
    const sl = document.getElementById('adj-slider')
    if (sl) sl.value = 0
  }

  function handleSlider(val) {
    updateEvent(event.id, { overrideElapsedMs: parseInt(val) * 60000 })
  }

  return (
    <div className={styles.wrap}>
      {/* メインコントロール */}
      <div className={styles.row}>
        <button
          className={`${styles.btnPause} ${isPaused ? styles.pausing : ''}`}
          onClick={handlePause}
        >
          {isPaused ? '▶ 再開' : '⏸ 中断'}
        </button>
        <button className={styles.btnEnd} onClick={onEnd}>
          終了
        </button>
        <button className={styles.btnReset} onClick={handleReset} title="経過時間をリセット">
          ↺
        </button>
      </div>

      {/* 時間調整トグル */}
      <div className={styles.adjToggleRow}>
        <button
          className={styles.adjToggle}
          onClick={() => setAdjOpen(v => !v)}
        >
          ⚙ 時間を調整{adjOpen ? ' ▲' : ' ▼'}
        </button>
      </div>

      {/* スライダー */}
      {adjOpen && (
        <div className={styles.adjBox}>
          <div className={styles.adjHeader}>
            <span className={styles.adjLabel}>正味作業時間を調整（ドラッグ）</span>
            <span className={styles.adjVal}>
              {formatDuration((event.overrideElapsedMs ?? displayed * 60000))}
            </span>
          </div>
          <input
            id="adj-slider"
            type="range"
            className={styles.slider}
            min={0}
            max={Math.max(planned * 2, 60)}
            step={1}
            defaultValue={displayed}
            onInput={e => handleSlider(e.target.value)}
          />
          <p className={styles.adjHint}>
            スライダーで正味作業時間を修正できます。実際の開始・終了時刻の記録には影響しません。
          </p>
        </div>
      )}
    </div>
  )
}
