import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useStore } from '@/store/useStore'
import { fetchTodayEvents, updateCalendarEvent, createCalendarEvent } from '@/lib/googleCalendar'
import { autoLink } from '@/lib/autoLink'
import { supabase } from '@/lib/supabase'
import DailyReportModal  from './DailyReportModal'
import TimerHero         from '@/components/Timer/TimerHero'
import TimerControls     from '@/components/Timer/TimerControls'
import TaskCard, { MergedTaskGroup } from './TaskCard'
import CalendarDayView   from './CalendarDayView'
import WeeklyView        from './WeeklyView'
import EventDetailPopup  from './EventDetailPopup'
import LinkModal         from '@/components/Modals/LinkModal'
import TaskEditModal     from '@/components/TaskManager/TaskEditModal'
import CreateEventModal  from '@/components/Modals/CreateEventModal'
import EventEditModal    from '@/components/Modals/EventEditModal'
import { supabase as _supabase } from '@/lib/supabase'
import styles from './TodayView.module.css'

const HIDDEN_KEY = 'hidden_calendar_events'
const TASK_STATUS_LABELS = ['未着手', '進行中', '完了', '保留中']

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
    devDate, rawCalEvents, rawCalDate, setRawCalEvents, addAppTask, updateAppTask,
    providerToken, clients,
  } = useStore()

  const targetDate = devDate ?? new Date()
  // UTC変換を避けてローカル日付文字列を生成
  const todayStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`

  const [loading,      setLoading]      = useState(true)
  const [authError,    setAuthError]    = useState(false)
  const [linkTarget,   setLinkTarget]   = useState(null)
  const [todayRecord,  setTodayRecord]  = useState(null)
  const [viewMode,     setViewMode]     = useState('list')
  const [hiddenIds,    setHiddenIds]    = useState(() => loadHiddenIds())
  const [showHidden,   setShowHidden]   = useState(false)
  const [refreshing,   setRefreshing]   = useState(false)
  const [detailTarget,    setDetailTarget]    = useState(null)
  const [editTask,        setEditTask]        = useState(null)
  const [editEventId,     setEditEventId]     = useState(null)
  const [editEventTarget, setEditEventTarget] = useState(null)
  const [showReport,      setShowReport]      = useState(false)
  const [resumeTarget,    setResumeTarget]    = useState(null)
  const [createSlot,      setCreateSlot]      = useState(null)
  const [weeklyRefreshKey, setWeeklyRefreshKey] = useState(0)
  const [summaryMode,      setSummaryMode]      = useState('consumed') // 'consumed' | 'remaining'
  const [, setSummaryTick]                     = useState(0)
  const [endDialogTarget,  setEndDialogTarget]  = useState(null) // タイマー終了ダイアログ対象
  const [startConfirmTarget, setStartConfirmTarget] = useState(null) // 開始確認ダイアログ対象
  const [listGroupMode,    setListGroupMode]    = useState('time') // 'time' | 'client'

  // サマリーバーを30秒ごとに更新（進行中タスクの経過時間反映）
  useEffect(() => {
    if (!activeEventId) return
    const id = setInterval(() => setSummaryTick(t => t + 1), 10000)
    return () => clearInterval(id)
  }, [activeEventId])

  const mergedOnceRef = useRef(false)
  useEffect(() => {
    mergedOnceRef.current = false
    loadToday()
  }, [devDate?.toDateString()])

  useEffect(() => {
    if (!mergedOnceRef.current && appTasks.length > 0 && rawCalEvents.length > 0) {
      mergedOnceRef.current = true
      loadToday(false)
    }
  }, [appTasks.length, rawCalEvents.length])

  async function fetchCalEvents(forceRefresh = false) {
    const token = providerToken || session?.provider_token
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

      const freshAppTasks = useStore.getState().appTasks
      const merged = calEvents
        .filter(ev => !ev.isAllDay)
        .map(ev => {
          const detail = details?.find(d => d.calendar_event_id === ev.calendarEventId)
          const linked = autoLink(ev.calendarEventTitle, freshAppTasks)
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
            task: freshAppTasks.find(t => t.id === (detail?.task_id ?? linked.taskId)) || null,
          }
        })

      setTodayEvents(merged)

      // 実行中タスクを復元（中断状態も含む）
      const running = merged.find(e => e.status === 'running')
      if (running) {
        setActiveEventId(running.id)
        // pauseLogの最後エントリがe:nullなら中断状態として復元
        const lastPause = running.pauseLog?.at(-1)
        if (lastPause && !lastPause.e) {
          setIsPaused(true)
          setPausedAt(lastPause.s)
          updateEvent(running.id, { status: 'paused' })
        }
      }
    } catch (err) {
      console.error('今日のデータ読み込みエラー:', err)
      if (err.message === 'GOOGLE_AUTH_EXPIRED') {
        setAuthError(true)
      }
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

    const token = providerToken || session?.provider_token
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

  // ── タスク開始（内部処理） ──
  // UIからは handleStartClick 経由で呼ぶ（ステータス確認が必要な場合はダイアログ経由）
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
    updateEvent(eventId, { status: 'running', actualStart: now, actualEnd: null, pauseLog: [], overrideElapsedMs: null })

    // app_tasks のステータスを「進行中」(1) に自動更新
    if (ev.taskId && ev.task?.status !== 1) {
      supabase.from('app_tasks').update({ status: 1 }).eq('id', ev.taskId)
      updateAppTask(ev.taskId, { status: 1 })
      updateEvent(eventId, { task: ev.task ? { ...ev.task, status: 1 } : ev.task })
    }

    if (ev.detailId) {
      await supabase
        .from('app_record_details')
        .update({ actual_start: now.toISOString(), actual_end: null, pause_log: [], override_elapsed_ms: null })
        .eq('id', ev.detailId)
    } else {
      const { data, error: startInsertErr } = await supabase
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
      if (startInsertErr) console.error('[handleStart] DB保存失敗:', startInsertErr)
      if (data) updateEvent(eventId, { detailId: data.id })
    }
  }, [activeEventId, todayEvents, todayRecord])

  // ── タスク開始（UIからの呼び出し）── 完了・保留中の場合は確認ダイアログを表示
  function handleStartClick(eventId) {
    const ev = todayEvents.find(e => e.id === eventId)
    if (!ev) return
    const taskStatus = ev.task?.status
    if (taskStatus === 2 || taskStatus === 3) {
      setStartConfirmTarget(ev)
      return
    }
    handleStart(eventId)
  }

  // ── タスク終了 ──
  // newTaskStatus: null=タスクステータス変更なし, 1=進行中, 2=完了, 3=保留中
  const handleEnd = useCallback(async (eventId, newTaskStatus = null) => {
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
    setEndDialogTarget(null)
    updateEvent(eventId, { status: 'done', actualEnd: now, pauseLog })

    if (ev.detailId) {
      await supabase
        .from('app_record_details')
        .update({ actual_end: now.toISOString(), pause_log: pauseLog, override_elapsed_ms: ev.overrideElapsedMs })
        .eq('id', ev.detailId)
    } else if (todayRecord && ev.actualStart) {
      // 開始時のDB保存に失敗していた場合、終了時に補完挿入する
      const { data: endInsert } = await supabase
        .from('app_record_details')
        .insert({
          record_id:            todayRecord.id,
          task_id:              ev.taskId,
          calendar_event_id:    ev.calendarEventId,
          calendar_event_title: ev.calendarEventTitle,
          planned_start:        ev.plannedStart?.toISOString(),
          planned_end:          ev.plannedEnd?.toISOString(),
          actual_start:         ev.actualStart?.toISOString(),
          actual_end:           now.toISOString(),
          pause_log:            pauseLog,
          override_elapsed_ms:  ev.overrideElapsedMs ?? null,
        })
        .select().single()
      if (endInsert) updateEvent(eventId, { detailId: endInsert.id })
    }

    // app_tasks のステータスを更新
    if (newTaskStatus !== null && ev.taskId) {
      supabase.from('app_tasks').update({ status: newTaskStatus }).eq('id', ev.taskId)
      updateAppTask(ev.taskId, { status: newTaskStatus })
      updateEvent(eventId, { task: ev.task ? { ...ev.task, status: newTaskStatus } : ev.task })
    }
  }, [todayEvents, isPaused])

  // ── 再開 ──
  // mode: 'continue' → 既存経過時間の続きから / 'fresh' → 0から新規
  const handleResume = useCallback(async (eventId, mode) => {
    if (activeEventId && activeEventId !== eventId) {
      await handleEnd(activeEventId)
    }
    const ev = todayEvents.find(e => e.id === eventId)
    if (!ev || !todayRecord) return

    const now = new Date()

    let newActualStart
    if (mode === 'continue') {
      // 既存の正味経過時間を計算して actualStart を逆算
      let alreadyMs = 0
      if (ev.overrideElapsedMs != null) {
        alreadyMs = ev.overrideElapsedMs
      } else if (ev.actualStart && ev.actualEnd) {
        const pausedMs = (ev.pauseLog || []).reduce((acc, p) => {
          if (p.s && p.e) return acc + (new Date(p.e) - new Date(p.s))
          return acc
        }, 0)
        alreadyMs = Math.max(0, ev.actualEnd - ev.actualStart - pausedMs)
      }
      newActualStart = new Date(now.getTime() - alreadyMs)
    } else {
      // fresh: 0から新規
      newActualStart = now
    }

    setActiveEventId(eventId)
    setIsPaused(false)
    setPausedAt(null)
    updateEvent(eventId, {
      status: 'running', actualStart: newActualStart, actualEnd: null,
      pauseLog: [], overrideElapsedMs: null,
    })

    if (ev.detailId) {
      await supabase.from('app_record_details')
        .update({
          actual_start: newActualStart.toISOString(), actual_end: null,
          pause_log: [], override_elapsed_ms: null,
        })
        .eq('id', ev.detailId)
    } else {
      const { data } = await supabase.from('app_record_details')
        .insert({
          record_id:            todayRecord.id,
          task_id:              ev.taskId,
          calendar_event_id:    ev.calendarEventId,
          calendar_event_title: ev.calendarEventTitle,
          planned_start:        ev.plannedStart?.toISOString(),
          planned_end:          ev.plannedEnd?.toISOString(),
          actual_start:         newActualStart.toISOString(),
          pause_log:            [],
        })
        .select().single()
      if (data) updateEvent(eventId, { detailId: data.id })
    }

    setResumeTarget(null)
  }, [activeEventId, todayEvents, todayRecord, isPaused])

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

  // ── 予定通り完了（予定所要時間を実績工数として記録） ──
  // ボタンを押した実時刻は無関係。「20分の予定 → 20分で完了」と記録する。
  // 未開始タスクにも対応（actualStart = now、detailレコードを新規作成）。
  const handleOnTime = useCallback(async (eventId) => {
    const ev = todayEvents.find(e => e.id === eventId)
    if (!ev) return

    const now = new Date()
    const actualStart = ev.actualStart || now
    const plannedDurationMs = new Date(ev.plannedEnd) - new Date(ev.plannedStart)
    const pauseLog = isPaused
      ? (ev.pauseLog || []).map((p, i) =>
          i === ev.pauseLog.length - 1 ? { ...p, e: now.toISOString() } : p
        )
      : (ev.pauseLog || [])

    setActiveEventId(null)
    setIsPaused(false)
    setPausedAt(null)
    updateEvent(eventId, {
      status: 'done',
      actualStart,
      actualEnd: now,
      overrideElapsedMs: plannedDurationMs,
      pauseLog,
    })

    if (ev.detailId) {
      await supabase
        .from('app_record_details')
        .update({
          actual_end:          now.toISOString(),
          pause_log:           pauseLog,
          override_elapsed_ms: plannedDurationMs,
        })
        .eq('id', ev.detailId)
    } else if (todayRecord) {
      const { data } = await supabase
        .from('app_record_details')
        .insert({
          record_id:            todayRecord.id,
          task_id:              ev.taskId,
          calendar_event_id:    ev.calendarEventId,
          calendar_event_title: ev.calendarEventTitle,
          planned_start:        ev.plannedStart?.toISOString(),
          planned_end:          ev.plannedEnd?.toISOString(),
          actual_start:         actualStart.toISOString(),
          actual_end:           now.toISOString(),
          pause_log:            [],
          override_elapsed_ms:  plannedDurationMs,
        })
        .select().single()
      if (data) updateEvent(eventId, { detailId: data.id })
    }

    // app_tasks を完了に
    if (ev.taskId) {
      supabase.from('app_tasks').update({ status: 2 }).eq('id', ev.taskId)
      updateAppTask(ev.taskId, { status: 2 })
      updateEvent(eventId, { task: ev.task ? { ...ev.task, status: 2 } : ev.task })
    }
  }, [todayEvents, isPaused, todayRecord])

  // ── カレンダー・週間ビューから新規予定作成 ──
  async function handleCreateFromCalendar({ title, start, end, task }) {
    const token = providerToken || session?.provider_token
    setCreateSlot(null)

    try {
      if (!token) throw new Error('トークンがありません')

      // Google Calendar にイベント作成
      const newEv = await createCalendarEvent(token, {
        summary: title,
        start:   { dateTime: start.toISOString(), timeZone: 'Asia/Tokyo' },
        end:     { dateTime: end.toISOString(),   timeZone: 'Asia/Tokyo' },
      })

      // 今日の日付のイベントなら todayEvents に追加
      const startDay = new Date(start); startDay.setHours(0,0,0,0)
      const todayDay = new Date(targetDate); todayDay.setHours(0,0,0,0)

      if (startDay.getTime() === todayDay.getTime()) {
        const updatedRaw = [...rawCalEvents, newEv]
        setRawCalEvents(updatedRaw, rawCalDate || todayStr)

        const mergedEv = {
          id:                  newEv.calendarEventId,
          calendarEventId:     newEv.calendarEventId,
          calendarEventTitle:  newEv.calendarEventTitle,
          plannedStart:        newEv.plannedStart,
          plannedEnd:          newEv.plannedEnd,
          isAllDay:            false,
          permissionType:      newEv.permissionType,
          otherAttendees:      newEv.otherAttendees,
          canEdit:             newEv.canEdit,
          detailId:            null,
          taskId:              task?.id || null,
          autoLinked:          false,
          actualStart:         null,
          actualEnd:           null,
          pauseLog:            [],
          overrideElapsedMs:   null,
          status:              'pending',
          task:                task || null,
        }
        setTodayEvents([...todayEvents, mergedEv].sort(
          (a, b) => new Date(a.plannedStart) - new Date(b.plannedStart)
        ))
      }

      // 週間ビューをリフレッシュ
      setWeeklyRefreshKey(k => k + 1)
    } catch (err) {
      console.error('カレンダー新規作成エラー:', err)
      alert('作成に失敗しました')
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

  const activeEvent    = todayEvents.find(e => e.id === activeEventId) || null
  const visibleEvents  = todayEvents.filter(e => !hiddenIds.has(e.id))
  const doneCount      = visibleEvents.filter(e => e.status === 'done').length
  const hiddenCount    = todayEvents.filter(e => hiddenIds.has(e.id)).length

  // ── サマリー計算 ──
  const now = Date.now()
  let totalPlannedMs   = 0
  let totalActualMs    = 0
  let remainingPlannedMs = 0

  for (const ev of todayEvents) {
    if (hiddenIds.has(ev.id)) continue   // 「隠す」にした予定は集計から除外
    const plannedDur = (ev.plannedEnd && ev.plannedStart)
      ? (new Date(ev.plannedEnd) - new Date(ev.plannedStart))
      : 0
    totalPlannedMs += plannedDur

    if (ev.status === 'done') {
      if (ev.overrideElapsedMs != null) {
        totalActualMs += ev.overrideElapsedMs
      } else if (ev.actualStart && ev.actualEnd) {
        const raw = new Date(ev.actualEnd) - new Date(ev.actualStart)
        const pausedMs = (ev.pauseLog || []).reduce((s, p) =>
          p.s && p.e ? s + new Date(p.e) - new Date(p.s) : s, 0)
        totalActualMs += Math.max(0, raw - pausedMs)
      }
    } else if (ev.status === 'running' || ev.status === 'paused') {
      if (ev.actualStart) {
        if (ev.overrideElapsedMs != null) {
          totalActualMs += ev.overrideElapsedMs
        } else {
          const raw = now - new Date(ev.actualStart)
          let pausedMs = (ev.pauseLog || []).reduce((s, p) =>
            p.s && p.e ? s + new Date(p.e) - new Date(p.s) : s, 0)
          if (ev.id === activeEventId && isPaused && pausedAt) {
            pausedMs += now - new Date(pausedAt)
          }
          totalActualMs += Math.max(0, raw - pausedMs)
        }
      }
      remainingPlannedMs += plannedDur
    } else {
      remainingPlannedMs += plannedDur
    }
  }

  function fmtHM(ms) {
    if (!ms || ms <= 0) return '0分'
    const totalMin = Math.round(ms / 60000)
    const h = Math.floor(totalMin / 60)
    const m = totalMin % 60
    if (h === 0) return `${m}分`
    if (m === 0) return `${h}h`
    return `${h}h${m}分`
  }

  const consumedPct = totalPlannedMs > 0 && isFinite(totalActualMs)
    ? Math.min(100, Math.round(totalActualMs / totalPlannedMs * 100))
    : 0
  const remainingCount = todayEvents.filter(e => e.status !== 'done' && !hiddenIds.has(e.id)).length

  // ── 一覧ビュー：タスクIDでグループ化（重複統合）＋クライアント別セクション ──
  function buildDisplaySections(events, hiddenIds, showHidden, groupMode) {
    const visible = events.filter(ev => showHidden || !hiddenIds.has(ev.id))

    const byTaskId = new Map()
    const noTask   = []
    for (const ev of visible) {
      if (!ev.taskId) {
        noTask.push(ev)
      } else {
        if (!byTaskId.has(ev.taskId)) byTaskId.set(ev.taskId, [])
        byTaskId.get(ev.taskId).push(ev)
      }
    }

    const groups = []
    for (const ev of noTask) {
      groups.push({ events: [ev], taskId: null, sortKey: new Date(ev.plannedStart).getTime() || 0 })
    }
    for (const [taskId, evs] of byTaskId) {
      const sorted = [...evs].sort((a, b) => new Date(a.plannedStart) - new Date(b.plannedStart))
      groups.push({ events: sorted, taskId, sortKey: new Date(sorted[0].plannedStart).getTime() || 0 })
    }
    groups.sort((a, b) => a.sortKey - b.sortKey)

    if (groupMode === 'time') return [{ clientId: null, groups }]

    // クライアント別グループ
    const byClient = new Map()
    const noClient = []
    for (const group of groups) {
      const clientId = group.events[0].task?.client_id ?? null
      if (!clientId) { noClient.push(group); continue }
      if (!byClient.has(clientId)) byClient.set(clientId, [])
      byClient.get(clientId).push(group)
    }
    const sections = []
    for (const [clientId, gs] of byClient) sections.push({ clientId, groups: gs })
    if (noClient.length > 0) sections.push({ clientId: null, groups: noClient })
    return sections
  }

  if (loading) {
    return <div className={styles.loading}>カレンダーを読み込んでいます...</div>
  }

  if (authError) {
    return (
      <div className={styles.authError}>
        <p className={styles.authErrorMsg}>
          Google カレンダーの認証が切れています。
        </p>
        <p className={styles.authErrorSub}>
          「再試行」で解決することがあります。解決しない場合は再ログインしてください。
        </p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '12px' }}>
          <button
            className={styles.authErrorBtn}
            style={{ background: '#F1F5F9', color: '#0F172A', border: '1.5px solid #CBD5E1' }}
            onClick={() => { setAuthError(false); loadToday(true) }}
          >
            再試行
          </button>
          <button
            className={styles.authErrorBtn}
            onClick={async () => { await supabase.auth.signOut() }}
          >
            再ログイン
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <TimerHero event={activeEvent} />
      {activeEvent && (
        <TimerControls event={activeEvent} onEnd={() => setEndDialogTarget(activeEvent)} />
      )}

      {/* ヘッダー行 */}
      <div className={styles.listHeader}>
        <span className={styles.listLabel}>本日のスケジュール</span>
        <div className={styles.headerRight}>
          <span className={styles.listCount}>{doneCount}/{visibleEvents.length} 完了</span>

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

          {/* グルーピング（一覧のみ） */}
          {viewMode === 'list' && (
            <div className={styles.viewToggle}>
              <button
                className={`${styles.viewBtn} ${listGroupMode === 'time' ? styles.viewBtnActive : ''}`}
                onClick={() => setListGroupMode('time')}
                title="時系列順"
              >時系列</button>
              <button
                className={`${styles.viewBtn} ${listGroupMode === 'client' ? styles.viewBtnActive : ''}`}
                onClick={() => setListGroupMode('client')}
                title="クライアント別"
              >クライアント別</button>
            </div>
          )}

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
            <button
              className={`${styles.viewBtn} ${viewMode === 'weekly' ? styles.viewBtnActive : ''}`}
              onClick={() => setViewMode('weekly')}
            >週間</button>
          </div>
        </div>
      </div>

      {/* 工数サマリーバー */}
      {todayEvents.length > 0 && (
        <div
          className={`${styles.summaryBar} ${summaryMode === 'remaining' ? styles.summaryBarRemaining : ''}`}
          onClick={() => setSummaryMode(m => m === 'consumed' ? 'remaining' : 'consumed')}
          role="button"
          tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && setSummaryMode(m => m === 'consumed' ? 'remaining' : 'consumed')}
          title="クリックで切替"
        >
          {summaryMode === 'consumed' ? (
            <>
              <span className={styles.summaryLabel}>実績</span>
              <span className={styles.summaryVal}>{fmtHM(totalActualMs)}</span>
              <div className={styles.summaryBar_track}>
                <div className={styles.summaryBar_fill} style={{ width: `${consumedPct}%` }} />
              </div>
              <span className={styles.summaryVal}>{fmtHM(totalPlannedMs)}</span>
              <span className={styles.summaryLabel}>予定</span>
              <span className={styles.summaryPct}>{consumedPct}%</span>
            </>
          ) : (
            <>
              <span className={styles.summaryLabel}>未完了</span>
              <span className={styles.summaryVal}>{fmtHM(remainingPlannedMs)}</span>
              <span className={styles.summaryDivider}>残り</span>
              <span className={styles.summaryVal}>{remainingCount}件</span>
              <span className={styles.summaryLabel}>が未完了</span>
              <span className={styles.summaryHint}>← 消費量に切替</span>
            </>
          )}
        </div>
      )}

      {/* リストビュー */}
      {viewMode === 'list' && (
        <div className={styles.list}>
          {todayEvents.length === 0 && (
            <div className={styles.empty}>
              今日の予定が見つかりません。Googleカレンダーに予定を追加してください。
            </div>
          )}
          {buildDisplaySections(todayEvents, hiddenIds, showHidden, listGroupMode).map((section, si) => (
            <React.Fragment key={si}>
              {section.clientId && (
                <div className={styles.clientGroupHeader}>
                  <span className={styles.clientGroupName}>
                    {(() => { const c = clients.find(x => x.id === section.clientId); return c?.display_name || c?.name || '–' })()}
                  </span>
                  <span className={styles.clientGroupLine} />
                </div>
              )}
              {section.groups.map(group => {
                if (group.events.length === 1) {
                  const ev = group.events[0]
                  return (
                    <TaskCard
                      key={ev.id}
                      event={ev}
                      isActive={ev.id === activeEventId}
                      isPaused={isPaused}
                      onStart={() => handleStartClick(ev.id)}
                      onEnd={() => handleEnd(ev.id)}
                      onUndo={() => handleUndo(ev.id)}
                      onOnTime={() => handleOnTime(ev.id)}
                      onResume={() => setResumeTarget(ev)}
                      onOpenLink={() => setLinkTarget(ev)}
                      onHide={toggleHide}
                      isHidden={hiddenIds.has(ev.id)}
                      onTimeChange={ev.canEdit !== false ? handleTimeChange : undefined}
                      onOpenDetail={setDetailTarget}
                    />
                  )
                }
                return (
                  <MergedTaskGroup
                    key={group.taskId}
                    events={group.events}
                    activeEventId={activeEventId}
                    isPaused={isPaused}
                    onStart={handleStartClick}
                    onEnd={handleEnd}
                    onUndo={handleUndo}
                    onOnTime={handleOnTime}
                    onResume={ev => setResumeTarget(ev)}
                    onOpenLink={ev => setLinkTarget(ev)}
                    onOpenDetail={setDetailTarget}
                  />
                )
              })}
            </React.Fragment>
          ))}
        </div>
      )}

      {/* 週間ビュー */}
      {viewMode === 'weekly' && (
        <WeeklyView
          onOpenDetail={setDetailTarget}
          refreshKey={weeklyRefreshKey}
          onCreateAt={(start, end) => setCreateSlot({ start, end })}
          hiddenIds={hiddenIds}
          showHidden={showHidden}
        />
      )}

      {/* カレンダービュー */}
      {viewMode === 'calendar' && (
        <CalendarDayView
          events={todayEvents}
          activeEventId={activeEventId}
          hiddenIds={hiddenIds}
          showHidden={showHidden}
          onStart={handleStartClick}
          onEnd={(id) => {
            const ev = todayEvents.find(e => e.id === id)
            if (ev) setEndDialogTarget(ev)
          }}
          onTimeChange={handleTimeChange}
          onHide={toggleHide}
          onOpenDetail={setDetailTarget}
          onCreateAt={(start, end) => setCreateSlot({ start, end })}
        />
      )}

      {/* 空き枠クリックからの新規予定作成（タスク紐付け優先） */}
      {createSlot && (
        <CreateEventModal
          slot={createSlot}
          onSave={handleCreateFromCalendar}
          onClose={() => setCreateSlot(null)}
        />
      )}

      {/* 予定編集モーダル */}
      {editEventTarget && (
        <EventEditModal
          event={editEventTarget}
          onUpdated={({ title, plannedStart, plannedEnd }) => {
            // todayEvents を更新
            updateEvent(editEventTarget.id || editEventTarget.calendarEventId, {
              calendarEventTitle: title,
              plannedStart,
              plannedEnd,
            })
            // rawCalEvents を更新
            if (rawCalEvents?.length) {
              setRawCalEvents(
                rawCalEvents.map(ev =>
                  ev.calendarEventId === editEventTarget.calendarEventId
                    ? { ...ev, calendarEventTitle: title, plannedStart, plannedEnd }
                    : ev
                ),
                rawCalDate
              )
            }
            setWeeklyRefreshKey(k => k + 1)
            setEditEventTarget(null)
          }}
          onDeleted={() => {
            const evId = editEventTarget.id || editEventTarget.calendarEventId
            setTodayEvents(todayEvents.filter(ev => ev.id !== evId))
            if (rawCalEvents?.length) {
              setRawCalEvents(
                rawCalEvents.filter(ev => ev.calendarEventId !== editEventTarget.calendarEventId),
                rawCalDate
              )
            }
            setWeeklyRefreshKey(k => k + 1)
            setEditEventTarget(null)
          }}
          onClose={() => setEditEventTarget(null)}
        />
      )}

      {/* 再開ダイアログ */}
      {resumeTarget && (
        <div className={styles.resumeOverlay} onClick={() => setResumeTarget(null)}>
          <div className={styles.resumeDialog} onClick={e => e.stopPropagation()}>
            <div className={styles.resumeTitle}>「{resumeTarget.calendarEventTitle}」を再開</div>
            <p className={styles.resumeDesc}>どこから計測を開始しますか？</p>
            <div className={styles.resumeActions}>
              <button
                className={styles.resumeBtnContinue}
                onClick={() => handleResume(resumeTarget.id, 'continue')}
              >
                <span className={styles.resumeBtnLabel}>使用済みの工数から継続</span>
                <span className={styles.resumeBtnHint}>既存の経過時間に加算して計測</span>
              </button>
              <button
                className={styles.resumeBtnFresh}
                onClick={() => handleResume(resumeTarget.id, 'fresh')}
              >
                <span className={styles.resumeBtnLabel}>次の工数から開始</span>
                <span className={styles.resumeBtnHint}>0からリセットして新規計測</span>
              </button>
            </div>
            <button className={styles.resumeCancel} onClick={() => setResumeTarget(null)}>キャンセル</button>
          </div>
        </div>
      )}

      {/* タイマー終了ダイアログ：タスクの次ステータスを選択 */}
      {endDialogTarget && (
        <div className={styles.endDialogOverlay} onClick={() => setEndDialogTarget(null)}>
          <div className={styles.endDialog} onClick={e => e.stopPropagation()}>
            <div className={styles.endDialogTitle}>タイマーを終了します</div>
            <div className={styles.endDialogTask}>{endDialogTarget.calendarEventTitle}</div>
            <p className={styles.endDialogDesc}>タスクのステータスを選択してください</p>
            <div className={styles.endDialogBtns}>
              <button
                className={`${styles.endBtn} ${styles.endBtnDone}`}
                onClick={() => handleEnd(endDialogTarget.id, 2)}
              >
                <span className={styles.endBtnIcon}>✅</span>
                <span className={styles.endBtnLabel}>完了</span>
                <span className={styles.endBtnHint}>作業が終わった</span>
              </button>
              <button
                className={`${styles.endBtn} ${styles.endBtnHold}`}
                onClick={() => handleEnd(endDialogTarget.id, 3)}
              >
                <span className={styles.endBtnIcon}>⏸</span>
                <span className={styles.endBtnLabel}>保留中</span>
                <span className={styles.endBtnHint}>対応待ち・いったん中断</span>
              </button>
              <button
                className={`${styles.endBtn} ${styles.endBtnInProgress}`}
                onClick={() => handleEnd(endDialogTarget.id, 1)}
              >
                <span className={styles.endBtnIcon}>▶</span>
                <span className={styles.endBtnLabel}>進行中のまま</span>
                <span className={styles.endBtnHint}>今日はここまで・明日続ける</span>
              </button>
            </div>
            <button className={styles.endDialogCancel} onClick={() => setEndDialogTarget(null)}>キャンセル</button>
          </div>
        </div>
      )}

      {/* タスク開始確認ダイアログ：完了・保留中のタスクを開始する場合 */}
      {startConfirmTarget && (
        <div className={styles.startConfirmOverlay} onClick={() => setStartConfirmTarget(null)}>
          <div className={styles.startConfirmDialog} onClick={e => e.stopPropagation()}>
            <div className={styles.endDialogTitle}>タスクを開始しますか？</div>
            <p className={styles.startConfirmDesc}>
              現在のステータスは
              <strong>「{TASK_STATUS_LABELS[startConfirmTarget.task?.status] ?? '不明'}」</strong>
              です。<br />開始すると「進行中」に変更されます。
            </p>
            <div className={styles.startConfirmActions}>
              <button
                className={styles.startConfirmCancel}
                onClick={() => setStartConfirmTarget(null)}
              >キャンセル</button>
              <button
                className={styles.startConfirmOk}
                onClick={() => {
                  const ev = startConfirmTarget
                  setStartConfirmTarget(null)
                  handleStart(ev.id)
                }}
              >開始する</button>
            </div>
          </div>
        </div>
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
          events={todayEvents.filter(e => !hiddenIds.has(e.id))}
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
          onEditEvent={ev => { setDetailTarget(null); setEditEventTarget(ev) }}
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
