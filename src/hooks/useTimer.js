import { useEffect, useRef, useCallback } from 'react'
import { useStore } from '@/store/useStore'

/** カウントダウン・経過時間を毎秒更新するフック */
export function useTimer(onTick) {
  const intervalRef = useRef(null)
  const activeEventId = useStore(s => s.activeEventId)

  const start = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => {
      onTick?.()
    }, 1000)
  }, [onTick])

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  useEffect(() => {
    if (activeEventId) {
      start()
    } else {
      stop()
    }
    return stop
  }, [activeEventId, start, stop])

  return { start, stop }
}

/** イベントの正味経過時間(ms)を計算 */
export function calcNetElapsed(event, isPaused, pausedAt) {
  if (!event?.actualStart) return 0
  const now  = new Date()
  const total = now - new Date(event.actualStart)
  let paused  = 0

  for (const p of (event.pauseLog || [])) {
    if (p.s && p.e) paused += new Date(p.e) - new Date(p.s)
  }
  // 現在一時停止中
  if (isPaused && pausedAt) paused += now - new Date(pausedAt)

  return Math.max(0, total - paused)
}

/** 表示用経過時間を返す（手動上書きがあればそちらを優先） */
export function getDisplayElapsed(event, isPaused, pausedAt) {
  if (event?.overrideElapsedMs != null) return event.overrideElapsedMs
  return calcNetElapsed(event, isPaused, pausedAt)
}

/** ms → "MM:SS" or "H:MM:SS" */
export function formatCountdown(ms, withSign = false) {
  const neg  = ms < 0
  const abs  = Math.abs(ms)
  const h    = Math.floor(abs / 3_600_000)
  const m    = Math.floor((abs % 3_600_000) / 60_000)
  const s    = Math.floor((abs % 60_000) / 1_000)
  const sign = withSign && neg ? '+' : ''
  if (h > 0) {
    return `${sign}${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${sign}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** ms → "Xh Ym" or "Ym" */
export function formatDuration(ms) {
  const m = Math.round(Math.abs(ms) / 60_000)
  const h = Math.floor(m / 60)
  const rm = m % 60
  if (h > 0) return rm > 0 ? `${h}h${rm}m` : `${h}h`
  return `${m}分`
}
