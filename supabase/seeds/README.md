# デモ・テスト用シードデータ

## demo_data.sql

約1年分（365日）の作業実績ダミーデータを生成します。

### 生成されるデータ

| テーブル | 件数の目安 |
|---------|-----------|
| clients | 3件（A社・B商事・社内） |
| projects | 6件 |
| project_categories | 16件（第一区分10・第二区分6） |
| app_tasks | 15件 |
| app_records | 約260件（平日のみ） |
| app_record_details | 約1,000〜1,300件 |

### 実行手順

#### 1. デモユーザーを作成

Supabase Dashboard → Authentication → Providers → **Email** を有効化してから：

```
Dashboard → Authentication → Users → Add user
  Email   : demo@example.com（任意）
  Password: デモ用の任意のパスワード
```

作成後、ユーザー一覧から UUID をコピー（例: `a1b2c3d4-e5f6-...`）

#### 2. SQL を編集して実行

`demo_data.sql` の先頭にある以下の行を編集：

```sql
v_user_id uuid := 'REPLACE_WITH_DEMO_USER_ID';
                   ↑ここをコピーしたUUIDに置き換える
```

Supabase Dashboard → SQL Editor に貼り付けて実行。

#### 3. ログインして確認

アプリにアクセスし、デモユーザーのメール＋パスワードでログイン。

> **注意**: `001_init.sql` と `002_backlog_and_dates.sql` を先に実行しておいてください。

---

### AI による動作確認での使い方

Claude Code から `mcp__Claude_in_Chrome__` ツールで以下の操作が可能です：

1. `http://localhost:5173` にアクセス
2. 「Googleアカウントでログイン」ではなく、メール入力フォームに切り替え（要: ログインページの実装確認）
3. デモユーザーのメール・パスワードでログイン

> **現在のログインページについて**: 現状は Google OAuth のみです。テスト用にメール認証ログインフォームを追加するか、Supabase の「Impersonate user」機能を使って認証トークンを直接取得する方法もあります。

### データのリセット

再実行する場合は `demo_data.sql` 末尾のコメントアウトされた CLEANUP ブロックを先に実行してください。
