import { useState, useEffect, useCallback } from 'react'
import { useStore } from '@/store/useStore'
import { fetchTodayEvents, updateCalendarEvent } from '@/lib/googleCalendar'
import { autoLink } from '@/lib/autoLink'
import { supabase } from '@/lib/supabase'
import TimerHero     from '@/components/Timer/TimerHero'
import TimerControls from '@/components/Timer/TimerControls'
import TaskCard      from './TaskCard'
import LinkModal     from '@/components/Modals/LinkModal'
import styles from './TodayView.module.css'

export default function TodayView() {
  const {
    session, todayEvents, setTodayEvents, activeEventId, setActiveEventId,
    isPaused, setIsPaused, setPausedAt, pausedAt, appTasks, updateEvent,
  } = useStore()

  const [loading,     setLoading]     = useState(true)
  const [linkTarget,  setLinkTarget]  = useState(null)  // LinkModal 用
  const [todayRecord, setTodayRecord] = useState(null)  // app_records の行

  // ── データ読み込み ──
  useEffect(() => {
    loadToday()
  }, [])

  async function loadToday() {
    setLoading(true)
    try {
      const token = session?.provider_token
      if (!token) throw new Error('Google アクセストークンがありません')

      // 1. Google Calendar から今日の予定を取得
      const calEvents = await fetchTodayEvents(token)

      // 2. 今日の app_record を取得（または作成）
      const today = new Date().toISOString().slice(0, 10)
      let { data: record } = await supabase
        .from('app_records')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('target_date', today)
        .single()

      if (!record) {
        const { data: newRecord } = await supabase
          .from('app_records')
          .insert({ user_id: session.user.id, target_date: today })
          .select()
          .single()
        record = newRecord
      }
      setTodayRecord(record)

      // 3. 既存の実績詳細を取得
      const { data: details } = await supabase
        .from('app_record_details')
        .select('*')
        .eq('record_id', record.id)

      // 4. カレンダーイベントと実績詳細をマージ
      const merged = calEvents
        .filter(ev => !ev.isAllDay)
        .map(ev => {
          const detail = details?.find(d => d.calendar_event_id === ev.calendarEventId)
          const linked = autoLink(ev.calendarEventTitle, appTasks)

          return {
            id:                 ev.calendarEventId,
            calendarEventId:    ev.calendarEventId,
            calendarEventTitle: ev.calendarEventTitle,
            plannedStart:       ev.plannedStart,
            plannedEnd:         ev.plannedEnd,
            // 実績データ
            detailId:           detail?.id || null,
            taskId:             detail?.task_id ?? (linked.confidence === 'high' ? linked.taskId : null),
            autoLinked:         !detail?.task_id && linked.confidence === 'high',
            actualStart:        detail?.actual_start ? new Date(detail.actual_start) : null,
            actualEnd:          detail?.actual_end   ? new Date(detail.actual_end)   : null,
            pauseLog:           detail?.pause_log    || [],
            overrideElapsedMs:  detail?.override_elapsed_ms ?? null,
            status:             detail?.actual_end   ? 'done'
                              : detail?.actual_start ? 'running'
                              : 'pending',
            // タスクマスタ情報（表示用）
            task:               appTasks.find(t => t.id === (detail?.task_id ?? linked.taskId)) || null,
          }
        })

      setTodayEvents(merged)

      // 実行中タスクを復元
      const running = merged.find(e => e.status === 'running')
      if (running) setActiveEventId(running.id)

    } catch (err) {
      console.error('今日のデータ読み込みエラー:', err)
    } finally {
      setLoading(false)
    }
  }

  // ── タスク開始 ──
  const handleStart = useCallback(async (eventId) => {
    // 既存のアクティブタスクを終了
    if (activeEventId && activeEventId !== eventId) {
      await handleEnd(activeEventId)
    }

    const ev = todayEvents.find(e => e.id === eventId)
    if (!ev || !todayRecord) return

    const now = new Date()
    setActiveEventId(eventId)
    setIsPaused(false)
    setPausedAt(null)
    updateEvent(eventId, {
      status:      'running',
      actualStart: now,
      actualEnd:   null,
      pauseLog:    [],
    })

    // DB に保存（upsert）
    if (ev.detailId) {
      await supabase
        .from('app_record_details')
        .update({ actual_start: now.toISOString(), actual_end: null, pause_log: [] })
        .eq('id', ev.detailId)
    } else {
      const { data } = await supabase
        .from('app_record_details')
        .insert({
          record_id:           todayRecord.id,
          task_id:             ev.taskId,
          calendar_event_id:   ev.calendarEventId,
          calendar_event_title: ev.calendarEventTitle,
          planned_start:       ev.plannedStart?.toISOString(),
          planned_end:         ev.plannedEnd?.toISOString(),
          actual_start:        now.toISOString(),
          pause_log:           [],
        })
        .select()
        .single()
      if (data) updateEvent(eventId, { detailId: data.id })
    }
  }, [activeEventId, todayEvents, todayRecord])

  // ── タスク終了 ──
  const handleEnd = useCallback(async (eventId) => {
    const ev = todayEvents.find(e => e.id === eventId)
    if (!ev) return

    const now = new Date()
    const pauseLog = isPaused
      ? (ev.pauseLog || []).map((p, i) =>
          i === ev.pauseLog.length - 1 ? { ...p, e: now.toISOString() } : p
        )
      : ev.pauseLog

    setActiveEventId(null)
    setIsPaused(false)
    setPausedAt(null)
    updateEvent(eventId, { status: 'done', actualEnd: now, pauseLog })

    if (ev.detailId) {
      await supabase
        .from('app_record_details')
        .update({
          actual_end:          now.toISOString(),
          pause_log:           pauseLog,
          override_elapsed_ms: ev.overrideElapsedMs,
        })
        .eq('id', ev.detailId)
    }
  }, [todayEvents, isPaused])

  // ── 取消 ──
  async function handleUndo(eventId) {
    const ev = todayEvents.find(e => e.id === eventId)
    if (!ev) return
    updateEvent(eventId, { status: 'pending', actualStart: null, actualEnd: null, pauseLog: [] })
    if (ev.detailId) {
      await supabase
        .from('app_record_details')
        .update({ actual_start: null, actual_end: null, pause_log: [] })
        .eq('id', ev.detailId)
    }
  }

  // ── タスク紐付け確定 ──
  async function handleLinked(eventId, task, isUnlink) {
    const ev = todayEvents.find(e => e.id === eventId)
    if (!ev) return

    const newTaskId = isUnlink ? null : task?.id
    updateEvent(eventId, {
      taskId:    newTaskId,
      autoLinked: false,
      task:      isUnlink ? null : task,
    })

    if (ev.detailId) {
      await supabase
        .from('app_record_details')
        .update({ task_id: newTaskId })
        .eq('id', ev.detailId)
    }
  }

  const activeEvent = todayEvents.find(e => e.id === activeEventId) || null
  const doneCount   = todayEvents.filter(e => e.status === 'done').length

  if (loading) {
    return <div className={styles.loading}>カレンダーを読み込んでいます...</div>
  }

  return (
    <div>
      {/* タイマーヒーロー */}
      <TimerHero event={activeEvent} />

      {/* コントロール */}
      {activeEvent && (
        <TimerControls
          event={activeEvent}
          onEnd={() => handleEnd(activeEvent.id)}
        />
      )}

      {/* タスクリスト */}
      <div className={styles.listHeader}>
        <span className={styles.listLabel}>本日のスケジュール</span>
        <span className={styles.listCount}>{doneCount}/{todayEvents.length} 完了</span>
      </div>

      <div className={styles.list}>
        {todayEvents.length === 0 && (
          <div className={styles.empty}>
            今日の予定が見つかりません。Googleカレンダーに予定を追加してください。
          </div>
        )}
        {todayEvents.map(ev => (
          <TaskCard
            key={ev.id}
            event={ev}
            isActive={ev.id === activeEventId}
            isPaused={isPaused}
            onStart={() => handleStart(ev.id)}
            onEnd={() => handleEnd(ev.id)}
            onUndo={() => handleUndo(ev.id)}
            onOpenLink={() => setLinkTarget(ev)}
          />
        ))}
      </div>

      {/* 紐付けモーダル */}
      {linkTarget && (
        <LinkModal
          event={linkTarget}
          onClose={() => setLinkTarget(null)}
          onLinked={(task, isUnlink) => handleLinked(linkTarget.id, task, isUnlink)}
        />
      )}
    </div>
  )
}
