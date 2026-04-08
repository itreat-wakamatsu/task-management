-- ============================================================
-- 004: 予定工数・実工数
-- Supabase SQL Editor で実行してください
-- ============================================================

-- app_tasks に工数フィールドを追加
ALTER TABLE app_tasks ADD COLUMN IF NOT EXISTS planned_hours numeric(6,2);  -- 予定工数（時間）
ALTER TABLE app_tasks ADD COLUMN IF NOT EXISTS actual_hours  numeric(6,2);  -- 実工数（時間）
