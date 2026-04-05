import { useState, useEffect, useCallback } from 'react'
import { useStore } from '@/store/useStore'
import { fetchTodayEvents, updateCalendarEvent } from '@/lib/googleCalendar'
import { autoLink } from '@/lib/autoLink'
import { supabase } from '@/lib/supabase'
import DailyReportModal from './DailyReportModal'
import TimerHero        from '@/components/Timer/TimerHero'
import TimerControls    from '@/components/Timer/TimerControls'
import TaskCard         from './TaskCard'
import CalendarDayView  from './CalendarDayView'
import EventDetailPopup from './EventDetailPopup'
import LinkModal        from '@/components/Modals/LinkModal'
import TaskEditModal    from '@/components/TaskManager/TaskEditModal'
import { supabase as _supabase } from '@/lib/supabase'
import styles from './TodayView.module.css'

const HIDDEN_KEY = 'hidden_calendar_events'

function loadHiddenIds() {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY)
    return new Set(raw ? JSON.parse(raw) : [])
  } catch { return new Set() }
}

function saveHiddenIds(set) {
  localStorage.setItem(HIDDEN_KEY, JSON.stringify([...set]))
}

export default function TodayView() {
  const {
    session, todayEvents, setTodayEvents, activeEventId, setActiveEventId,
    isPaused, setIsPaused, setPausedAt, pausedAt, appTasks, updateEvent,
    devDate, rawCalEvents, rawCalDate, setRawCalEvents,
  } = useStore()

  const targetDate = devDate ?? new Date()
  const todayStr   = targetDate.toISOString().slice(0, 10)

  const [loading,      setLoading]      = useState(true)
  const [linkTarget,   setLinkTarget]   = useState(null)
  const [todayRecord,  setTodayRecord]  = useState(null)
  const [viewMode,     setViewMode]     = useState('list')
  const [hiddenIds,    setHiddenIds]    = useState(() => loadHiddenIds())
  const [showHidden,   setShowHidden]   = useState(false)
  const [refreshing,   setRefreshing]   = useState(false)
  const [detailTarget,  setDetailTarget]  = useState(null)
  const [editTask,      setEditTask]      = useState(null)
  const [editEventId,   setEditEventId]   = useState(null)
  const [showReport,    setShowReport]    = useState(false)

  useEffect(() => {
    loadToday()
  }, [devDate?.toDateString()])

  async function fetchCalEvents(forceRefresh = false) {
    const token = session?.provider_token
    if (!token) throw new Error('Google アクセストークンがありません')

    // キャッシュヒット
    if (!forceRefresh && rawCalDate === todayStr && rawCalEvents.length > 0) {
      return rawCalEvents
    }

    const events = await fetchTodayEvents(token, targetDate)
    setRawCalEvents(events, todayStr)
    return events
  }

  async function loadToday(forceRefresh = false) {
    setLoading(true)
    try {
      const calEvents = await fetchCalEvents(forceRefresh)

      // Supabase から app_record を取得 or 作成
      let { data: record } = await supabase
        .from('app_records')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('target_date', todayStr)
        .single()

      if (!record) {
        const { data: newRecord } = await supabase
          .from('app_records')
          .insert({ user_id: session.user.id, target_date: todayStr })
          .select()
          .single()
        record = newRecord
      }
      setTodayRecord(record)

      const { data: details } = await supabase
        .from('app_record_details')
        .select('*')
        .eq('record_id', record.id)

      const merged = calEvents
        .filter(ev => !ev.isAllDay)
        .map(ev => {
          const detail = details?.find(d => d.calendar_event_id === ev.calendarEventId)
          const linked = autoLink(ev.calendarEventTitle, appTasks)
          return {
            id:                  ev.calendarEventId,
            calendarEventId:     ev.calendarEventId,
            calendarEventTitle:  ev.calendarEventTitle,
            plannedStart:        ev.plannedStart,
            plannedEnd:          ev.plannedEnd,
            isAllDay:            ev.isAllDay,
            permissionType:      ev.permissionType,
            otherAttendees:      ev.otherAttendees,
            canEdit:             ev.canEdit,
            detailId:            detail?.id || null,
            taskId:              detail?.task_id ?? (linked.confidence === 'high' ? linked.taskId : null),
            autoLinked:          !detail?.task_id && linked.confidence === 'high',
            actualStart:         detail?.actual_start ? new Date(detail.actual_start) : null,
            actualEnd:           detail?.actual_end   ? new Date(detail.actual_end)   : null,
            pauseLog:            detail?.pause_log    || [],
            overrideElapsedMs:   detail?.override_elapsed_ms ?? null,
            status:              detail?.actual_end   ? 'done'
                               : detail?.actual_start ? 'running'
                               : 'pending',
            task: appTasks.find(t => t.id === (detail?.task_id ?? linked.taskId)) || null,
          }
        })

      setTodayEvents(merged)

      const running = merged.find(e => e.status === 'running')
      if (running) setActiveEventId(running.id)
    } catch (err) {
      console.error('今日のデータ読み込みエラー:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleRefresh() {
    setRefreshing(true)
    await loadToday(true)
    setRefreshing(false)
  }

  // ── 時間変更（リスト・カレンダー共通） ──
  const handleTimeChange = useCallback(async (eventId, newStart, newEnd) => {
    const ev = todayEvents.find(e => e.id === eventId)
    if (!ev) return

    if (ev.permissionType === 'readonly') {
      alert('この予定は編集できません（読み取り専用）')
      return
    }

    if (ev.permissionType === 'multi' && ev.otherAttendees?.length > 0) {
      const names = ev.otherAttendees.map(a => a.displayName).join('、')
      if (!window.confirm(`${names} さんも参加しています。本当に変更しますか？`)) return
    }

    // 楽観的更新
    const prevStart = ev.plannedStart
    const prevEnd   = ev.plannedEnd
    updateEvent(eventId, { plannedStart: newStart, plannedEnd: newEnd })

    const token = session?.provider_token
    if (!token) return

    try {
      await updateCalendarEvent(token, ev.calendarEventId, {
        start: { dateTime: newStart.toISOString(), timeZone: 'Asia/Tokyo' },
        end:   { dateTime: newEnd.toISOString(),   timeZone: 'Asia/Tokyo' },
      })

      // rawCalEvents もキャッシュ更新
      const updatedRaw = rawCalEvents.map(r =>
        r.calendarEventId === ev.calendarEventId
          ? { ...r, plannedStart: newStart, plannedEnd: newEnd }
          : r
      )
      setRawCalEvents(updatedRaw, rawCalDate)
    } catch (err) {
      console.error('Google Calendar 更新エラー:', err)
      // revert
      updateEvent(eventId, { plannedStart: prevStart, plannedEnd: prevEnd })
      alert('Google カレンダーの更新に失敗しました')
    }
  }, [todayEvents, session, rawCalEvents, rawCalDate])

  // ── 非表示トグル ──
  function toggleHide(eventId) {
    setHiddenIds(prev => {
      const next = new Set(prev)
      if (next.has(eventId)) next.delete(eventId)
      else next.add(eventId)
      saveHiddenIds(next)
      return next
    })
  }

  // ── タスク開始 ──
  const handleStart = useCallback(async (eventId) => {
    if (activeEventId && activeEventId !== eventId) {
      await handleEnd(activeEventId)
    }
    const ev = todayEvents.find(e => e.id === eventId)
    if (!ev || !todayRecord) return

    const now = new Date()
    setActiveEventId(eventId)
    setIsPaused(false)
    setPausedAt(null)
    updateEvent(eventId, { status: 'running', actualStart: now, actualEnd: null, pauseLog: [] })

    if (ev.detailId) {
      await supabase
        .from('app_record_details')
        .update({ actual_start: now.toISOString(), actual_end: null, pause_log: [] })
        .eq('id', ev.detailId)
    } else {
      const { data } = await supabase
        .from('app_record_details')
        .insert({
          record_id:            todayRecord.id,
          task_id:              ev.taskId,
          calendar_event_id:    ev.calendarEventId,
          calendar_event_title: ev.calendarEventTitle,
          planned_start:        ev.plannedStart?.toISOString(),
          planned_end:          ev.plannedEnd?.toISOString(),
          actual_start:         now.toISOString(),
          pause_log:            [],
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
        .update({ actual_end: now.toISOString(), pause_log: pauseLog, override_elapsed_ms: ev.overrideElapsedMs })
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

  // ── タスク紐付け ──
  async function handleLinked(eventId, task, isUnlink) {
    const ev = todayEvents.find(e => e.id === eventId)
    if (!ev) return
    const newTaskId = isUnlink ? null : task?.id
    updateEvent(eventId, { taskId: newTaskId, autoLinked: false, task: isUnlink ? null : task })
    if (ev.detailId) {
      await supabase.from('app_record_details').update({ task_id: newTaskId }).eq('id', ev.detailId)
    } else if (todayRecord && newTaskId) {
      const { data } = await supabase
        .from('app_record_details')
        .insert({
          record_id:            todayRecord.id,
          task_id:              newTaskId,
          calendar_event_id:    ev.calendarEventId,
          calendar_event_title: ev.calendarEventTitle,
          planned_start:        ev.plannedStart?.toISOString(),
          planned_end:          ev.plannedEnd?.toISOString(),
          pause_log:            [],
        })
        .select()
        .single()
      if (data) updateEvent(eventId, { detailId: data.id })
    }
  }

  const activeEvent = todayEvents.find(e => e.id === activeEventId) || null
  const doneCount   = todayEvents.filter(e => e.status === 'done').length
  const hiddenCount = todayEvents.filter(e => hiddenIds.has(e.id)).length

  if (loading) {
    return <div className={styles.loading}>カレンダーを読み込んでいます...</div>
  }

  return (
    <div>
      <TimerHero event={activeEvent} />
      {activeEvent && (
        <TimerControls event={activeEvent} onEnd={() => handleEnd(activeEvent.id)} />
      )}

      {/* ヘッダー行 */}
      <div className={styles.listHeader}>
        <span className={styles.listLabel}>本日のスケジュール</span>
        <div className={styles.headerRight}>
          <span className={styles.listCount}>{doneCount}/{todayEvents.length} 完了</span>

          {/* 非表示トグル */}
          {hiddenCount > 0 && (
            <button
              className={`${styles.btnToggleHidden} ${showHidden ? styles.btnToggleHiddenActive : ''}`}
              onClick={() => setShowHidden(v => !v)}
            >
              {showHidden ? `非表示を隠す` : `非表示 ${hiddenCount}件を表示`}
            </button>
          )}

          {/* 報告書 */}
          <button className={styles.btnReport} onClick={() => setShowReport(true)}>
            報告書
          </button>

          {/* 手動更新 */}
          <button
            className={styles.btnRefresh}
            onClick={handleRefresh}
            disabled={refreshing}
            title="Googleカレンダーを再取得"
          >
            {refreshing ? '更新中…' : '↺ 更新'}
          </button>

          {/* ビュー切替 */}
          <div className={styles.viewToggle}>
            <button
              className={`${styles.viewBtn} ${viewMode === 'list' ? styles.viewBtnActive : ''}`}
              onClick={() => setViewMode('list')}
            >一覧</button>
            <button
              className={`${styles.viewBtn} ${viewMode === 'calendar' ? styles.viewBtnActive : ''}`}
              onClick={() => setViewMode('calendar')}
            >カレンダー</button>
          </div>
        </div>
      </div>

      {/* リストビュー */}
      {viewMode === 'list' && (
        <div className={styles.list}>
          {todayEvents.length === 0 && (
            <div className={styles.empty}>
              今日の予定が見つかりません。Googleカレンダーに予定を追加してください。
            </div>
          )}
          {todayEvents
            .filter(ev => showHidden || !hiddenIds.has(ev.id))
            .map(ev => (
              <TaskCard
                key={ev.id}
                event={ev}
                isActive={ev.id === activeEventId}
                isPaused={isPaused}
                onStart={() => handleStart(ev.id)}
                onEnd={() => handleEnd(ev.id)}
                onUndo={() => handleUndo(ev.id)}
                onOpenLink={() => setLinkTarget(ev)}
                onHide={toggleHide}
                isHidden={hiddenIds.has(ev.id)}
                onTimeChange={ev.canEdit !== false ? handleTimeChange : undefined}
                onOpenDetail={setDetailTarget}
              />
            ))
          }
        </div>
      )}

      {/* カレンダービュー */}
      {viewMode === 'calendar' && (
        <CalendarDayView
          events={todayEvents}
          activeEventId={activeEventId}
          hiddenIds={hiddenIds}
          showHidden={showHidden}
          onStart={handleStart}
          onEnd={handleEnd}
          onTimeChange={handleTimeChange}
          onHide={toggleHide}
          onOpenDetail={setDetailTarget}
        />
      )}

      {linkTarget && (
        <LinkModal
          event={linkTarget}
          onClose={() => setLinkTarget(null)}
          onLinked={(task, isUnlink) => handleLinked(linkTarget.id, task, isUnlink)}
        />
      )}

      {/* 報告書モーダル */}
      {showReport && (
        <DailyReportModal
          events={todayEvents}
          dateStr={todayStr}
          onClose={() => setShowReport(false)}
        />
      )}

      {/* 詳細ポップアップ */}
      {detailTarget && (
        <EventDetailPopup
          event={detailTarget}
          onClose={() => setDetailTarget(null)}
          onEdit={task => { const evId = detailTarget?.id; setDetailTarget(null); setEditTask(task); setEditEventId(evId) }}
          onOpenLink={() => { setDetailTarget(null); setLinkTarget(detailTarget) }}
        />
      )}

      {/* 今日タブからのタスク編集モーダル */}
      {editTask && (
        <TaskEditModal
          task={editTask}
          onSave={async patch => {
            const { supabase } = await import('@/lib/supabase')
            await supabase.from('app_tasks').update(patch).eq('id', editTask.id)
            // todayEvents のタスク情報を更新（イベントIDで照合）
            if (editEventId) updateEvent(editEventId, { task: { ...editTask, ...patch } })
            setEditTask(null); setEditEventId(null)
          }}
          onClose={() => setEditTask(null)}
        />
      )}
    </div>
  )
}
