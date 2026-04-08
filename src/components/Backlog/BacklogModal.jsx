import { useState } from 'react'
import { useStore } from '@/store/useStore'
import { supabase } from '@/lib/supabase'
import { getAuthUrl, getMyself, getMyIssues, refreshAccessToken } from '@/lib/backlog'
import { syncBacklogTasks } from '@/lib/backlogSync'
import styles from './BacklogModal.module.css'

const CLIENT_ID = import.meta.env.VITE_BACKLOG_CLIENT_ID

export default function BacklogModal({ onClose }) {
  const { session, backlogToken, setBacklogToken, appTasks, updateAppTask, clients, projects, addAppTask } = useStore()

  const [view,       setView]       = useState('settings')
  const [spaceKey,   setSpaceKey]   = useState(backlogToken?.space_key ?? '')
  const [issues,     setIssues]     = useState([])
  const [selected,   setSelected]   = useState(new Set())
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState(null)
  const [syncResult, setSyncResult] = useState(null)  // null | { updated: number }

  const connected = !!backlogToken

  function handleConnect() {
    if (!spaceKey.trim()) return
    if (!CLIENT_ID) {
      setError('環境変数 VITE_BACKLOG_CLIENT_ID が設定されていません')
      return
    }
    sessionStorage.setItem('backlog_space_key', spaceKey.trim())
    window.location.href = getAuthUrl(spaceKey.trim(), CLIENT_ID)
  }

  async function handleDisconnect() {
    if (!confirm('Backlog との連携を解除しますか？')) return
    await supabase.from('backlog_tokens').delete().eq('user_id', session.user.id)
    setBacklogToken(null)
  }

  async function handleSync() {
    setLoading(true)
    setError(null)
    setSyncResult(null)
    try {
      const result = await syncBacklogTasks({
        backlogToken,
        session,
        appTasks,
        updateAppTask,
        setBacklogToken,
      })
      setSyncResult(result)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function ensureFreshToken() {
    let token = backlogToken
    if (new Date(token.expires_at) > new Date(Date.now() + 60_000)) return token

    const data      = await refreshAccessToken({ spaceKey: token.space_key, refreshToken: token.refresh_token })
    const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString()
    const updated   = {
      ...token,
      access_token:  data.access_token,
      expires_at:    expiresAt,
      ...(data.refresh_token ? { refresh_token: data.refresh_token } : {}),
    }
    await supabase.from('backlog_tokens').update({
      access_token:  updated.access_token,
      expires_at:    updated.expires_at,
      ...(data.refresh_token ? { refresh_token: data.refresh_token } : {}),
    }).eq('user_id', session.user.id)
    setBacklogToken(updated)
    return updated
  }

  async function loadIssues() {
    setLoading(true)
    setError(null)
    try {
      const token = await ensureFreshToken()
      const me    = await getMyself(token.space_key, token.access_token)
      const all   = await getMyIssues(token.space_key, token.access_token, me.id)

      // 既にインポート済みの issue_id を除外
      const { data: existing } = await supabase
        .from('app_tasks')
        .select('backlog_issue_id')
        .eq('user_id', session.user.id)
        .not('backlog_issue_id', 'is', null)
      const importedIds = new Set((existing || []).map(t => t.backlog_issue_id))

      const unimported = all.filter(i => !importedIds.has(i.id))
      setIssues(unimported)
      setSelected(new Set(unimported.map(i => i.id)))
      setView('import')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleImport() {
    if (!selected.size) return
    setLoading(true)
    setError(null)
    try {
      const toImport = issues.filter(i => selected.has(i.id))
      const rows = toImport.map(issue => {
        // Backlogプロジェクト名で案件をマッチング（近似）
        const bpName = issue.project?.name?.toLowerCase() ?? ''
        const pj = projects.find(p => {
          const pname = p.name.toLowerCase()
          return pname.includes(bpName) || bpName.includes(pname)
        })
        const cl = pj ? clients.find(c => c.id === pj.client_id) : null

        return {
          user_id:           session.user.id,
          title:             issue.summary,
          status:            mapStatus(issue.status?.id),
          client_id:         cl?.id  ?? null,
          project_id:        pj?.id  ?? null,
          category_id:       null,
          subcategory_id:    null,
          is_recurring:      false,
          start_date:        issue.startDate ? issue.startDate.slice(0, 10) : null,
          due_date:          issue.dueDate   ? issue.dueDate.slice(0, 10)   : null,
          backlog_issue_id:  issue.id,
          backlog_issue_key: issue.issueKey,
        }
      })

      const { data: created, error: err } = await supabase
        .from('app_tasks')
        .insert(rows)
        .select()
      if (err) throw new Error(err.message)
      ;(created || []).forEach(t => addAppTask(t))
      onClose()
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function mapStatus(backlogStatusId) {
    if (backlogStatusId === 2) return 1 // 処理中 → 進行中
    return 0                            // その他 → 未着手
  }

  function toggleAll() {
    setSelected(selected.size === issues.length ? new Set() : new Set(issues.map(i => i.id)))
  }

  return (
    <div className={styles.backdrop} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.box}>
        <div className={styles.title}>Backlog 連携</div>

        {view === 'settings' && (
          <>
            {connected ? (
              <>
                <div className={styles.connectedCard}>
                  <span className={styles.connectedDot} />
                  <span className={styles.connectedText}>{backlogToken.space_key}.backlog.com と連携済み</span>
                  <button className={styles.btnDisconnect} onClick={handleDisconnect}>連携解除</button>
                </div>
                <div className={styles.syncRow}>
                  <button
                    className={styles.btnSync}
                    onClick={handleSync}
                    disabled={loading}
                  >
                    {loading ? '同期中...' : '↺ 今すぐ同期'}
                  </button>
                  {syncResult && (
                    <span className={styles.syncResult}>
                      {syncResult.updated > 0
                        ? `${syncResult.updated} 件を更新しました`
                        : 'すべて最新です'}
                    </span>
                  )}
                </div>
              </>
            ) : (
              <div className={styles.field}>
                <label className={styles.label}>スペースキー</label>
                <input
                  className={styles.input}
                  value={spaceKey}
                  onChange={e => setSpaceKey(e.target.value)}
                  placeholder="例: itreatinc（itreatinc.backlog.com の場合）"
                  onKeyDown={e => e.key === 'Enter' && handleConnect()}
                />
                <div className={styles.hint}>
                  Backlog管理画面 → 個人設定 → アプリケーション でOAuthアプリを作成し、<br />
                  redirect_uri に <code>{window.location.origin}/backlog-callback</code> を登録してください。
                </div>
              </div>
            )}

            {error && <div className={styles.error}>{error}</div>}

            <div className={styles.footer}>
              <button className={styles.btnCancel} onClick={onClose}>閉じる</button>
              {connected ? (
                <button className={styles.btnPrimary} onClick={loadIssues} disabled={loading}>
                  {loading ? '読込中...' : '課題をインポート'}
                </button>
              ) : (
                <button className={styles.btnPrimary} onClick={handleConnect} disabled={!spaceKey.trim()}>
                  Backlog と連携する
                </button>
              )}
            </div>
          </>
        )}

        {view === 'import' && (
          <>
            <div className={styles.importHeader}>
              <span className={styles.importCount}>未インポート {issues.length} 件</span>
              <button className={styles.btnToggleAll} onClick={toggleAll}>
                {selected.size === issues.length ? '全解除' : '全選択'}
              </button>
            </div>

            <div className={styles.issueList}>
              {issues.length === 0 && (
                <div className={styles.empty}>インポート可能な課題はありません</div>
              )}
              {issues.map(issue => (
                <label key={issue.id} className={styles.issueRow}>
                  <input
                    type="checkbox"
                    checked={selected.has(issue.id)}
                    onChange={e => {
                      const next = new Set(selected)
                      e.target.checked ? next.add(issue.id) : next.delete(issue.id)
                      setSelected(next)
                    }}
                  />
                  <div className={styles.issueBody}>
                    <div className={styles.issueKey}>{issue.issueKey}</div>
                    <div className={styles.issueSummary}>{issue.summary}</div>
                    {(issue.startDate || issue.dueDate) && (
                      <div className={styles.issueDates}>
                        {issue.startDate && <span>開始: {issue.startDate.slice(0, 10)}</span>}
                        {issue.dueDate   && <span>期日: {issue.dueDate.slice(0, 10)}</span>}
                      </div>
                    )}
                  </div>
                </label>
              ))}
            </div>

            {error && <div className={styles.error}>{error}</div>}

            <div className={styles.footer}>
              <button className={styles.btnCancel} onClick={() => setView('settings')}>戻る</button>
              <button
                className={styles.btnPrimary}
                onClick={handleImport}
                disabled={!selected.size || loading}
              >
                {loading ? 'インポート中...' : `${selected.size} 件をインポート`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
