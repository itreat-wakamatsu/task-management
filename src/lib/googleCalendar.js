/**
 * Google Calendar API (gapi) ラッパー
 * OAuth トークンは Supabase Auth の provider_token を使用する
 * 401 エラー時は /api/refresh-token 経由で自動リフレッシュ
 */
import { supabase } from './supabase'

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'

// リフレッシュ済みトークンのキャッシュ（モジュールレベル）
let _refreshedToken = null
let _refreshedExpiry = 0

/** Supabase JWT を使って /api/refresh-token からアクセストークンを取得 */
async function refreshGoogleToken() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('NOT_AUTHENTICATED')

  const res = await fetch('/api/refresh-token', {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}` },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || 'TOKEN_REFRESH_FAILED')
  }

  const { access_token, expires_in } = await res.json()
  _refreshedToken = access_token
  _refreshedExpiry = Date.now() + (expires_in - 300) * 1000  // 5分バッファ
  return access_token
}

/** 有効なトークンを返す（リフレッシュ済み > セッションのprovider_token） */
function getBestToken(fallbackToken) {
  if (_refreshedToken && Date.now() < _refreshedExpiry) return _refreshedToken
  return fallbackToken
}

/**
 * Google API を fetch し、401 なら自動リフレッシュしてリトライ
 * fallbackToken が null でもリフレッシュトークン経由で自動取得する
 */
async function gFetch(url, options, fallbackToken) {
  let token = getBestToken(fallbackToken)

  // トークンが一切ない場合（ページリロード後など）はプロアクティブにリフレッシュ
  if (!token) {
    try {
      token = await refreshGoogleToken()
    } catch (e) {
      throw new Error('GOOGLE_AUTH_EXPIRED')
    }
  }

  const makeReq = (t) => fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${t}`,
      ...(options?.headers || {}),
    },
  })

  let res = await makeReq(token)

  if (res.status === 401) {
    // トークン期限切れ → リフレッシュしてリトライ
    let newToken
    try {
      newToken = await refreshGoogleToken()
    } catch (e) {
      throw new Error('GOOGLE_AUTH_EXPIRED')
    }
    res = await makeReq(newToken)
  }

  return res
}

/** 日付を JST の ISO 文字列に変換（YYYY-MM-DDT00:00:00+09:00） */
export function toJSTBoundary(date, isEnd = false) {
  const d = new Date(date)
  if (isEnd) {
    d.setHours(23, 59, 59, 999)
  } else {
    d.setHours(0, 0, 0, 0)
  }
  return d.toISOString()
}

/** 今日の予定を取得（date を省略すると当日） */
export async function fetchTodayEvents(accessToken, date = new Date()) {
  const today = new Date(date)
  const timeMin = toJSTBoundary(today, false)
  const timeMax = toJSTBoundary(today, true)

  const params = new URLSearchParams({
    calendarId:   'primary',
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy:      'startTime',
    maxResults:   '50',
    timeZone:     'Asia/Tokyo',
    fields:       'items(id,summary,start,end,htmlLink,organizer,attendees,guestsCanModify)',
  })

  const res = await gFetch(
    `${CALENDAR_API}/calendars/primary/events?${params}`,
    {},
    accessToken
  )

  if (!res.ok) {
    const err = await res.json()
    throw new Error(`Google Calendar API error: ${err.error?.message}`)
  }

  const data = await res.json()
  return (data.items || []).map(normalizeEvent)
}

/** 指定期間のイベントを取得 */
export async function fetchEventsRange(accessToken, dateFrom, dateTo) {
  const timeMin = toJSTBoundary(dateFrom, false)
  const timeMax = toJSTBoundary(dateTo, true)
  const params = new URLSearchParams({
    calendarId:   'primary',
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy:      'startTime',
    maxResults:   '200',
    timeZone:     'Asia/Tokyo',
    fields:       'items(id,summary,start,end,htmlLink,organizer,attendees,guestsCanModify)',
  })
  const res = await gFetch(
    `${CALENDAR_API}/calendars/primary/events?${params}`,
    {},
    accessToken
  )
  if (!res.ok) {
    const err = await res.json()
    throw new Error(`Google Calendar API error: ${err.error?.message}`)
  }
  const data = await res.json()
  return (data.items || []).map(normalizeEvent)
}

/** 新しいイベントを作成 */
export async function createCalendarEvent(accessToken, eventData) {
  const res = await gFetch(
    `${CALENDAR_API}/calendars/primary/events`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(eventData),
    },
    accessToken
  )

  if (!res.ok) {
    const err = await res.json()
    throw new Error(`Google Calendar API error: ${err.error?.message}`)
  }

  return normalizeEvent(await res.json())
}

/** イベントを更新（開始・終了時刻の変更） */
export async function updateCalendarEvent(accessToken, eventId, patch) {
  const res = await gFetch(
    `${CALENDAR_API}/calendars/primary/events/${eventId}`,
    {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(patch),
    },
    accessToken
  )

  if (!res.ok) {
    const err = await res.json()
    throw new Error(`Google Calendar API error: ${err.error?.message}`)
  }

  return normalizeEvent(await res.json())
}

/** GCal イベントを削除 */
export async function deleteCalendarEvent(accessToken, eventId) {
  const res = await gFetch(
    `${CALENDAR_API}/calendars/primary/events/${eventId}`,
    { method: 'DELETE' },
    accessToken
  )
  // 204 No Content が正常
  if (!res.ok && res.status !== 204) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`Google Calendar API error: ${err.error?.message}`)
  }
}


function normalizeEvent(ev) {
  const startRaw = ev.start?.dateTime || ev.start?.date
  const endRaw   = ev.end?.dateTime   || ev.end?.date

  const isOrganizer    = ev.organizer?.self === true
  const canEdit        = isOrganizer || ev.guestsCanModify === true
  const otherAttendees = (ev.attendees || [])
    .filter(a => !a.self)
    .map(a => ({ email: a.email, displayName: a.displayName || a.email }))
  const permissionType = !canEdit ? 'readonly'
    : otherAttendees.length > 0   ? 'multi'
    : 'solo'

  return {
    calendarEventId:    ev.id,
    calendarEventTitle: ev.summary || '（タイトルなし）',
    plannedStart:       startRaw ? new Date(startRaw) : null,
    plannedEnd:         endRaw   ? new Date(endRaw)   : null,
    isAllDay:           Boolean(ev.start?.date),
    htmlLink:           ev.htmlLink,
    permissionType,
    otherAttendees,
    canEdit,
  }
}
