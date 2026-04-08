import { useState, useEffect, useCallback, useRef } from 'react'
import { markTutorialCompleted } from './tutorialData'
import styles from './TutorialOverlay.module.css'

/**
 * チュートリアルオーバーレイ（ハンズオン対応版）
 *
 * Props:
 *   tutorial  - tutorialData.js の TUTORIALS 要素
 *   onClose   - 閉じるコールバック
 *   onDismiss - 「今後表示しない」コールバック
 */
export default function TutorialOverlay({ tutorial, onClose, onDismiss }) {
  const [step, setStep] = useState(0)
  const [highlightRect, setHighlightRect] = useState(null)
  const popoverRef = useRef(null)

  const current = tutorial.steps[step]
  const isFirst = step === 0
  const isLast  = step === tutorial.steps.length - 1
  const progress = ((step + 1) / tutorial.steps.length) * 100
  const isInteractive = !!current.clickTarget

  // ── ハイライト対象の位置を計算 ──
  const updateHighlight = useCallback(() => {
    if (!current.highlight) {
      setHighlightRect(null)
      return
    }
    const el = document.querySelector(current.highlight)
    if (!el) {
      setHighlightRect(null)
      return
    }
    const rect = el.getBoundingClientRect()
    setHighlightRect({
      top: rect.top - 6,
      left: rect.left - 6,
      width: rect.width + 12,
      height: rect.height + 12,
    })
  }, [current.highlight])

  useEffect(() => {
    updateHighlight()
    window.addEventListener('resize', updateHighlight)
    window.addEventListener('scroll', updateHighlight)
    return () => {
      window.removeEventListener('resize', updateHighlight)
      window.removeEventListener('scroll', updateHighlight)
    }
  }, [updateHighlight])

  // ── インタラクティブ: スポットライト領域クリック → 実UIを操作 → 次ステップ ──
  function handleSpotlightClick() {
    if (!isInteractive) return
    const targetEl = document.querySelector(current.clickTarget)
    if (!targetEl) return

    // 実際のUI要素をクリックさせる
    targetEl.click()

    // 少し待ってから次ステップへ
    setTimeout(() => {
      if (isLast) {
        markTutorialCompleted(tutorial.id)
        onClose()
      } else {
        setStep(s => s + 1)
      }
    }, 350)
  }

  // ── キーボード ──
  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') onClose()
      // インタラクティブなステップでは矢印キーでの進行を無効化
      if (!isInteractive) {
        if (e.key === 'ArrowRight' && !isLast) setStep(s => s + 1)
        if (e.key === 'ArrowLeft' && !isFirst) setStep(s => s - 1)
      } else {
        if (e.key === 'ArrowLeft' && !isFirst) setStep(s => s - 1)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isFirst, isLast, isInteractive, onClose])

  function handleNext() {
    if (isLast) {
      markTutorialCompleted(tutorial.id)
      onClose()
    } else {
      setStep(s => s + 1)
    }
  }

  function handlePrev() {
    if (!isFirst) setStep(s => s - 1)
  }

  // ── ポップオーバーの位置 ──
  function getPopoverStyle() {
    if (!highlightRect || current.placement === 'center') {
      return {}
    }

    const pad = 16

    switch (current.placement) {
      case 'bottom':
        return {
          top: highlightRect.top + highlightRect.height + pad,
          left: Math.max(pad, Math.min(
            highlightRect.left + highlightRect.width / 2 - 200,
            window.innerWidth - 400 - pad
          )),
        }
      case 'top':
        return {
          bottom: window.innerHeight - highlightRect.top + pad,
          left: Math.max(pad, Math.min(
            highlightRect.left + highlightRect.width / 2 - 200,
            window.innerWidth - 400 - pad
          )),
        }
      default:
        return {}
    }
  }

  const isCentered = !highlightRect || current.placement === 'center'

  return (
    <div className={styles.overlay}>
      {/* 半透明背景 */}
      <div className={styles.backdrop} />

      {/* スポットライト（ハイライト穴あき） */}
      {highlightRect && (
        <div
          className={`${styles.spotlight} ${isInteractive ? styles.spotlightClickable : ''}`}
          style={highlightRect}
          onClick={isInteractive ? handleSpotlightClick : undefined}
        />
      )}

      {/* ポップオーバー */}
      <div
        ref={popoverRef}
        key={step}
        className={`${styles.popover} ${isCentered ? styles.popoverCenter : styles.popoverPositioned}`}
        style={isCentered ? {} : getPopoverStyle()}
      >
        {/* ヘッダー */}
        <div className={styles.popoverHeader}>
          <span className={styles.tutorialTitle}>{tutorial.title}</span>
          <button className={styles.closeBtn} onClick={onClose} title="閉じる">
            ✕
          </button>
        </div>

        {/* プログレスバー */}
        <div className={styles.progressTrack}>
          <div className={styles.progressBar} style={{ width: `${progress}%` }} />
        </div>

        {/* コンテンツ */}
        <div className={styles.content}>
          {current.icon && (
            <span className={styles.stepIcon}>{current.icon}</span>
          )}
          <h3 className={styles.stepTitle}>{current.title}</h3>
          <p className={styles.stepBody}>
            {current.body.split('\n').map((line, i) => (
              <span key={i}>
                {line}
                {i < current.body.split('\n').length - 1 && <br />}
              </span>
            ))}
          </p>

          {/* インタラクティブ: アクションを促す */}
          {isInteractive && current.actionLabel && (
            <div className={styles.actionHint}>
              <span className={styles.actionPulse} />
              {current.actionLabel}
            </div>
          )}
        </div>

        {/* フッター */}
        <div className={styles.footer}>
          <div className={styles.footerLeft}>
            <span className={styles.stepCount}>
              {step + 1} / {tutorial.steps.length}
            </span>
          </div>
          <div className={styles.footerRight}>
            {!isFirst && (
              <button className={styles.btnSecondary} onClick={handlePrev}>
                ← 戻る
              </button>
            )}
            {isInteractive ? (
              <span className={styles.waitingLabel}>操作を待っています…</span>
            ) : (
              <button className={styles.btnPrimary} onClick={handleNext}>
                {isLast ? '完了 ✓' : '次へ →'}
              </button>
            )}
          </div>
        </div>

        {/* 後にする / 今後表示しない（最初のステップのみ） */}
        {isFirst && (
          <div className={styles.dismissRow}>
            <button className={styles.btnDismiss} onClick={onClose}>
              後にする
            </button>
            <span className={styles.dismissDot}>・</span>
            <button className={styles.btnDismiss} onClick={onDismiss}>
              今後表示しない
            </button>
          </div>
        )}

        {/* インタラクティブステップでスキップリンク */}
        {isInteractive && (
          <div className={styles.skipRow}>
            <button className={styles.btnSkip} onClick={handleNext}>
              スキップ →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
