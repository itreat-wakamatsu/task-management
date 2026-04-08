/**
 * Backlog 同期ユーティリティ
 *
 * - syncBacklogTasks : Backlog 課題の最新情報でローカルの app_tasks を更新
 * - shouldAutoSync   : 前回同期から COOLDOWN 経過しているか（sessionStorage ベース）
 * - ensureFreshToken : トークンの有効期限確認・更新
 */
import { supabase } from './supabase'
import { getMyself, getMyIssues, refreshAccessToken } from './backlog'

const SYNC_KEY        = 'backlog_last_sync'
const COOLDOWN_MS     = 15 * 60 * 1000   // 15 分

/** 自動同期を実行すべきかどうか（前回同期から 15 分経過 or 未実施） */
export function shouldAutoSync() {
  const last = sessionStorage.getItem(SYNC_KEY)
  if (!last) return true
  return Date.now() - Number(last) > COOLDOWN_MS
}

function markSynced() {
  sessionStorage.setItem(SYNC_KEY, String(Date.now()))
}

/** Backlog ステータス ID → ローカルステータス番号 */
function mapStatus(backlogStatusId) {
  if (backlogStatusId === 2) return 1   // 処理中 → 進行中
  return 0                              // 未対応 / 処理済み → 未着手
}

/**
 * Backlog アクセストークンの有効期限を確認し、必要なら更新して返す。
 * BacklogModal / BacklogLinkModal と共通で使えるように切り出し。
 */
export async function ensureFreshToken(backlogToken, session, setBacklogToken) {
  // 60 秒以上余裕があればそのまま返す
  if (new Date(backlogToken.expires_at) > new Date(Date.now() + 60_000)) {
    return backlogToken
  }

  const data      = await refreshAccessToken({
    spaceKey:     backlogToken.space_key,
    refreshToken: backlogToken.refresh_token,
  })
  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString()
  const updated   = {
    ...backlogToken,
    access_token: data.access_token,
    expires_at:   expiresAt,
    ...(data.refresh_token ? { refresh_token: data.refresh_token } : {}),
  }
  await supabase.from('backlog_tokens').update({
    access_token: updated.access_token,
    expires_at:   updated.expires_at,
    ...(data.refresh_token ? { refresh_token: data.refresh_token } : {}),
  }).eq('user_id', session.user.id)
  setBacklogToken(updated)
  return updated
}

/**
 * Backlog の最新課題情報でローカルの app_tasks を更新する。
 *
 * 同期対象フィールド:
 *   - title       (summary)
 *   - start_date  (startDate)
 *   - due_date    (dueDate)
 *   - status      ※ローカルで「完了」のタスクは上書きしない
 *
 * @returns {{ updated: number }} 更新したタスク件数
 */
export async function syncBacklogTasks({
  backlogToken,
  session,
  appTasks,
  updateAppTask,
  setBacklogToken,
}) {
  const token = await ensureFreshToken(backlogToken, session, setBacklogToken)

  // Backlog から担当課題を一括取得（1 API コール）
  const me     = await getMyself(token.space_key, token.access_token)
  const issues = await getMyIssues(token.space_key, token.access_token, me.id)

  // Backlog 連携済みの非削除タスクだけを対象にする
  const linked = appTasks.filter(t => t.backlog_issue_id != null && !t.deleted_at)
  if (linked.length === 0) {
    markSynced()
    return { updated: 0 }
  }

  const issueMap = new Map(issues.map(i => [i.id, i]))
  const updates  = []

  for (const task of linked) {
    const issue = issueMap.get(task.backlog_issue_id)
    if (!issue) continue   // Backlog 上で完了 / 担当外になった課題はスキップ

    const patch = {}

    if (issue.summary !== task.title) {
      patch.title = issue.summary
    }

    const newStart = issue.startDate ? issue.startDate.slice(0, 10) : null
    const newDue   = issue.dueDate   ? issue.dueDate.slice(0, 10)   : null
    if (newStart !== (task.start_date ?? null)) patch.start_date = newStart
    if (newDue   !== (task.due_date   ?? null)) patch.due_date   = newDue

    // ローカルで完了（status=2）のタスクはステータスを戻さない
    if (task.status !== 2) {
      const ns = mapStatus(issue.status?.id)
      if (ns !== task.status) patch.status = ns
    }

    if (Object.keys(patch).length > 0) {
      updates.push({ id: task.id, ...patch })
    }
  }

  // Supabase バッチ更新（並列）
  await Promise.all(
    updates.map(({ id, ...patch }) =>
      supabase.from('app_tasks').update(patch).eq('id', id)
    )
  )
  // Zustand ストアも更新
  updates.forEach(({ id, ...patch }) => updateAppTask(id, patch))

  markSynced()
  return { updated: updates.length }
}
