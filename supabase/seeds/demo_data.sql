-- ============================================================
-- デモ用シードデータ（約1年分の作業実績）
--
-- 実行前に準備:
--   1. Supabase Dashboard → Authentication → Providers → Email を有効化
--   2. Dashboard → Authentication → Users → Add user でデモユーザーを作成
--   3. 作成されたユーザーの UUID を下記 v_user_id に設定
--   4. Supabase SQL Editor に貼り付けて実行
--
-- 再実行時は末尾の CLEANUP セクションを先に実行してください
-- ============================================================

-- DB が古いスキーマの場合に備えて不足カラムを補完
ALTER TABLE clients            ADD COLUMN IF NOT EXISTS color          varchar(7)   NOT NULL DEFAULT '#378ADD';
ALTER TABLE clients            ADD COLUMN IF NOT EXISTS display_name   varchar(255) NOT NULL DEFAULT '';
ALTER TABLE app_tasks          ADD COLUMN IF NOT EXISTS subcategory_id bigint REFERENCES project_categories(id);
ALTER TABLE app_tasks          ADD COLUMN IF NOT EXISTS is_recurring   boolean      NOT NULL DEFAULT false;
ALTER TABLE app_tasks          ADD COLUMN IF NOT EXISTS usage_count    int          NOT NULL DEFAULT 0;
ALTER TABLE app_tasks          ADD COLUMN IF NOT EXISTS updated_at     timestamptz  DEFAULT now();
ALTER TABLE app_tasks          ADD COLUMN IF NOT EXISTS deleted_at     timestamptz;
ALTER TABLE app_tasks          ADD COLUMN IF NOT EXISTS start_date     date;
ALTER TABLE app_tasks          ADD COLUMN IF NOT EXISTS due_date       date;
ALTER TABLE app_tasks          ADD COLUMN IF NOT EXISTS backlog_issue_id  bigint;
ALTER TABLE app_tasks          ADD COLUMN IF NOT EXISTS backlog_issue_key varchar(50);
ALTER TABLE app_record_details ADD COLUMN IF NOT EXISTS override_elapsed_ms int;
ALTER TABLE app_record_details ADD COLUMN IF NOT EXISTS memo           text;
ALTER TABLE app_record_details ADD COLUMN IF NOT EXISTS row_no         int NOT NULL DEFAULT 0;

DO $$
DECLARE
  v_user_id uuid := '03848b61-0166-433c-8993-2ca0eb98f9f0';  -- ← ここを書き換える

  -- クライアント
  v_cl_a  bigint; v_cl_b  bigint; v_cl_c  bigint;
  -- 案件
  v_pj_a1 bigint; v_pj_a2 bigint;
  v_pj_b1 bigint; v_pj_b2 bigint;
  v_pj_c1 bigint; v_pj_c2 bigint;
  -- 第一区分
  v_cat_a1_1 bigint; v_cat_a1_2 bigint;
  v_cat_a2_1 bigint; v_cat_a2_2 bigint;
  v_cat_b1_1 bigint; v_cat_b1_2 bigint;
  v_cat_b2_1 bigint;
  v_cat_c1_1 bigint; v_cat_c1_2 bigint;
  v_cat_c2_1 bigint;
  -- 第二区分
  v_sub_a1_1_1 bigint; v_sub_a1_1_2 bigint;
  v_sub_a2_1_1 bigint;
  v_sub_b1_1_1 bigint; v_sub_b1_1_2 bigint;
  v_sub_c1_1_1 bigint;
  -- タスク（頻繁に使用するもの）
  v_task_ids bigint[];
  -- 作業日ループ用
  v_date        date;
  v_record_id   bigint;
  v_day_of_week int;
  v_slot        int;
  v_task_idx    int;
  v_start       timestamptz;
  v_end_time    timestamptz;
  v_dur_min     int;
  v_slot_count  int;
  v_base_hour   int;

BEGIN

  -- ============================================================
  -- 1. マスタデータ
  -- ============================================================

  -- クライアント
  INSERT INTO clients (name, display_name, color) VALUES
    ('A株式会社',   'A社',  '#378ADD') RETURNING id INTO v_cl_a;
  INSERT INTO clients (name, display_name, color) VALUES
    ('B商事株式会社', 'B商事', '#E85D4A') RETURNING id INTO v_cl_b;
  INSERT INTO clients (name, display_name, color) VALUES
    ('社内',        '社内',  '#4DAE00') RETURNING id INTO v_cl_c;

  -- 案件
  INSERT INTO projects (client_id, name) VALUES (v_cl_a, 'Webサイト改修プロジェクト')   RETURNING id INTO v_pj_a1;
  INSERT INTO projects (client_id, name) VALUES (v_cl_a, '基幹システム開発')              RETURNING id INTO v_pj_a2;
  INSERT INTO projects (client_id, name) VALUES (v_cl_b, 'ECサイト構築')                 RETURNING id INTO v_pj_b1;
  INSERT INTO projects (client_id, name) VALUES (v_cl_b, '業務改善コンサルティング')       RETURNING id INTO v_pj_b2;
  INSERT INTO projects (client_id, name) VALUES (v_cl_c, '社内DX推進')                   RETURNING id INTO v_pj_c1;
  INSERT INTO projects (client_id, name) VALUES (v_cl_c, 'インフラ管理・保守')             RETURNING id INTO v_pj_c2;

  -- 第一区分
  INSERT INTO project_categories (project_id, name, order_no) VALUES (v_pj_a1, '要件定義・設計', 1) RETURNING id INTO v_cat_a1_1;
  INSERT INTO project_categories (project_id, name, order_no) VALUES (v_pj_a1, '開発・実装',     2) RETURNING id INTO v_cat_a1_2;
  INSERT INTO project_categories (project_id, name, order_no) VALUES (v_pj_a2, '設計',           1) RETURNING id INTO v_cat_a2_1;
  INSERT INTO project_categories (project_id, name, order_no) VALUES (v_pj_a2, '開発',           2) RETURNING id INTO v_cat_a2_2;
  INSERT INTO project_categories (project_id, name, order_no) VALUES (v_pj_b1, 'フロントエンド', 1) RETURNING id INTO v_cat_b1_1;
  INSERT INTO project_categories (project_id, name, order_no) VALUES (v_pj_b1, 'バックエンド',   2) RETURNING id INTO v_cat_b1_2;
  INSERT INTO project_categories (project_id, name, order_no) VALUES (v_pj_b2, 'ヒアリング・分析', 1) RETURNING id INTO v_cat_b2_1;
  INSERT INTO project_categories (project_id, name, order_no) VALUES (v_pj_c1, '企画・推進',     1) RETURNING id INTO v_cat_c1_1;
  INSERT INTO project_categories (project_id, name, order_no) VALUES (v_pj_c1, 'ツール開発',     2) RETURNING id INTO v_cat_c1_2;
  INSERT INTO project_categories (project_id, name, order_no) VALUES (v_pj_c2, 'サーバー管理',   1) RETURNING id INTO v_cat_c2_1;

  -- 第二区分
  INSERT INTO project_categories (project_id, parent_id, name, order_no) VALUES (v_pj_a1, v_cat_a1_1, 'ヒアリング',     1) RETURNING id INTO v_sub_a1_1_1;
  INSERT INTO project_categories (project_id, parent_id, name, order_no) VALUES (v_pj_a1, v_cat_a1_1, 'ドキュメント作成', 2) RETURNING id INTO v_sub_a1_1_2;
  INSERT INTO project_categories (project_id, parent_id, name, order_no) VALUES (v_pj_a2, v_cat_a2_1, 'DB設計',         1) RETURNING id INTO v_sub_a2_1_1;
  INSERT INTO project_categories (project_id, parent_id, name, order_no) VALUES (v_pj_b1, v_cat_b1_1, 'UI実装',         1) RETURNING id INTO v_sub_b1_1_1;
  INSERT INTO project_categories (project_id, parent_id, name, order_no) VALUES (v_pj_b1, v_cat_b1_1, 'テスト',         2) RETURNING id INTO v_sub_b1_1_2;
  INSERT INTO project_categories (project_id, parent_id, name, order_no) VALUES (v_pj_c1, v_cat_c1_1, 'ミーティング',   1) RETURNING id INTO v_sub_c1_1_1;

  -- ============================================================
  -- 2. タスク
  -- ============================================================
  WITH inserted AS (
    INSERT INTO app_tasks (user_id, title, client_id, project_id, category_id, subcategory_id, status, is_recurring, usage_count) VALUES
      (v_user_id, 'Webサイトトップページ改修',        v_cl_a, v_pj_a1, v_cat_a1_2, NULL,          1, false, 28),
      (v_user_id, '要件ヒアリング（A社）',             v_cl_a, v_pj_a1, v_cat_a1_1, v_sub_a1_1_1, 0, true,  35),
      (v_user_id, '基幹システム DB設計',               v_cl_a, v_pj_a2, v_cat_a2_1, v_sub_a2_1_1, 1, false, 15),
      (v_user_id, '基幹システム API開発',              v_cl_a, v_pj_a2, v_cat_a2_2, NULL,          1, false, 22),
      (v_user_id, 'EC商品一覧ページ UI実装',           v_cl_b, v_pj_b1, v_cat_b1_1, v_sub_b1_1_1, 1, false, 19),
      (v_user_id, 'EC決済機能 バックエンド開発',        v_cl_b, v_pj_b1, v_cat_b1_2, NULL,          1, false, 12),
      (v_user_id, 'EC フロントテスト',                 v_cl_b, v_pj_b1, v_cat_b1_1, v_sub_b1_1_2, 0, false, 8),
      (v_user_id, '業務ヒアリング（B商事）',            v_cl_b, v_pj_b2, v_cat_b2_1, NULL,          0, true,  30),
      (v_user_id, '業務改善提案書作成',                v_cl_b, v_pj_b2, v_cat_b2_1, NULL,          2, false, 10),
      (v_user_id, '社内DX 週次定例',                  v_cl_c, v_pj_c1, v_cat_c1_1, v_sub_c1_1_1, 0, true,  50),
      (v_user_id, 'タスクタイマー開発',               v_cl_c, v_pj_c1, v_cat_c1_2, NULL,          1, false, 40),
      (v_user_id, 'サーバー月次メンテナンス',          v_cl_c, v_pj_c2, v_cat_c2_1, NULL,          0, true,  12),
      (v_user_id, 'Webサイト 設計書更新',             v_cl_a, v_pj_a1, v_cat_a1_1, v_sub_a1_1_2, 2, false, 6),
      (v_user_id, '基幹システム テスト',              v_cl_a, v_pj_a2, v_cat_a2_2, NULL,          0, false, 5),
      (v_user_id, 'EC 管理画面開発',                  v_cl_b, v_pj_b1, v_cat_b1_2, NULL,          0, false, 7)
    RETURNING id
  )
  SELECT ARRAY_AGG(id ORDER BY id) INTO v_task_ids FROM inserted;

  -- ============================================================
  -- 3. 過去1年間の作業実績（平日のみ）
  -- ============================================================

  FOR v_date IN
    SELECT d::date
    FROM generate_series(
      CURRENT_DATE - INTERVAL '365 days',
      CURRENT_DATE - INTERVAL '1 day',
      INTERVAL '1 day'
    ) AS d
    WHERE EXTRACT(DOW FROM d) BETWEEN 1 AND 5  -- 月〜金
  LOOP

    -- 日次実績ヘッダーを作成
    INSERT INTO app_records (user_id, target_date)
    VALUES (v_user_id, v_date)
    RETURNING id INTO v_record_id;

    -- 日によってスロット数（作業項目数）を変える
    -- 月曜・金曜は会議が多め（3スロット）、火〜木は集中作業（4〜5スロット）
    v_day_of_week := EXTRACT(DOW FROM v_date);
    v_slot_count  := CASE
      WHEN v_day_of_week IN (1, 5) THEN 3
      WHEN v_day_of_week = 3       THEN 5
      ELSE 4
    END;

    -- 月によって繁忙度を変える（3月・9月・12月は忙しい）
    v_slot_count := v_slot_count + CASE
      WHEN EXTRACT(MONTH FROM v_date) IN (3, 9, 12) THEN 1
      ELSE 0
    END;

    v_base_hour := 9; -- 9:00 スタート

    FOR v_slot IN 1..v_slot_count LOOP

      -- タスクを日付・スロットの組み合わせで決定論的に選択
      v_task_idx := (
        (EXTRACT(DOY FROM v_date)::int * 7 + v_slot * 3)
        % ARRAY_LENGTH(v_task_ids, 1)
      ) + 1;

      -- 作業時間（30分〜150分）
      v_dur_min := 30 + (
        (EXTRACT(DOY FROM v_date)::int * 13 + v_slot * 17 + v_day_of_week * 7)
        % 121  -- 0〜120 の範囲
      );
      -- 30分単位に丸める
      v_dur_min := (v_dur_min / 30) * 30;
      IF v_dur_min < 30 THEN v_dur_min := 30; END IF;

      v_start    := (v_date::timestamptz AT TIME ZONE 'Asia/Tokyo')
                    + (v_base_hour * 60 + (v_slot - 1) * 10)::text::interval;
      v_end_time := v_start + (v_dur_min || ' minutes')::interval;

      -- 昼休み（12:00〜13:00）をまたぐ場合は調整
      IF EXTRACT(HOUR FROM v_start AT TIME ZONE 'Asia/Tokyo') >= 12
         AND EXTRACT(HOUR FROM v_start AT TIME ZONE 'Asia/Tokyo') < 13
      THEN
        v_start    := v_start + INTERVAL '60 minutes';
        v_end_time := v_end_time + INTERVAL '60 minutes';
      END IF;

      -- 18:30 を超える場合はスキップ
      EXIT WHEN EXTRACT(HOUR FROM v_end_time AT TIME ZONE 'Asia/Tokyo') >= 19;

      INSERT INTO app_record_details (
        record_id,
        task_id,
        calendar_event_id,
        calendar_event_title,
        planned_start,
        planned_end,
        actual_start,
        actual_end,
        pause_log,
        row_no
      ) VALUES (
        v_record_id,
        v_task_ids[v_task_idx],
        -- ダミーのカレンダーイベントID
        'demo_evt_' || v_date::text || '_' || v_slot::text,
        -- カレンダーイベントタイトル（タスク名に対応）
        (SELECT title FROM app_tasks WHERE id = v_task_ids[v_task_idx]),
        v_start,
        v_end_time,
        v_start,
        v_end_time,
        '[]'::jsonb,
        v_slot
      );

      v_base_hour := v_base_hour + (v_dur_min / 60) + 1;

    END LOOP;  -- slot

  END LOOP;  -- date

  RAISE NOTICE 'デモデータの挿入が完了しました。user_id: %', v_user_id;

END $$;


-- ============================================================
-- CLEANUP: 再実行時はこちらを先に実行してください
-- （デモユーザーのデータのみ削除）
-- ============================================================
/*
DO $$
DECLARE
  v_user_id uuid := 'REPLACE_WITH_DEMO_USER_ID';
  v_record_ids bigint[];
BEGIN
  SELECT ARRAY_AGG(id) INTO v_record_ids FROM app_records WHERE user_id = v_user_id;
  DELETE FROM app_record_details WHERE record_id = ANY(v_record_ids);
  DELETE FROM app_records  WHERE user_id = v_user_id;
  DELETE FROM app_tasks    WHERE user_id = v_user_id;

  -- マスタデータ（全ユーザー共有なので注意して実行）
  -- DELETE FROM project_categories WHERE project_id IN (SELECT id FROM projects WHERE client_id IN (SELECT id FROM clients WHERE name IN ('A株式会社','B商事株式会社','社内')));
  -- DELETE FROM projects WHERE client_id IN (SELECT id FROM clients WHERE name IN ('A株式会社','B商事株式会社','社内'));
  -- DELETE FROM clients  WHERE name IN ('A株式会社','B商事株式会社','社内');

  RAISE NOTICE 'デモデータを削除しました。user_id: %', v_user_id;
END $$;
*/
