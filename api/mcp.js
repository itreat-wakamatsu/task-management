/**
 * HTTP MCP エンドポイント（Vercel Serverless Function）
 * GET/POST /api/mcp
 *
 * 必要な Vercel 環境変数（ダッシュボードで設定）:
 *   SUPABASE_URL              - Supabase プロジェクト URL
 *   SUPABASE_SERVICE_ROLE_KEY - サービスロールキー
 *   GOOGLE_CLIENT_ID          - Google OAuth クライアントID
 *   GOOGLE_CLIENT_SECRET      - Google OAuth シークレット
 *   WORK_START_HOUR           - 勤務開始時刻（デフォルト 9）
 *   WORK_END_HOUR             - 勤務終了時刻（デフォルト 18）
 *
 * ユーザーが設定するのは /api/mcp?key=xxx の key のみ。
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const WORK_START = parseInt(process.env.WORK_START_HOUR ?? '9')
const WORK_END   = parseInt(process.env.WORK_END_HOUR   ?? '18')

// ── Google token cache（リクエスト間で共有） ───────────────
const gCache = new Map() // userId → { token, expiresAt }

async function getGoogleToken(userId) {
  const c = gCache.get(userId)
  if (c && Date.now() < c.expiresAt - 300_000) return c.token

  const clientId     = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error(
      'サーバーに Google OAuth 認証情報が設定されていません。' +
      '（管理者に GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET の設定を依頼してください）'
    )
  }
  const { data } = await supabase
    .from('user_google_tokens')
    .select('refresh_token')
    .eq('user_id', userId)
    .maybeSingle()

  if (!data?.refresh_token) {
    throw new Error('Google 認証情報が見つかりません。アプリにログインし直してください。')
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token', refresh_token: data.refresh_token,
      client_id: clientId, client_secret: clientSecret,
    }),
  })
  const json = await res.json()
  if (!res.ok) {
    if (json.error === 'invalid_grant') {
      throw new Error('Google トークンが失効しています。アプリに再ログインしてください。')
    }
    throw new Error(`トークン更新失敗: ${json.error_description}`)
  }
  gCache.set(userId, { token: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 })
  return json.access_token
}

// ── ユーティリティ ─────────────────────────────────────────
const netMin  = r => r.override_elapsed_ms != null
  ? Math.round(r.override_elapsed_ms / 60000)
  : (() => {
      const ms = new Date(r.actual_end) - new Date(r.actual_start)
      let p = 0; for (const s of (r.pause_log||[])) if (s.s&&s.e) p += new Date(s.e)-new Date(s.s)
      return Math.round((ms - p) / 60000)
    })()

const planMin = r => (!r.planned_start||!r.planned_end) ? 0
  : Math.round((new Date(r.planned_end) - new Date(r.planned_start)) / 60000)

const dateStr = d => { const dt=new Date(d); return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}` }

const fmtMin  = m => {
  if (!m) return '0分'
  const h=Math.floor(Math.abs(m)/60), rm=Math.abs(m)%60, s=m<0?'-':''
  return h ? (rm ? `${s}${h}時間${rm}分` : `${s}${h}時間`) : `${s}${rm}分`
}

const text = obj => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] })

async function getMasters() {
  const [{ data: cl }, { data: pj }, { data: ca }] = await Promise.all([
    supabase.from('clients').select('id,name,display_name,color').is('deleted_at', null).order('id'),
    supabase.from('projects').select('id,name,client_id').is('deleted_at', null).order('id'),
    supabase.from('project_categories').select('id,name,project_id,order_no').is('deleted_at', null).order('project_id,order_no'),
  ])
  return {
    clients: cl||[], projects: pj||[], categories: ca||[],
    clMap: Object.fromEntries((cl||[]).map(c => [c.id, c.display_name||c.name])),
    pjMap: Object.fromEntries((pj||[]).map(p => [p.id, p])),
    catMap: Object.fromEntries((ca||[]).map(c => [c.id, c.name])),
  }
}

// ── ツール定義（tools/list レスポンス用） ─────────────────
const TOOLS = [
  {
    name: 'get_masters',
    description: 'クライアント・案件・カテゴリのマスターデータを取得します。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_tasks',
    description: 'タスク一覧を取得します（フィルタ付き）。タスク漏れ確認・作業計画に使用してください。',
    inputSchema: {
      type: 'object',
      properties: {
        client_id:    { type: 'number', description: 'クライアントIDで絞り込み' },
        project_id:   { type: 'number', description: '案件IDで絞り込み' },
        is_recurring: { type: 'boolean', description: '定期タスクのみ: true' },
        limit:        { type: 'number', description: '最大件数（デフォルト200）' },
      },
    },
  },
  {
    name: 'get_untracked_tasks',
    description: '指定期間に作業記録のないタスクを返します。タスク漏れ・放置タスクの検出に使用してください。',
    inputSchema: {
      type: 'object',
      properties: {
        since_days:        { type: 'number', description: '直近何日以内（デフォルト14）' },
        is_recurring_only: { type: 'boolean', description: '定期タスクのみ（デフォルトfalse）' },
      },
    },
  },
  {
    name: 'get_work_records',
    description: '期間指定で作業実績を取得します。週次レポート・案件の作業履歴確認に使用してください。',
    inputSchema: {
      type: 'object',
      required: ['start_date', 'end_date'],
      properties: {
        start_date: { type: 'string', description: 'YYYY-MM-DD' },
        end_date:   { type: 'string', description: 'YYYY-MM-DD' },
        client_id:  { type: 'number', description: 'クライアントで絞り込み（任意）' },
        task_id:    { type: 'number', description: 'タスクで絞り込み（任意）' },
      },
    },
  },
  {
    name: 'get_analytics',
    description: '作業時間を集計します。group_by: client / project / task / date',
    inputSchema: {
      type: 'object',
      required: ['start_date', 'end_date', 'group_by'],
      properties: {
        start_date: { type: 'string', description: 'YYYY-MM-DD' },
        end_date:   { type: 'string', description: 'YYYY-MM-DD' },
        group_by:   { type: 'string', enum: ['client', 'project', 'task', 'date'] },
      },
    },
  },
  {
    name: 'get_calendar_events',
    description: 'Googleカレンダーの予定と空き時間スロットを取得します。来週の予定計画に使用してください。',
    inputSchema: {
      type: 'object',
      required: ['start_date', 'end_date'],
      properties: {
        start_date: { type: 'string', description: 'YYYY-MM-DD' },
        end_date:   { type: 'string', description: 'YYYY-MM-DD' },
      },
    },
  },
  {
    name: 'create_calendar_event',
    description: 'Googleカレンダーに予定を作成します。まず get_calendar_events で空き時間を確認してから作成してください。',
    inputSchema: {
      type: 'object',
      required: ['title', 'start', 'end'],
      properties: {
        title:       { type: 'string', description: '予定のタイトル' },
        start:       { type: 'string', description: 'ISO 8601: 2026-04-07T09:00:00+09:00' },
        end:         { type: 'string', description: 'ISO 8601: 2026-04-07T10:00:00+09:00' },
        description: { type: 'string', description: '説明・メモ（任意）' },
      },
    },
  },
]

// ── ツール実装 ─────────────────────────────────────────────
async function callTool(userId, name, args) {
  switch (name) {

    case 'get_masters': {
      const { clients, projects, categories } = await getMasters()
      return text({ clients, projects, categories })
    }

    case 'list_tasks': {
      const { client_id, project_id, is_recurring, limit = 200 } = args
      let q = supabase.from('app_tasks')
        .select('id,title,client_id,project_id,category_id,subcategory_id,is_recurring,usage_count,created_at')
        .eq('user_id', userId).is('deleted_at', null)
        .order('usage_count', { ascending: false }).limit(limit)
      if (client_id    !== undefined) q = q.eq('client_id',    client_id)
      if (project_id   !== undefined) q = q.eq('project_id',   project_id)
      if (is_recurring !== undefined) q = q.eq('is_recurring', is_recurring)
      const { data: tasks, error } = await q
      if (error) throw new Error(error.message)
      const { clMap, pjMap, catMap } = await getMasters()
      return text({ total: (tasks||[]).length, tasks: (tasks||[]).map(t => ({
        id: t.id, title: t.title,
        client: clMap[t.client_id]||null, project: pjMap[t.project_id]?.name||null,
        category: catMap[t.category_id]||null, subcategory: catMap[t.subcategory_id]||null,
        is_recurring: t.is_recurring, usage_count: t.usage_count,
      })) })
    }

    case 'get_untracked_tasks': {
      const { since_days = 14, is_recurring_only = false } = args
      const since = new Date(); since.setDate(since.getDate() - since_days)
      const { data: recs } = await supabase.from('app_records')
        .select('id').eq('user_id', userId).gte('target_date', dateStr(since))
      const ids = (recs||[]).map(r => r.id)
      let worked = new Set()
      if (ids.length) {
        const { data: det } = await supabase.from('app_record_details')
          .select('task_id').in('record_id', ids).not('task_id','is',null).not('actual_end','is',null)
        worked = new Set((det||[]).map(d => d.task_id))
      }
      let q = supabase.from('app_tasks')
        .select('id,title,client_id,project_id,is_recurring,usage_count')
        .eq('user_id', userId).is('deleted_at', null)
      if (is_recurring_only) q = q.eq('is_recurring', true)
      const { data: tasks } = await q
      const { clMap, pjMap } = await getMasters()
      const untracked = (tasks||[]).filter(t => !worked.has(t.id)).map(t => ({
        id: t.id, title: t.title,
        client: clMap[t.client_id]||null, project: pjMap[t.project_id]?.name||null,
        is_recurring: t.is_recurring, usage_count: t.usage_count,
      }))
      return text({ check_period: `直近${since_days}日間`, untracked_count: untracked.length, tasks: untracked })
    }

    case 'get_work_records': {
      const { start_date, end_date, task_id, client_id } = args
      const { data: recs } = await supabase.from('app_records')
        .select('id,target_date').eq('user_id', userId)
        .gte('target_date', start_date).lte('target_date', end_date).order('target_date')
      const ids = (recs||[]).map(r => r.id)
      const recMap = Object.fromEntries((recs||[]).map(r => [r.id, r]))
      if (!ids.length) return text({ period: { start_date, end_date }, total_actual: '0分', records: [] })
      const { data: det } = await supabase.from('app_record_details')
        .select('*').in('record_id', ids).not('actual_end','is',null)
      const taskIds = [...new Set((det||[]).map(d => d.task_id).filter(Boolean))]
      let tMap = {}
      if (taskIds.length) {
        const { data: ts } = await supabase.from('app_tasks').select('id,title,client_id,project_id').in('id', taskIds)
        const { clMap, pjMap } = await getMasters()
        tMap = Object.fromEntries((ts||[]).map(t => [t.id, {
          id: t.id, title: t.title,
          client: clMap[t.client_id]||null, project: pjMap[t.project_id]?.name||null, client_id: t.client_id,
        }]))
      }
      let rows = (det||[]).map(d => ({
        date: recMap[d.record_id]?.target_date, event_title: d.calendar_event_title,
        task: tMap[d.task_id]||null,
        planned_fmt: fmtMin(planMin(d)), actual_fmt: fmtMin(netMin(d)),
        actual_min: netMin(d), planned_min: planMin(d),
      }))
      if (task_id   !== undefined) rows = rows.filter(r => r.task?.id        === task_id)
      if (client_id !== undefined) rows = rows.filter(r => r.task?.client_id === client_id)
      rows.sort((a, b) => (a.date||'').localeCompare(b.date||''))
      const totA = rows.reduce((s, r) => s + r.actual_min, 0)
      const totP = rows.reduce((s, r) => s + r.planned_min, 0)
      return text({ period: { start_date, end_date }, total_actual: fmtMin(totA), total_planned: fmtMin(totP), record_count: rows.length, records: rows })
    }

    case 'get_analytics': {
      const { start_date, end_date, group_by } = args
      const { data: recs } = await supabase.from('app_records')
        .select('id,target_date').eq('user_id', userId)
        .gte('target_date', start_date).lte('target_date', end_date)
      const ids = (recs||[]).map(r => r.id)
      const recMap = Object.fromEntries((recs||[]).map(r => [r.id, r]))
      if (!ids.length) return text({ period: { start_date, end_date }, group_by, groups: [] })
      const { data: det } = await supabase.from('app_record_details')
        .select('*').in('record_id', ids).not('actual_end','is',null)
      const taskIds = [...new Set((det||[]).map(d => d.task_id).filter(Boolean))]
      let tMap = {}
      if (taskIds.length) {
        const { data: ts } = await supabase.from('app_tasks').select('id,title,client_id,project_id').in('id', taskIds)
        tMap = Object.fromEntries((ts||[]).map(t => [t.id, t]))
      }
      const { clMap, pjMap } = await getMasters()
      const groups = {}
      for (const d of (det||[])) {
        const a = netMin(d), p = planMin(d), t = tMap[d.task_id], dt = recMap[d.record_id]?.target_date
        let key, label, extra = {}
        if (group_by === 'client') {
          key = t?.client_id ? String(t.client_id) : '__none__'
          label = t?.client_id ? (clMap[t.client_id]||`ID:${t.client_id}`) : '（未設定）'
        } else if (group_by === 'project') {
          key = t?.project_id ? String(t.project_id) : '__none__'
          label = t?.project_id ? (pjMap[t.project_id]?.name||`ID:${t.project_id}`) : '（未設定）'
          if (t?.project_id && pjMap[t.project_id]) extra.client = clMap[pjMap[t.project_id].client_id]||null
        } else if (group_by === 'task') {
          key = d.task_id ? String(d.task_id) : `ev_${d.calendar_event_id}`
          label = t?.title || d.calendar_event_title || '（未紐付け）'
          if (t) { extra.client = clMap[t.client_id]||null; extra.project = pjMap[t.project_id]?.name||null }
        } else {
          key = dt||'unknown'; label = dt||'不明'
        }
        if (!groups[key]) groups[key] = { label, actual: 0, planned: 0, sessions: 0, ...extra }
        groups[key].actual += a; groups[key].planned += p; groups[key].sessions += 1
      }
      const result = Object.values(groups).map(g => ({
        label: g.label,
        ...(g.client  ? { client:  g.client  } : {}),
        ...(g.project ? { project: g.project } : {}),
        sessions: g.sessions,
        actual_hours:  Math.round(g.actual  / 60 * 10) / 10,
        planned_hours: Math.round(g.planned / 60 * 10) / 10,
        actual_fmt: fmtMin(g.actual), planned_fmt: fmtMin(g.planned),
        efficiency: g.actual > 0 ? `${Math.round(g.planned / g.actual * 100)}%` : null,
      })).sort((a, b) => b.actual_hours - a.actual_hours)
      return text({ period: { start_date, end_date }, group_by, total_actual_hours: Math.round(result.reduce((s,g)=>s+g.actual_hours,0)*10)/10, groups: result })
    }

    case 'get_calendar_events': {
      const { start_date, end_date } = args
      const token = await getGoogleToken(userId)
      const tMin = new Date(start_date); tMin.setHours(0,0,0,0)
      const tMax = new Date(end_date);   tMax.setHours(23,59,59,999)
      const p = new URLSearchParams({
        calendarId: 'primary', timeMin: tMin.toISOString(), timeMax: tMax.toISOString(),
        singleEvents: 'true', orderBy: 'startTime', maxResults: '100', timeZone: 'Asia/Tokyo',
        fields: 'items(id,summary,start,end)',
      })
      const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${p}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!r.ok) { const e = await r.json(); throw new Error(e.error?.message) }
      const data = await r.json()
      const events = (data.items||[]).map(ev => ({
        id: ev.id, title: ev.summary||'（タイトルなし）',
        start: ev.start?.dateTime||ev.start?.date, end: ev.end?.dateTime||ev.end?.date,
        is_all_day: Boolean(ev.start?.date),
        duration_fmt: !ev.start?.date && ev.start?.dateTime ? fmtMin(Math.round((new Date(ev.end.dateTime)-new Date(ev.start.dateTime))/60000)) : null,
      }))
      // 空きスロット計算（平日・勤務時間内）
      const busy = events.filter(e => !e.is_all_day && e.start && e.end).map(e => ({ s: new Date(e.start), e: new Date(e.end) }))
      const slots = []
      const cur = new Date(start_date), last = new Date(end_date); last.setHours(23,59,59)
      while (cur <= last) {
        if (cur.getDay() !== 0 && cur.getDay() !== 6) {
          const ds = new Date(cur); ds.setHours(WORK_START,0,0,0)
          const de = new Date(cur); de.setHours(WORK_END,0,0,0)
          const db = busy.filter(b => b.s<de && b.e>ds && dateStr(b.s)===dateStr(cur)).sort((a,b)=>a.s-b.s)
          let ptr = ds
          for (const b of db) {
            if (b.s > ptr) slots.push({ date: dateStr(cur), start: `${String(ptr.getHours()).padStart(2,'0')}:${String(ptr.getMinutes()).padStart(2,'0')}`, end: `${String(b.s.getHours()).padStart(2,'0')}:${String(b.s.getMinutes()).padStart(2,'0')}`, free_min: Math.round((b.s-ptr)/60000) })
            if (b.e > ptr) ptr = b.e
          }
          if (ptr < de) slots.push({ date: dateStr(cur), start: `${String(ptr.getHours()).padStart(2,'0')}:${String(ptr.getMinutes()).padStart(2,'0')}`, end: `${WORK_END}:00`, free_min: Math.round((de-ptr)/60000) })
        }
        cur.setDate(cur.getDate() + 1)
      }
      return text({ events, free_slots: slots, total_free: fmtMin(slots.reduce((s,sl)=>s+sl.free_min,0)) })
    }

    case 'create_calendar_event': {
      const { title, start, end, description } = args
      const token = await getGoogleToken(userId)
      const body = { summary: title, start: { dateTime: start, timeZone: 'Asia/Tokyo' }, end: { dateTime: end, timeZone: 'Asia/Tokyo' }, ...(description ? { description } : {}) }
      const r = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!r.ok) { const e = await r.json(); throw new Error(e.error?.message) }
      const ev = await r.json()
      return text({ success: true, event_id: ev.id, title: ev.summary, start: ev.start?.dateTime, end: ev.end?.dateTime, html_link: ev.htmlLink })
    }

    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

// ── Vercel ハンドラ ────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id, Accept')

  if (req.method === 'OPTIONS') return res.status(200).end()

  // API キー検証（ヘッダーまたはクエリパラメータ）
  const apiKey = req.headers.authorization?.replace(/^Bearer\s+/i, '') || req.query.key
  if (!apiKey) return res.status(401).json({ error: 'API key required' })

  const { data: keyRow } = await supabase
    .from('mcp_api_keys').select('user_id').eq('key', apiKey).eq('is_active', true).maybeSingle()
  if (!keyRow) return res.status(401).json({ error: 'Invalid or inactive API key' })

  const userId = keyRow.user_id
  // 最終使用日時を非同期で更新（レスポンスをブロックしない）
  supabase.from('mcp_api_keys').update({ last_used_at: new Date().toISOString() }).eq('key', apiKey)

  // GET: サーバー情報
  if (req.method === 'GET') return res.json({ name: 'task-management', version: '1.0.0', status: 'ok' })

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { method, params, id } = req.body

  // id なし = 通知（レスポンス不要）
  if (id === undefined || id === null) return res.status(202).end()

  try {
    let result
    if (method === 'initialize') {
      result = { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'task-management', version: '1.0.0' } }
    } else if (method === 'tools/list') {
      result = { tools: TOOLS }
    } else if (method === 'tools/call') {
      result = await callTool(userId, params.name, params.arguments || {})
    } else {
      return res.json({ jsonrpc: '2.0', error: { code: -32601, message: `Unknown method: ${method}` }, id })
    }
    res.json({ jsonrpc: '2.0', result, id })
  } catch (err) {
    res.json({ jsonrpc: '2.0', error: { code: -32603, message: err.message }, id })
  }
}
