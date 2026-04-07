-- ============================================================
-- フィードバックテーブル
-- ============================================================
CREATE TABLE IF NOT EXISTS app_feedback (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- ユーザー入力項目
  category    TEXT NOT NULL,            -- 機能カテゴリ（今日の予定, タスク管理, 集計・履歴, …）
  type        TEXT NOT NULL,            -- 種別（要望, 不具合, 質問, その他）
  priority    TEXT NOT NULL DEFAULT '中', -- 緊急度（低, 中, 高）
  body        TEXT NOT NULL,            -- 本文
  name        TEXT NOT NULL DEFAULT '', -- 送信者名
  email       TEXT,                     -- 連絡先メール

  -- 自動取得項目
  current_tab TEXT,                     -- 送信時のタブ（today, tasks, analytics）
  user_agent  TEXT,                     -- ブラウザ情報

  created_at  TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE app_feedback ENABLE ROW LEVEL SECURITY;

-- 自分のフィードバックの INSERT のみ許可（閲覧は管理者がダッシュボードで行う）
CREATE POLICY "Users can insert own feedback"
  ON app_feedback FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 自分のフィードバック履歴の閲覧を許可
CREATE POLICY "Users can view own feedback"
  ON app_feedback FOR SELECT
  USING (auth.uid() = user_id);
