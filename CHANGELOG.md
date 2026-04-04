# CHANGELOG

## [Unreleased]

---

## [0.2.0] - 2026-04-04

### Added
- **Backlog OAuth 2.0 連携**
  - `api/backlog-token.js`: Vercel サーバーレス関数によるトークン交換（`client_secret` をサーバーサイドで保持）
  - `src/lib/backlog.js`: Backlog API クライアント（認証URL生成・トークン交換・課題取得）
  - `BacklogModal`: 連携設定モーダル（スペースキー入力・connect/disconnect・課題インポート）
  - `BacklogCallback`: OAuth コールバックページ（`/backlog-callback` ルート）
  - `BacklogBadge`: Backlog由来タスクを示す緑の「B」バッジ（タスク一覧のタイトル横に表示）
  - `backlog_tokens` テーブル（Supabase・RLS付き）: アクセストークン・リフレッシュトークンを保存
  - インポート時に Backlog のプロジェクト名でクライアント/案件を自動マッチング
  - Backlog由来タスクはタイトル・ステータスの編集を禁止（編集モーダルでread-only表示）

- **タスクへの開始日・期日追加**
  - `app_tasks` テーブルに `start_date`, `due_date` カラム追加
  - タスク作成・編集モーダルに日付入力フィールド追加
  - タスク一覧に「開始日」「期日」列追加
  - 期日超過タスク（`due_date < 今日` かつ未完了）を行ごと赤背景でハイライト、期日セルを赤太字で表示

- **Backlog由来フィールド**
  - `app_tasks` に `backlog_issue_id`, `backlog_issue_key` カラム追加（`002_backlog_and_dates.sql`）

- **ヘッダーUIの改善**
  - ヘッダー右側に「Backlog」ボタン追加（連携済みの場合は緑表示）
  - `headerRight` コンテナでサインアウトボタンとグループ化

- **App初期化の改善**
  - `App.jsx` に `sessionLoaded` 状態を追加し、セッション読み込み中はローディング表示
  - `/backlog-callback` ルートをセッション有無に関わらず表示

### Changed
- `AppLayout.jsx`: `loadBacklogToken` を初期化時に呼び出し、最大幅を 860px → 980px に拡大
- `TaskEditModal.jsx`: `initialValues` の日付フィールドに対応、タイトル行に `backlogTag` バッジ追加
- `useStore.js`: `backlogToken`, `setBacklogToken`, `loadBacklogToken` を追加

---

## [0.1.0] - 2026-04-03

### Added
- **基本アーキテクチャ**
  - React 18 + Vite + CSS Modules + Zustand + Supabase + React Router
  - Google OAuth によるログイン（Supabase Auth）

- **今日タブ**
  - Google Calendar API で当日の予定を取得・表示
  - 各予定にタスクを紐付け（LinkModal）
  - タイマー計測（開始・一時停止・終了）
  - `app_records` / `app_record_details` テーブルへの保存

- **タスク管理タブ**
  - タスクの一覧表示・新規作成・編集・論理削除
  - フィルター（クライアント・ステータス・定期/非定期）
  - 第二区分カラムの追加
  - `SearchableSelect`: 検索可能なドロップダウンコンポーネント

- **タスク紐付けモーダル（LinkModal）**
  - カレンダーイベントタイトルとのスコアリング（`autoLink.js`）
  - 高一致/中一致/低一致バッジ
  - モーダルから直接新規タスクを作成する機能
  - 上位候補からクライアント・案件・区分を自動引き継ぎ（スコア 0.35 以上）

- **開発用機能**
  - ヘッダーの日付ピッカー（DEVモードのみ）：任意の日付でカレンダー取得を確認
  - `devDate` 状態（Zustand）: 開発時は `new Date()` で初期化、本番は `null`

- **DBスキーマ**（`001_init.sql`）
  - `clients`, `projects`, `project_categories`, `app_tasks`
  - `app_records`, `app_record_details`
  - RLS ポリシー（全テーブル）
  - `updated_at` 自動更新トリガー

### Fixed
- 日付ピッカーで `toISOString()` を使うと UTC変換により1日前が表示されるバグ → ローカル日付メソッドで修正
- タブ切り替え時にタスク紐付けが解除されるバグ → `detailId` が null の場合も `app_record_details` に即時保存するよう修正
- タスク編集PATCHで `updated_at` を手動送信すると PGRST204 エラーが発生 → DBトリガーに委ねるよう修正
