# タスクタイマー API仕様書

**バージョン:** 0.1.0
**最終更新:** 2026-04-04

---

## 目次

1. [概要](#1-概要)
2. [Vercel Serverless API](#2-vercel-serverless-api)
3. [Supabase API（PostgREST）](#3-supabase-apipostgrest)
4. [Google Calendar API](#4-google-calendar-api)
5. [Backlog API](#5-backlog-api)

---

## 1. 概要

タスクタイマーが使用するAPIは以下の4種類です。

| API | 提供者 | 用途 |
|-----|--------|------|
| Vercel Serverless | 自社 | BacklogのOAuthトークン交換（Client Secretを保護） |
| Supabase PostgREST | Supabase | データベースCRUD操作全般 |
| Google Calendar API | Google | カレンダー予定の取得 |
| Backlog REST API | Backlog | 課題の取得・ユーザー情報取得 |

### 共通仕様

- プロトコル: HTTPS
- データ形式: JSON
- 文字コード: UTF-8

---

## 2. Vercel Serverless API

### 2-1. POST /api/backlog-token

BacklogのOAuth 2.0トークン交換を中継するサーバーレス関数。
Client SecretをサーバーサイドのみでHTTP Basic認証に使用します。

**エンドポイント:** `POST /api/backlog-token`

**用途:**
- 認可コードをアクセストークンに交換
- リフレッシュトークンで新しいアクセストークンを取得

---

#### ケース1: 認可コードでトークン取得

**リクエスト:**

```http
POST /api/backlog-token
Content-Type: application/json

{
  "grant_type": "authorization_code",
  "code": "認可コード（BacklogからリダイレクトされたURLのcodeパラメータ）",
  "redirect_uri": "https://your-app.vercel.app/backlog-callback",
  "space_key": "your-backlog-space"
}
```

| パラメータ | 型 | 必須 | 説明 |
|----------|-----|------|------|
| grant_type | string | ◎ | `"authorization_code"` 固定 |
| code | string | ◎ | Backlogが発行した認可コード |
| redirect_uri | string | ◎ | BacklogアプリのリダイレクトURI |
| space_key | string | ◎ | Backlogスペースキー（例: `my-company`） |

**レスポンス（成功）:**

```json
HTTP 200 OK
{
  "access_token": "アクセストークン文字列",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "リフレッシュトークン文字列"
}
```

| フィールド | 型 | 説明 |
|----------|-----|------|
| access_token | string | APIアクセス用トークン |
| token_type | string | 常に`"Bearer"` |
| expires_in | number | 有効期間（秒）。通常3600 |
| refresh_token | string | トークン更新用 |

---

#### ケース2: リフレッシュトークンで更新

**リクエスト:**

```http
POST /api/backlog-token
Content-Type: application/json

{
  "grant_type": "refresh_token",
  "refresh_token": "既存のリフレッシュトークン",
  "space_key": "your-backlog-space"
}
```

| パラメータ | 型 | 必須 | 説明 |
|----------|-----|------|------|
| grant_type | string | ◎ | `"refresh_token"` 固定 |
| refresh_token | string | ◎ | 既存のリフレッシュトークン |
| space_key | string | ◎ | Backlogスペースキー |

**レスポンス（成功）:** ケース1と同様

---

**エラーレスポンス:**

```json
HTTP 400 / 401 / 500
{
  "error": "エラーコード",
  "error_description": "エラー詳細"
}
```

| ステータス | エラーコード | 説明 |
|-----------|------------|------|
| 400 | `invalid_request` | パラメータ不正 |
| 401 | `invalid_client` | Client ID/Secretが不正 |
| 400 | `invalid_grant` | 認可コードまたはリフレッシュトークンが無効 |
| 405 | - | POST以外のメソッド |
| 500 | - | サーバー内部エラー |

**CORSヘッダー:**

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

**実装概要（api/backlog-token.js）:**

```javascript
const credentials = Buffer.from(
  `${process.env.VITE_BACKLOG_CLIENT_ID}:${process.env.BACKLOG_CLIENT_SECRET}`
).toString('base64')

const response = await fetch(
  `https://${space_key}.backlog.com/api/v2/oauth2/token`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
    },
    body: new URLSearchParams(body),
  }
)
```

---

## 3. Supabase API（PostgREST）

Supabase の JavaScript SDK（`@supabase/supabase-js`）を使用。
すべてのリクエストに JWT（`Authorization: Bearer {token}`）が付与される。

**ベースURL:** `https://{project-ref}.supabase.co`

### 3-1. 認証

#### セッション取得

```javascript
const { data: { session }, error } = await supabase.auth.getSession()
```

#### Googleログイン

```javascript
await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    scopes: 'https://www.googleapis.com/auth/calendar',
    redirectTo: window.location.origin,
  },
})
```

#### メールログイン（Dev）

```javascript
const { error } = await supabase.auth.signInWithPassword({ email, password })
```

#### ログアウト

```javascript
await supabase.auth.signOut()
```

---

### 3-2. clients テーブル

#### 全件取得

```javascript
const { data } = await supabase
  .from('clients')
  .select('*')
  .is('deleted_at', null)
  .order('id')
```

**レスポンス例:**
```json
[
  {
    "id": 1,
    "name": "株式会社サンプル",
    "display_name": "サンプル社",
    "color": "#378ADD",
    "created_at": "2026-01-01T00:00:00Z",
    "deleted_at": null
  }
]
```

---

### 3-3. projects テーブル

#### 全件取得

```javascript
const { data } = await supabase
  .from('projects')
  .select('*')
  .is('deleted_at', null)
  .order('client_id')
```

---

### 3-4. project_categories テーブル

#### 全件取得

```javascript
const { data } = await supabase
  .from('project_categories')
  .select('*')
  .is('deleted_at', null)
  .order('order_no')
```

---

### 3-5. app_tasks テーブル

#### ユーザーのタスク一覧取得

```javascript
const { data } = await supabase
  .from('app_tasks')
  .select('*')
  .eq('user_id', userId)
  .is('deleted_at', null)
  .order('usage_count', { ascending: false })
```

#### タスク作成

```javascript
const { data, error } = await supabase
  .from('app_tasks')
  .insert({
    user_id:        userId,
    title:          'タスク名',
    client_id:      1,
    project_id:     2,
    category_id:    3,
    subcategory_id: 4,
    status:         0,
    is_recurring:   false,
    start_date:     '2026-04-01',
    due_date:       '2026-04-30',
    backlog_issue_id:  12345,
    backlog_issue_key: 'PROJ-123',
  })
  .select()
  .single()
```

#### タスク更新

```javascript
const { error } = await supabase
  .from('app_tasks')
  .update({
    title:     '新しいタスク名',
    status:    1,
    due_date:  '2026-05-31',
    updated_at: new Date().toISOString(),
  })
  .eq('id', taskId)
```

#### タスク削除（論理削除）

```javascript
const { error } = await supabase
  .from('app_tasks')
  .update({ deleted_at: new Date().toISOString() })
  .eq('id', taskId)
```

#### usage_count インクリメント

```javascript
const { error } = await supabase
  .from('app_tasks')
  .update({ usage_count: task.usage_count + 1 })
  .eq('id', taskId)
```

---

### 3-6. app_records テーブル

#### 当日レコード取得または作成

```javascript
// 既存レコードを取得
const { data: existing } = await supabase
  .from('app_records')
  .select('id')
  .eq('user_id', userId)
  .eq('target_date', dateStr)
  .single()

// なければ INSERT
if (!existing) {
  const { data: newRecord } = await supabase
    .from('app_records')
    .insert({ user_id: userId, target_date: dateStr })
    .select('id')
    .single()
}
```

#### 期間指定で取得（Analytics用）

```javascript
const { data } = await supabase
  .from('app_records')
  .select('id, target_date')
  .eq('user_id', userId)
  .gte('target_date', sinceStr)   // 'YYYY-MM-DD'
  .order('target_date', { ascending: false })
```

---

### 3-7. app_record_details テーブル

#### 当日の明細取得

```javascript
const { data } = await supabase
  .from('app_record_details')
  .select('*')
  .eq('record_id', recordId)
  .order('row_no')
```

#### 複数レコードIDで一括取得（Analytics用）

```javascript
const { data } = await supabase
  .from('app_record_details')
  .select('*')
  .in('record_id', recordIds)
  .not('actual_end', 'is', null)
```

#### タイマー開始（INSERT）

```javascript
const { data } = await supabase
  .from('app_record_details')
  .insert({
    record_id:            recordId,
    task_id:              taskId,
    calendar_event_id:    event.id,
    calendar_event_title: event.calendarEventTitle,
    planned_start:        event.plannedStart.toISOString(),
    planned_end:          event.plannedEnd.toISOString(),
    actual_start:         new Date().toISOString(),
    pause_log:            [],
    row_no:               rowNo,
  })
  .select('id')
  .single()
```

#### タイマー終了（UPDATE）

```javascript
const { error } = await supabase
  .from('app_record_details')
  .update({
    actual_end:  new Date().toISOString(),
    pause_log:   finalPauseLog,
    updated_at:  new Date().toISOString(),
  })
  .eq('id', detailId)
```

#### 手動時間調整

```javascript
const { error } = await supabase
  .from('app_record_details')
  .update({ override_elapsed_ms: ms })
  .eq('id', detailId)
```

#### タスク紐付け更新

```javascript
const { error } = await supabase
  .from('app_record_details')
  .update({ task_id: taskId })
  .eq('id', detailId)
```

#### やり直し（Undo）

```javascript
const { error } = await supabase
  .from('app_record_details')
  .update({
    actual_start:        null,
    actual_end:          null,
    pause_log:           [],
    override_elapsed_ms: null,
  })
  .eq('id', detailId)
```

---

### 3-8. backlog_tokens テーブル

#### トークン取得

```javascript
const { data } = await supabase
  .from('backlog_tokens')
  .select('*')
  .eq('user_id', userId)
  .single()
```

#### トークン保存（Upsert）

```javascript
const { error } = await supabase
  .from('backlog_tokens')
  .upsert({
    user_id:       userId,
    access_token:  token.access_token,
    refresh_token: token.refresh_token,
    expires_at:    new Date(Date.now() + token.expires_in * 1000).toISOString(),
    space_key:     spaceKey,
    updated_at:    new Date().toISOString(),
  })
```

#### トークン削除（連携解除）

```javascript
const { error } = await supabase
  .from('backlog_tokens')
  .delete()
  .eq('user_id', userId)
```

---

## 4. Google Calendar API

Supabaseの `session.provider_token` をBearerトークンとして使用。

**ベースURL:** `https://www.googleapis.com/calendar/v3`

### 4-1. GET /calendars/primary/events — 予定一覧取得

```javascript
async function fetchTodayEvents(accessToken, date) {
  const timeMin = toJSTBoundary(date, false)  // 00:00:00 JST
  const timeMax = toJSTBoundary(date, true)   // 23:59:59 JST

  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
  url.searchParams.set('timeMin', timeMin)
  url.searchParams.set('timeMax', timeMax)
  url.searchParams.set('singleEvents', 'true')
  url.searchParams.set('orderBy', 'startTime')

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  })
  const json = await res.json()
  return json.items.map(normalizeEvent)
}
```

**クエリパラメータ:**

| パラメータ | 値 | 説明 |
|----------|-----|------|
| timeMin | ISO 8601 (JST 00:00:00) | 取得開始日時 |
| timeMax | ISO 8601 (JST 23:59:59) | 取得終了日時 |
| singleEvents | `true` | 繰り返しイベントを展開 |
| orderBy | `startTime` | 開始時刻でソート |

**レスポンス（正規化後）:**

```typescript
interface NormalizedEvent {
  calendarEventId:    string   // event.id
  calendarEventTitle: string   // event.summary
  plannedStart:       Date     // event.start.dateTime
  plannedEnd:         Date     // event.end.dateTime
  isAllDay:           boolean  // event.start.date が存在する場合
  htmlLink:           string   // カレンダーリンク
}
```

> **注意:** 終日イベント（isAllDay=true）は今日タブで表示されません。

---

## 5. Backlog API

**ベースURL:** `https://{space_key}.backlog.com/api/v2`

Backlog APIはフロントエンドから直接呼び出します（トークン交換のみサーバーを経由）。

### 5-1. GET /users/myself — ログインユーザー情報取得

```javascript
async function getMyself(spaceKey, accessToken) {
  const res = await fetch(
    `https://${spaceKey}.backlog.com/api/v2/users/myself`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  return await res.json()
}
```

**レスポンス（主要フィールド）:**

```json
{
  "id": 12345,
  "name": "Kazuki Wakamatsu",
  "userId": "kazuki.w",
  "mailAddress": "kazuki@example.com"
}
```

---

### 5-2. GET /issues — 課題一覧取得

```javascript
async function getMyIssues(spaceKey, accessToken, assigneeId) {
  const params = new URLSearchParams({
    'assigneeId[]':  assigneeId,
    'statusId[]':    [1, 2, 3].join('&statusId[]='),
    count:           100,
    order:           'updated',
  })
  const res = await fetch(
    `https://${spaceKey}.backlog.com/api/v2/issues?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  return await res.json()
}
```

**クエリパラメータ:**

| パラメータ | 値 | 説明 |
|----------|-----|------|
| `assigneeId[]` | ユーザーID | 担当者でフィルター |
| `statusId[]` | `1,2,3` | 未対応・処理中・処理済み |
| `count` | `100` | 取得件数 |
| `order` | `updated` | 更新日時でソート |

**レスポンス（課題ごとの主要フィールド）:**

```json
{
  "id": 67890,
  "issueKey": "PROJ-42",
  "summary": "ログイン機能の修正",
  "status": {
    "id": 2,
    "name": "処理中"
  },
  "startDate": "2026-04-01",
  "dueDate": "2026-04-30",
  "project": {
    "id": 111,
    "name": "基幹システム改修"
  }
}
```

**Backlog statusId とアプリステータスのマッピング:**

| Backlog statusId | Backlog名称 | アプリステータス |
|-----------------|------------|--------------|
| 1 | 未対応 | 0: 未着手 |
| 2 | 処理中 | 1: 進行中 |
| 3 | 処理済み | 0: 未着手 |
| 4 | 完了 | 2: 完了 |

---

### 5-3. OAuth 2.0 フロー

**認可URL生成:**

```javascript
function getAuthUrl(spaceKey, clientId) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     clientId,
    redirect_uri:  `${window.location.origin}/backlog-callback`,
    state:         crypto.randomUUID(),
  })
  return `https://${spaceKey}.backlog.com/OAuth2AccessRequest.action?${params}`
}
```

**コールバック処理（BacklogCallback.jsx）:**

1. URLから `code` と `state` を取得
2. `sessionStorage` から `spaceKey` を取得
3. `/api/backlog-token` に POST してトークン取得
4. `backlog_tokens` にupsert
5. ストアに `backlogToken` をセット
6. `/` にリダイレクト
