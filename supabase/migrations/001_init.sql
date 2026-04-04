-- ============================================================
-- タスクタイマー DB初期化スクリプト
-- Supabase SQL Editor で実行してください
-- ============================================================

-- クライアントマスタ (Hourglass互換)
CREATE TABLE IF NOT EXISTS clients (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        varchar(255) NOT NULL,
  display_name varchar(255) NOT NULL DEFAULT '',
  color       varchar(7)   NOT NULL DEFAULT '#378ADD',
  created_at  timestamptz  DEFAULT now(),
  deleted_at  timestamptz
);

-- 案件マスタ
CREATE TABLE IF NOT EXISTS projects (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id   bigint REFERENCES clients(id) ON DELETE CASCADE,
  name        varchar(255) NOT NULL,
  status      smallint     NOT NULL DEFAULT 0, -- 0:進行中 1:完了
  created_at  timestamptz  DEFAULT now(),
  deleted_at  timestamptz
);

-- カテゴリマスタ (parent_id=NULL → 第一区分, parent_id=数値 → 第二区分)
CREATE TABLE IF NOT EXISTS project_categories (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id  bigint REFERENCES projects(id) ON DELETE CASCADE,
  parent_id   bigint REFERENCES project_categories(id),
  name        varchar(255) NOT NULL,
  order_no    int          NOT NULL DEFAULT 1,
  created_at  timestamptz  DEFAULT now(),
  deleted_at  timestamptz
);

-- タスクマスタ
CREATE TABLE IF NOT EXISTS app_tasks (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id         uuid   REFERENCES auth.users NOT NULL,
  title           varchar(255) NOT NULL,
  client_id       bigint REFERENCES clients(id),
  project_id      bigint REFERENCES projects(id),
  category_id     bigint REFERENCES project_categories(id),  -- 第一区分
  subcategory_id  bigint REFERENCES project_categories(id),  -- 第二区分
  status          smallint NOT NULL DEFAULT 0, -- 0:未着手 1:進行中 2:完了
  is_recurring    boolean  NOT NULL DEFAULT false,
  usage_count     int      NOT NULL DEFAULT 0, -- 自動紐付けスコア用
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  deleted_at      timestamptz
);

-- 日次実績ヘッダ
CREATE TABLE IF NOT EXISTS app_records (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     uuid   REFERENCES auth.users NOT NULL,
  target_date date   NOT NULL,
  created_at  timestamptz DEFAULT now(),
  UNIQUE(user_id, target_date)
);

-- 実績詳細 (タイマー記録)
CREATE TABLE IF NOT EXISTS app_record_details (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  record_id           bigint REFERENCES app_records(id) ON DELETE CASCADE,
  task_id             bigint REFERENCES app_tasks(id),
  calendar_event_id   varchar(255),
  calendar_event_title varchar(255),
  planned_start       timestamptz,
  planned_end         timestamptz,
  actual_start        timestamptz,
  actual_end          timestamptz,
  override_elapsed_ms int,     -- スライダーで手動調整した場合の値(ms)
  pause_log           jsonb    NOT NULL DEFAULT '[]', -- [{s: ISO, e: ISO}, ...]
  memo                text,
  row_no              int      NOT NULL DEFAULT 0,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

-- ============================================================
-- RLS (Row Level Security)
-- ============================================================

ALTER TABLE app_tasks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_records        ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_record_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients            ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects           ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_categories ENABLE ROW LEVEL SECURITY;

-- タスク: 自分のものだけ
CREATE POLICY "tasks_own" ON app_tasks
  FOR ALL USING (auth.uid() = user_id);

-- 日次記録: 自分のものだけ
CREATE POLICY "records_own" ON app_records
  FOR ALL USING (auth.uid() = user_id);

-- 実績詳細: 自分の日次記録に紐付くものだけ
CREATE POLICY "record_details_own" ON app_record_details
  FOR ALL USING (
    record_id IN (SELECT id FROM app_records WHERE user_id = auth.uid())
  );

-- マスタ: 全員が読み取り可能、書き込みは認証ユーザーのみ
CREATE POLICY "clients_read"     ON clients            FOR SELECT USING (true);
CREATE POLICY "projects_read"    ON projects           FOR SELECT USING (true);
CREATE POLICY "categories_read"  ON project_categories FOR SELECT USING (true);
CREATE POLICY "clients_write"    ON clients            FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "projects_write"   ON projects           FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "categories_write" ON project_categories FOR ALL USING (auth.role() = 'authenticated');

-- ============================================================
-- updated_at 自動更新トリガー
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON app_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER record_details_updated_at
  BEFORE UPDATE ON app_record_details
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
