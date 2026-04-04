-- ============================================================
-- 002: Backlog連携 + 開始日・期日
-- Supabase SQL Editor で実行してください
-- ============================================================

-- app_tasks に日付フィールドと Backlog 連携フィールドを追加
ALTER TABLE app_tasks ADD COLUMN IF NOT EXISTS start_date        date;
ALTER TABLE app_tasks ADD COLUMN IF NOT EXISTS due_date          date;
ALTER TABLE app_tasks ADD COLUMN IF NOT EXISTS backlog_issue_id  bigint;       -- Backlog の issue.id
ALTER TABLE app_tasks ADD COLUMN IF NOT EXISTS backlog_issue_key varchar(50);  -- 例: PROJ-123

-- Backlog OAuth トークン（ユーザーごとに 1 行）
CREATE TABLE IF NOT EXISTS backlog_tokens (
  user_id       uuid         PRIMARY KEY REFERENCES auth.users,
  access_token  text         NOT NULL,
  refresh_token text         NOT NULL,
  expires_at    timestamptz  NOT NULL,
  space_key     varchar(100) NOT NULL,
  created_at    timestamptz  DEFAULT now(),
  updated_at    timestamptz  DEFAULT now()
);

ALTER TABLE backlog_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "backlog_tokens_own" ON backlog_tokens
  FOR ALL USING (auth.uid() = user_id);

CREATE TRIGGER backlog_tokens_updated_at
  BEFORE UPDATE ON backlog_tokens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
