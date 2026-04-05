/**
 * Task Management MCP Server
 *
 * 必要な環境変数:
 *   SUPABASE_URL              Supabase プロジェクト URL
 *   SUPABASE_SERVICE_ROLE_KEY サービスロールキー（管理者権限）
 *   SUPABASE_USER_ID          対象ユーザーの UUID
 *
 * 任意（Google Calendar 使用時）:
 *   GOOGLE_CLIENT_ID          Google OAuth クライアントID（推奨）
 *   GOOGLE_CLIENT_SECRET      Google OAuth クライアントシークレット（推奨）
 *     → 設定するとアプリログイン時に保存した refresh_token で自動更新される
 *   GOOGLE_ACCESS_TOKEN       アクセストークン直接指定（非推奨・1時間で期限切れ）
 *   WORK_START_HOUR           勤務開始時刻（デフォルト 9）
 *   WORK_END_HOUR             勤務終了時刻（デフォルト 18）
 */

import 'dotenv/config'
import { McpServer }           from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createClient }        from '@supabase/supabase-js'
import { z }                   from 'zod'

// ── 環境変数チェック ───────────────────────────────────────
const SUPABASE_URL  = process.env.SUPABASE_URL
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
const USER_ID       = process.env.SUPABASE_USER_ID
const WORK_START    = parseInt(process.env.WORK_START_HOUR ?? '9')
const WORK_END      = parseInt(process.env.WORK_END_HOUR   ?? '18')

if (!SUPABASE_URL || !SUPABASE_KEY || !USER_ID) {
  process.stderr.write(
    '[task-management-mcp] 必要な環境変数が不足しています。\n' +
    '  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_USER_ID を設定してください。\n'
  )
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── ユーティリティ ─────────────────────────────────────────
/** 正味作業時間（分）を計算 */
function netMinutes(record) {
  if (record.override_elapsed_ms != null) {
    return Math.round(record.override_elapsed_ms / 60000)
  }
  const ms = new Date(record.actual_end) - new Date(record.actual_start)
  let paused = 0
  for (const p of (record.pause_log || [])) {
    if (p.s && p.e) paused += new Date(p.e) - new Date(p.s)
  }
  return Math.round((ms - paused) / 60000)
}

/** 予定時間（分）を計算 */
function plannedMinutes(record) {
  if (!record.planned_start || !record.planned_end) return 0
  return Math.round(
    (new Date(record.planned_end) - new Date(record.planned_start)) / 60000
  )
}

/** Date → ローカル YYYY-MM-DD */
function toDateStr(date) {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 分 → "Xh Ym" 形式 */
function fmtMinutes(m) {
  if (m === 0) return '0分'
  const h = Math.floor(Math.abs(m) / 60), rm = Math.abs(m) % 60
  const sign = m < 0 ? '-' : ''
  if (h === 0) return `${sign}${rm}分`
  if (rm === 0) return `${sign}${h}時間`
  return `${sign}${h}時間${rm}分`
}

/** マスターデータを一括取得（複数ツールで共有） */
async function fetchMasters() {
  const [
    { data: clients },
    { data: projects },
    { data: categories },
  ] = await Promise.all([
    supabase.from('clients').select('id, name, display_name, color').is('deleted_at', null).order('id'),
    supabase.from('projects').select('id, name, client_id').is('deleted_at', null).order('id'),
    supabase.from('project_categories').select('id, name, project_id, order_no').is('deleted_at', null).order('project_id,order_no'),
  ])
  return {
    clients:    clients    || [],
    projects:   projects   || [],
    categories: categories || [],
    clMap:  Object.fromEntries((clients  || []).map(c => [c.id, c.display_name || c.name])),
    pjMap:  Object.fromEntries((projects || []).map(p => [p.id, p])),
  }
}

// ── Google アクセストークン自動更新 ────────────────────────
let _cachedAccessToken  = null
let _tokenExpiresAt     = 0

/**
 * Google アクセストークンを取得する。
 * 優先順位:
 *   1. キャッシュ済みトークン（有効期限内）
 *   2. Supabase に保存された refresh_token で自動更新
 *   3. 環境変数 GOOGLE_ACCESS_TOKEN（フォールバック）
 */
async function getGoogleAccessToken() {
  // 1. キャッシュが有効なら返す（期限5分前に更新）
  if (_cachedAccessToken && Date.now() < _tokenExpiresAt - 300_000) {
    return _cachedAccessToken
  }

  // 2. Supabase の refresh_token で自動更新
  const clientId     = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (clientId && clientSecret) {
    const { data, error } = await supabase
      .from('user_google_tokens')
      .select('refresh_token')
      .eq('user_id', USER_ID)
      .maybeSingle()

    if (!error && data?.refresh_token) {
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type:    'refresh_token',
          refresh_token: data.refresh_token,
          client_id:     clientId,
          client_secret: clientSecret,
        }),
      })
      const json = await res.json()
      if (res.ok && json.access_token) {
        _cachedAccessToken = json.access_token
        _tokenExpiresAt    = Date.now() + (json.expires_in ?? 3600) * 1000
        return _cachedAccessToken
      }
      // refresh_token が失効している場合はエラーを詳細表示
      if (json.error === 'invalid_grant') {
        throw new Error(
          'Google refresh_token が失効しています。\n' +
          'アプリ（ブラウザ）に一度ログインし直してください。\n' +
          '再ログイン後は自動で refresh_token が更新されます。'
        )
      }
    }
  }

  // 3. フォールバック: 環境変数の access_token を直接使用
  const token = process.env.GOOGLE_ACCESS_TOKEN
  if (token) return token

  throw new Error(
    'Google アクセストークンを取得できません。\n' +
    '推奨: .env に GOOGLE_CLIENT_ID と GOOGLE_CLIENT_SECRET を設定してください。\n' +
    '     → 設定後はアプリにログインするだけで自動更新されます。\n' +
    '一時: .env に GOOGLE_ACCESS_TOKEN=ya29.xxx を直接設定することもできます。'
  )
}

// ── MCP サーバー初期化 ────────────────────────────────────
const server = new McpServer({
  name:    'task-management',
  version: '1.0.0',
})

// ════════════════════════════════════════════════════════
// Tool 1: get_masters
// ════════════════════════════════════════════════════════
server.tool(
  'get_masters',
  'クライアント・案件・カテゴリのマスターデータを取得します。' +
  'タスク一覧の解釈や予定作成の前準備として使用してください。',
  {},
  async () => {
    const { clients, projects, categories } = await fetchMasters()
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ clients, projects, categories }, null, 2),
      }],
    }
  }
)

// ════════════════════════════════════════════════════════
// Tool 2: list_tasks
// ════════════════════════════════════════════════════════
server.tool(
  'list_tasks',
  'タスク一覧を取得します。クライアント・案件・定期フラグでフィルタリング可能。' +
  '使用頻度（usage_count）の高い順に返します。\n' +
  'ユースケース: タスクの漏れ確認・来週の作業計画・工数見積もり',
  {
    client_id:    z.number().optional().describe('クライアントID で絞り込み'),
    project_id:   z.number().optional().describe('案件ID で絞り込み'),
    is_recurring: z.boolean().optional().describe('true: 定期タスクのみ / false: 非定期のみ / 未指定: 全件'),
    limit:        z.number().optional().default(200).describe('最大取得件数（デフォルト 200）'),
  },
  async ({ client_id, project_id, is_recurring, limit }) => {
    let q = supabase
      .from('app_tasks')
      .select('id, title, client_id, project_id, category_id, subcategory_id, is_recurring, usage_count, created_at')
      .eq('user_id', USER_ID)
      .is('deleted_at', null)
      .order('usage_count', { ascending: false })
      .limit(limit)

    if (client_id    !== undefined) q = q.eq('client_id',    client_id)
    if (project_id   !== undefined) q = q.eq('project_id',   project_id)
    if (is_recurring !== undefined) q = q.eq('is_recurring', is_recurring)

    const { data: tasks, error } = await q
    if (error) throw new Error(`タスク取得エラー: ${error.message}`)

    const { clMap, pjMap, categories } = await fetchMasters()
    const catMap = Object.fromEntries((categories || []).map(c => [c.id, c.name]))

    const enriched = (tasks || []).map(t => ({
      id:            t.id,
      title:         t.title,
      client:        clMap[t.client_id]  || null,
      project:       pjMap[t.project_id]?.name || null,
      category:      catMap[t.category_id]    || null,
      subcategory:   catMap[t.subcategory_id] || null,
      is_recurring:  t.is_recurring,
      usage_count:   t.usage_count,
      created_at:    t.created_at,
    }))

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          total: enriched.length,
          tasks: enriched,
        }, null, 2),
      }],
    }
  }
)

// ════════════════════════════════════════════════════════
// Tool 3: get_untracked_tasks
// ════════════════════════════════════════════════════════
server.tool(
  'get_untracked_tasks',
  '指定期間内に作業記録のないタスクを返します。\n' +
  'ユースケース: タスクの漏れ・放置タスクの検出。\n' +
  '「直近2週間で作業記録のない定期タスクを教えて」といった用途に使用してください。',
  {
    since_days:       z.number().optional().default(14).describe(
      '直近何日以内に記録がないタスクを検出するか（デフォルト 14日）'
    ),
    is_recurring_only: z.boolean().optional().default(false).describe(
      '定期タスクのみ対象にする場合 true（デフォルト false = 全タスク）'
    ),
  },
  async ({ since_days, is_recurring_only }) => {
    const since = new Date()
    since.setDate(since.getDate() - since_days)
    const sinceStr = toDateStr(since)

    // 直近 since_days 日間に作業したタスクIDを収集
    const { data: recentRecords } = await supabase
      .from('app_records')
      .select('id')
      .eq('user_id', USER_ID)
      .gte('target_date', sinceStr)

    const recordIds = (recentRecords || []).map(r => r.id)
    let workedIds = new Set()

    if (recordIds.length > 0) {
      const { data: details } = await supabase
        .from('app_record_details')
        .select('task_id')
        .in('record_id', recordIds)
        .not('task_id', 'is', null)
        .not('actual_end', 'is', null)

      workedIds = new Set((details || []).map(d => d.task_id))
    }

    // 全タスク取得（条件付き）
    let q = supabase
      .from('app_tasks')
      .select('id, title, client_id, project_id, is_recurring, usage_count, created_at')
      .eq('user_id', USER_ID)
      .is('deleted_at', null)
      .order('usage_count', { ascending: false })

    if (is_recurring_only) q = q.eq('is_recurring', true)

    const { data: tasks } = await q
    const untracked = (tasks || []).filter(t => !workedIds.has(t.id))

    const { clMap, pjMap } = await fetchMasters()

    const enriched = untracked.map(t => ({
      id:           t.id,
      title:        t.title,
      client:       clMap[t.client_id]       || null,
      project:      pjMap[t.project_id]?.name || null,
      is_recurring: t.is_recurring,
      usage_count:  t.usage_count,
    }))

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          check_period: `直近 ${since_days} 日間（${sinceStr} 以降）`,
          untracked_count: enriched.length,
          note: '以下のタスクはこの期間に作業記録がありません。',
          tasks: enriched,
        }, null, 2),
      }],
    }
  }
)

// ════════════════════════════════════════════════════════
// Tool 4: get_work_records
// ════════════════════════════════════════════════════════
server.tool(
  'get_work_records',
  '指定期間の作業実績（日付・タスク・予定時間・実績時間）を取得します。\n' +
  'ユースケース: 週次レポート作成・特定案件の作業履歴確認・請求計算の下準備',
  {
    start_date: z.string().describe('開始日 YYYY-MM-DD'),
    end_date:   z.string().describe('終了日 YYYY-MM-DD'),
    task_id:    z.number().optional().describe('特定タスクIDで絞り込み（任意）'),
    client_id:  z.number().optional().describe('特定クライアントIDで絞り込み（任意）'),
  },
  async ({ start_date, end_date, task_id, client_id }) => {
    const { data: records, error: rErr } = await supabase
      .from('app_records')
      .select('id, target_date')
      .eq('user_id', USER_ID)
      .gte('target_date', start_date)
      .lte('target_date', end_date)
      .order('target_date')

    if (rErr) throw new Error(`記録取得エラー: ${rErr.message}`)

    const recordIds = (records || []).map(r => r.id)
    const recordMap = Object.fromEntries((records || []).map(r => [r.id, r]))

    if (!recordIds.length) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ period: { start_date, end_date }, total_minutes: 0, records: [] }),
        }],
      }
    }

    const { data: details } = await supabase
      .from('app_record_details')
      .select('*')
      .in('record_id', recordIds)
      .not('actual_end', 'is', null)

    // タスク情報を取得して付加
    const taskIds = [...new Set((details || []).map(d => d.task_id).filter(Boolean))]
    let taskMap = {}
    if (taskIds.length > 0) {
      const { data: tasks } = await supabase
        .from('app_tasks')
        .select('id, title, client_id, project_id')
        .in('id', taskIds)
      const { clMap, pjMap } = await fetchMasters()
      taskMap = Object.fromEntries((tasks || []).map(t => [t.id, {
        id:      t.id,
        title:   t.title,
        client:  clMap[t.client_id]       || null,
        project: pjMap[t.project_id]?.name || null,
        client_id:  t.client_id,
        project_id: t.project_id,
      }]))
    }

    let rows = (details || []).map(d => {
      const actM  = netMinutes(d)
      const planM = plannedMinutes(d)
      return {
        date:        recordMap[d.record_id]?.target_date,
        event_title: d.calendar_event_title,
        task:        taskMap[d.task_id] || null,
        planned_min: planM,
        actual_min:  actM,
        diff_min:    planM > 0 ? actM - planM : null,
        planned_fmt: fmtMinutes(planM),
        actual_fmt:  fmtMinutes(actM),
        actual_start: d.actual_start,
        actual_end:   d.actual_end,
      }
    })

    // フィルタ
    if (task_id   !== undefined) rows = rows.filter(r => r.task?.id   === task_id)
    if (client_id !== undefined) rows = rows.filter(r => r.task?.client_id === client_id)

    // 日付順でソート
    rows.sort((a, b) => (a.date || '').localeCompare(b.date || ''))

    const totalActual  = rows.reduce((s, r) => s + r.actual_min,  0)
    const totalPlanned = rows.reduce((s, r) => s + r.planned_min, 0)

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          period:           { start_date, end_date },
          total_planned:    fmtMinutes(totalPlanned),
          total_actual:     fmtMinutes(totalActual),
          overall_efficiency: totalActual > 0
            ? `${Math.round(totalPlanned / totalActual * 100)}%`
            : null,
          record_count: rows.length,
          records:      rows,
        }, null, 2),
      }],
    }
  }
)

// ════════════════════════════════════════════════════════
// Tool 5: get_analytics
// ════════════════════════════════════════════════════════
server.tool(
  'get_analytics',
  '期間・集計軸を指定して作業時間を集計します。\n' +
  '集計軸: client（クライアント別）/ project（案件別）/ task（タスク別）/ date（日別）\n' +
  'ユースケース: 請求計算・生産性分析・時間配分レポート・見積もりバイアスの確認',
  {
    start_date: z.string().describe('開始日 YYYY-MM-DD'),
    end_date:   z.string().describe('終了日 YYYY-MM-DD'),
    group_by:   z.enum(['client', 'project', 'task', 'date'])
      .describe('集計軸: client / project / task / date'),
  },
  async ({ start_date, end_date, group_by }) => {
    const { data: records } = await supabase
      .from('app_records')
      .select('id, target_date')
      .eq('user_id', USER_ID)
      .gte('target_date', start_date)
      .lte('target_date', end_date)

    const recordIds = (records || []).map(r => r.id)
    const recordMap = Object.fromEntries((records || []).map(r => [r.id, r]))

    if (!recordIds.length) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ period: { start_date, end_date }, group_by, total_hours: 0, groups: [] }),
        }],
      }
    }

    const { data: details } = await supabase
      .from('app_record_details')
      .select('*')
      .in('record_id', recordIds)
      .not('actual_end', 'is', null)

    // タスク・マスターを取得
    const taskIds = [...new Set((details || []).map(d => d.task_id).filter(Boolean))]
    let taskMap = {}
    if (taskIds.length > 0) {
      const { data: tasks } = await supabase
        .from('app_tasks')
        .select('id, title, client_id, project_id')
        .in('id', taskIds)
      taskMap = Object.fromEntries((tasks || []).map(t => [t.id, t]))
    }

    const { clMap, pjMap } = await fetchMasters()

    // グループ集計
    const groups = {}

    for (const d of (details || [])) {
      const actM  = netMinutes(d)
      const planM = plannedMinutes(d)
      const task  = taskMap[d.task_id]
      const date  = recordMap[d.record_id]?.target_date

      let key, label, meta = {}

      if (group_by === 'client') {
        const cid = task?.client_id
        key   = cid ? String(cid) : '__none__'
        label = cid ? (clMap[cid] || `クライアントID:${cid}`) : '（クライアント未設定）'
      } else if (group_by === 'project') {
        const pid = task?.project_id
        key   = pid ? String(pid) : '__none__'
        label = pid ? (pjMap[pid]?.name || `案件ID:${pid}`) : '（案件未設定）'
        if (pid && pjMap[pid]) {
          meta.client = clMap[pjMap[pid].client_id] || null
        }
      } else if (group_by === 'task') {
        key   = d.task_id ? String(d.task_id) : `__event__${d.calendar_event_id}`
        label = task?.title || d.calendar_event_title || '（タスク未紐付け）'
        if (task) {
          meta.client  = clMap[task.client_id]       || null
          meta.project = pjMap[task.project_id]?.name || null
        }
      } else { // date
        key   = date || 'unknown'
        label = date || '不明'
      }

      if (!groups[key]) {
        groups[key] = { label, planned_min: 0, actual_min: 0, sessions: 0, ...meta }
      }
      groups[key].planned_min += planM
      groups[key].actual_min  += actM
      groups[key].sessions    += 1
    }

    const result = Object.values(groups)
      .map(g => ({
        label:          g.label,
        ...(g.client  ? { client:  g.client  } : {}),
        ...(g.project ? { project: g.project } : {}),
        sessions:       g.sessions,
        planned_hours:  Math.round(g.planned_min / 60 * 10) / 10,
        actual_hours:   Math.round(g.actual_min  / 60 * 10) / 10,
        planned_fmt:    fmtMinutes(g.planned_min),
        actual_fmt:     fmtMinutes(g.actual_min),
        diff_fmt:       g.planned_min > 0 ? fmtMinutes(g.actual_min - g.planned_min) : null,
        efficiency:     g.actual_min > 0
          ? `${Math.round(g.planned_min / g.actual_min * 100)}%`
          : null,
      }))
      .sort((a, b) => b.actual_hours - a.actual_hours)

    const totalActualMin  = result.reduce((s, g) => s + (g.actual_hours  * 60), 0)
    const totalPlannedMin = result.reduce((s, g) => s + (g.planned_hours * 60), 0)

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          period:             { start_date, end_date },
          group_by,
          total_actual_hours:  Math.round(totalActualMin  / 60 * 10) / 10,
          total_planned_hours: Math.round(totalPlannedMin / 60 * 10) / 10,
          groups: result,
        }, null, 2),
      }],
    }
  }
)

// ════════════════════════════════════════════════════════
// Tool 6: get_calendar_events
// ════════════════════════════════════════════════════════
server.tool(
  'get_calendar_events',
  'Googleカレンダーの予定一覧を取得します。\n' +
  'ユースケース: 来週の空き時間確認・作業予定の計画・既存スケジュールの把握\n' +
  '※ GOOGLE_ACCESS_TOKEN 環境変数が必要です（有効期限 1時間）',
  {
    start_date: z.string().describe('開始日 YYYY-MM-DD'),
    end_date:   z.string().describe('終了日 YYYY-MM-DD'),
  },
  async ({ start_date, end_date }) => {
    const token = await getGoogleAccessToken()

    const timeMin = new Date(start_date); timeMin.setHours(0,  0,  0,   0)
    const timeMax = new Date(end_date);   timeMax.setHours(23, 59, 59, 999)

    const params = new URLSearchParams({
      calendarId:   'primary',
      timeMin:      timeMin.toISOString(),
      timeMax:      timeMax.toISOString(),
      singleEvents: 'true',
      orderBy:      'startTime',
      maxResults:   '100',
      timeZone:     'Asia/Tokyo',
      fields:       'items(id,summary,start,end,description)',
    })

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!res.ok) {
      const err = await res.json()
      throw new Error(`Google Calendar API エラー: ${err.error?.message}`)
    }

    const data   = await res.json()
    const events = (data.items || []).map(ev => {
      const start = ev.start?.dateTime || ev.start?.date
      const end   = ev.end?.dateTime   || ev.end?.date
      const isAllDay = Boolean(ev.start?.date)
      const durationMin = (!isAllDay && start && end)
        ? Math.round((new Date(end) - new Date(start)) / 60000)
        : null
      return {
        id:           ev.id,
        title:        ev.summary || '（タイトルなし）',
        start,
        end,
        is_all_day:   isAllDay,
        duration_min: durationMin,
        duration_fmt: durationMin != null ? fmtMinutes(durationMin) : null,
      }
    })

    // 空き時間スロットを計算（勤務時間内）
    const busySlots = events
      .filter(e => !e.is_all_day && e.start && e.end)
      .map(e => ({ s: new Date(e.start), e: new Date(e.end) }))

    const freeSlots = []
    const cur = new Date(start_date)
    const last = new Date(end_date)
    last.setHours(23, 59, 59)

    while (cur <= last) {
      const dow = cur.getDay()
      if (dow !== 0 && dow !== 6) { // 平日
        const dayStart = new Date(cur); dayStart.setHours(WORK_START, 0, 0, 0)
        const dayEnd   = new Date(cur); dayEnd.setHours(WORK_END,     0, 0, 0)

        const dayBusy = busySlots.filter(b =>
          b.s < dayEnd && b.e > dayStart &&
          toDateStr(b.s) === toDateStr(cur)
        ).sort((a, b) => a.s - b.s)

        let pointer = dayStart
        for (const busy of dayBusy) {
          const freeEnd = busy.s < dayEnd ? busy.s : dayEnd
          if (freeEnd > pointer) {
            freeSlots.push({
              date:  toDateStr(cur),
              start: `${String(pointer.getHours()).padStart(2,'0')}:${String(pointer.getMinutes()).padStart(2,'0')}`,
              end:   `${String(freeEnd.getHours()).padStart(2,'0')}:${String(freeEnd.getMinutes()).padStart(2,'0')}`,
              free_min:  Math.round((freeEnd - pointer) / 60000),
            })
          }
          if (busy.e > pointer) pointer = busy.e
        }
        if (pointer < dayEnd) {
          freeSlots.push({
            date:  toDateStr(cur),
            start: `${String(pointer.getHours()).padStart(2,'0')}:${String(pointer.getMinutes()).padStart(2,'0')}`,
            end:   `${WORK_END}:00`,
            free_min: Math.round((dayEnd - pointer) / 60000),
          })
        }
      }
      cur.setDate(cur.getDate() + 1)
    }

    const totalFreeMin = freeSlots.reduce((s, sl) => s + sl.free_min, 0)

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          period:       { start_date, end_date },
          event_count:  events.length,
          work_hours:   `${WORK_START}:00 〜 ${WORK_END}:00`,
          total_free_time: fmtMinutes(totalFreeMin),
          events,
          free_slots: freeSlots,
        }, null, 2),
      }],
    }
  }
)

// ════════════════════════════════════════════════════════
// Tool 7: create_calendar_event
// ════════════════════════════════════════════════════════
server.tool(
  'create_calendar_event',
  'Googleカレンダーに新しい予定を作成します。\n' +
  'ユースケース: 来週の作業予定をまとめて登録する・タスクに基づいてスケジュールを組む\n' +
  'ヒント: まず get_calendar_events で空き時間を確認してから作成してください。\n' +
  '※ GOOGLE_ACCESS_TOKEN 環境変数が必要です',
  {
    title:       z.string().describe('予定のタイトル（タスク名など）'),
    start:       z.string().describe('開始日時 ISO 8601形式: 2026-04-07T09:00:00+09:00'),
    end:         z.string().describe('終了日時 ISO 8601形式: 2026-04-07T10:00:00+09:00'),
    description: z.string().optional().describe('予定の説明・メモ（任意）'),
  },
  async ({ title, start, end, description }) => {
    const token = await getGoogleAccessToken()

    const body = {
      summary:     title,
      start:       { dateTime: start, timeZone: 'Asia/Tokyo' },
      end:         { dateTime: end,   timeZone: 'Asia/Tokyo' },
      ...(description ? { description } : {}),
    }

    const res = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    )

    if (!res.ok) {
      const err = await res.json()
      throw new Error(`Google Calendar API エラー: ${err.error?.message}`)
    }

    const ev = await res.json()

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success:    true,
          event_id:   ev.id,
          title:      ev.summary,
          start:      ev.start?.dateTime,
          end:        ev.end?.dateTime,
          html_link:  ev.htmlLink,
        }, null, 2),
      }],
    }
  }
)

// ── サーバー起動 ──────────────────────────────────────────
const transport = new StdioServerTransport()
await server.connect(transport)
