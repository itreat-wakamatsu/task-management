/**
 * Google Calendar API (gapi) ラッパー
 * OAuth トークンは Supabase Auth の provider_token を使用する
 */

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'

function authHeader(token) {
  return { Authorization: `Bearer ${token}` }
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

/** 今日の予定を取得 */
export async function fetchTodayEvents(accessToken) {
  const today = new Date()
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
  })

  const res = await fetch(
    `${CALENDAR_API}/calendars/primary/events?${params}`,
    { headers: authHeader(accessToken) }
  )

  if (!res.ok) {
    const err = await res.json()
    throw new Error(`Google Calendar API error: ${err.error?.message}`)
  }

  const data = await res.json()
  return (data.items || []).map(normalizeEvent)
}

/** イベントを更新（開始・終了時刻の変更） */
export async function updateCalendarEvent(accessToken, eventId, patch) {
  const res = await fetch(
    `${CALENDAR_API}/calendars/primary/events/${eventId}`,
    {
      method:  'PATCH',
      headers: {
        ...authHeader(accessToken),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(patch),
    }
  )

  if (!res.ok) {
    const err = await res.json()
    throw new Error(`Google Calendar API error: ${err.error?.message}`)
  }

  return normalizeEvent(await res.json())
}

/** GCal イベントを内部形式に正規化 */
function normalizeEvent(ev) {
  const startRaw = ev.start?.dateTime || ev.start?.date
  const endRaw   = ev.end?.dateTime   || ev.end?.date
  return {
    calendarEventId:    ev.id,
    calendarEventTitle: ev.summary || '（タイトルなし）',
    plannedStart:       startRaw ? new Date(startRaw) : null,
    plannedEnd:         endRaw   ? new Date(endRaw)   : null,
    isAllDay:           Boolean(ev.start?.date),
    htmlLink:           ev.htmlLink,
  }
}
