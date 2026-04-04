# タスクタイマー

Googleカレンダーと連携して予定ごとの作業時間を記録し、日次・月次で集計するタイムトラッキングアプリ。

## 機能概要

- **今日タブ**: Googleカレンダーの予定を取得し、各予定にタスクを紐付けてタイマー計測
- **タスク管理タブ**: タスクのCRUD・Backlogからのインポート・開始日/期日管理
- **集計タブ**: 日次/月次の作業時間をクライアント・案件・区分別に集計

## 技術スタック

| 分類 | 技術 |
|------|------|
| フロントエンド | React 18 + Vite + CSS Modules |
| 状態管理 | Zustand |
| バックエンド | Supabase (PostgreSQL + Auth + RLS) |
| デプロイ | Vercel |
| 外部連携 | Google Calendar API, Backlog OAuth 2.0 |

## ローカル開発セットアップ

### 前提条件

- Node.js 18+（macOS/Homebrew: `/opt/homebrew/bin/node`）

### 環境変数

`.env.local` をプロジェクトルートに作成：

```env
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_BACKLOG_CLIENT_ID=xxxxxxxxxxxxxxxx
```

### 起動

```bash
npm install
npm run dev
# → http://localhost:5173
```

> **Backlog OAuth をローカルでテストする場合** は `vercel dev` を使用（`api/` のサーバーレス関数を動かすため）

### Vercel 環境変数（本番）

Vercel プロジェクト設定 → Environment Variables に追加：

| 変数名 | 説明 | 公開範囲 |
|--------|------|----------|
| `VITE_SUPABASE_URL` | Supabase プロジェクト URL | フロント |
| `VITE_SUPABASE_ANON_KEY` | Supabase 匿名キー | フロント |
| `VITE_BACKLOG_CLIENT_ID` | Backlog OAuth クライアントID | フロント |
| `BACKLOG_CLIENT_SECRET` | Backlog OAuth シークレット | サーバーのみ |

## データベースセットアップ

Supabase Dashboard → SQL Editor でマイグレーションファイルを順番に実行：

```
supabase/migrations/001_init.sql                  # 初期スキーマ
supabase/migrations/002_backlog_and_dates.sql     # Backlog連携・日付フィールド
```

### デモデータの投入（オプション）

1. Supabase Dashboard → Authentication → Providers → Email を有効化
2. Dashboard → Authentication → Users → 「Add user」でデモユーザーを作成
3. 作成されたユーザーの UUID をコピー
4. `supabase/seeds/demo_data.sql` の `REPLACE_WITH_DEMO_USER_ID` を置換して実行

詳細は [`supabase/seeds/README.md`](supabase/seeds/README.md) を参照。

## DB マイグレーション運用

ローカルと本番が同一 Supabase の場合のフロー：

```
1. supabase/migrations/ に 003_xxx.sql などで変更内容を追記（記録用）
2. Supabase Dashboard → SQL Editor で手動実行
3. コードを GitHub へ push → Vercel が自動デプロイ
```

## Backlog 連携セットアップ

1. Backlog → 個人設定 → アプリケーション → 新規登録
2. コールバック URL に以下を登録：
   - `http://localhost:5173/backlog-callback`（開発用）
   - `https://your-app.vercel.app/backlog-callback`（本番用）
3. 発行された `client_id` と `client_secret` を環境変数に設定
4. アプリの「Backlog」ボタンから連携を開始

## AI による動作確認

デモユーザー（メール+パスワード認証）を使うことで、Google OAuth を経由せずに Claude Code からブラウザ操作でログイン・テストが可能です。

```
ログイン URL : http://localhost:5173
テスト用アカウント: Supabase に作成したデモユーザー
```

`mcp__Claude_in_Chrome__` または `mcp__computer-use__` ツールで操作できます。

## ディレクトリ構成

```
task-management/
├── api/                        # Vercel サーバーレス関数
│   └── backlog-token.js        # Backlog OAuth トークン交換
├── src/
│   ├── components/
│   │   ├── Analytics/          # 集計・履歴タブ
│   │   ├── Auth/               # ログイン画面
│   │   ├── Backlog/            # Backlog連携コンポーネント
│   │   ├── Layout/             # アプリレイアウト・ヘッダー
│   │   ├── Modals/             # タスク紐付けモーダル
│   │   ├── TaskManager/        # タスク管理タブ
│   │   ├── Timer/              # タイマーUI
│   │   ├── Today/              # 今日タブ
│   │   └── shared/             # 共有コンポーネント
│   ├── lib/
│   │   ├── autoLink.js         # タスク自動紐付けロジック
│   │   ├── backlog.js          # Backlog API クライアント
│   │   ├── googleCalendar.js   # Google Calendar API クライアント
│   │   └── supabase.js         # Supabase クライアント
│   └── store/
│       └── useStore.js         # Zustand グローバルストア
└── supabase/
    ├── migrations/             # DBマイグレーション（記録用・実行順に命名）
    └── seeds/                  # デモ・テスト用シードデータ
```
