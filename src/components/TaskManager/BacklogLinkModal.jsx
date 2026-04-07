import { useState, useEffect } from 'react'
import { useStore } from '@/store/useStore'
import { getMyself, getMyIssues, refreshAccessToken } from '@/lib/backlog'
import { supabase } from '@/lib/supabase'
import styles from './BacklogLinkModal.module.css'

/**
 * 既存app_taskにBacklog issueを紐付けるモーダル
 * @param {Function} onLinked  - (issue) => void
 * @param {Function} onClose
 */
export default function BacklogLinkModal({ onLinked, onClose }) {
  const { session, backlogToken, setBacklogToken } = useStore()

  const [issues,  setIssues]  = useState([])
  const [query,   setQuery]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  useEffect(() => { loadIssues() }, [])

  async function ensureFreshToken() {
    let token = backlogToken
    if (new Date(token.expires_at) > new Date(Date.now() + 60_000)) return token
    const { refreshAccessToken: refresh } = await import('@/lib/backlog')
    const data      = await refreshAccessToken({ spaceKey: token.space_key, refreshToken: token.refresh_token })
    const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString()
    const updated   = { ...token, access_token: data.access_token, expires_at: expiresAt,
      ...(data.refresh_token ? { refresh_token: data.refresh_token } : {}) }
    await supabase.from('backlog_tokens').update({
      access_token: updated.access_token, expires_at: updated.expires_at,
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
      setIssues(all)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const filtered = issues.filter(i =>
    !query ||
    i.summary.toLowerCase().includes(query.toLowerCase()) ||
    i.issueKey.toLowerCase().includes(query.toLowerCase())
  )

  return (
    <div className={styles.backdrop} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.box}>
        <div className={styles.header}>
          <span className={styles.title}>Backlog 課題を紐付ける</span>
          <button className={styles.btnClose} onClick={onClose}>×</button>
        </div>
        <p className={styles.desc}>
          選択した Backlog 課題をこのタスクに紐付けます。
          タスク名・開始日・期日が課題の内容で上書きされます。
        </p>

        <input
          className={styles.search}
          placeholder="課題キーまたはタイトルで絞り込み..."
          value={query}
          onChange={e => setQuery(e.target.value)}
        />

        {loading && <div className={styles.loading}>読み込み中...</div>}
        {error   && <div className={styles.error}>{error}</div>}

        <div className={styles.list}>
          {!loading && filtered.length === 0 && (
            <div className={styles.empty}>該当する課題がありません</div>
          )}
          {filtered.map(issue => (
            <button
              key={issue.id}
              className={styles.issueRow}
              onClick={() => onLinked(issue)}
            >
              <span className={styles.issueKey}>{issue.issueKey}</span>
              <div className={styles.issueBody}>
                <div className={styles.issueSummary}>{issue.summary}</div>
                {(issue.startDate || issue.dueDate) && (
                  <div className={styles.issueDates}>
                    {issue.startDate && <span>開始: {issue.startDate.slice(0,10)}</span>}
                    {issue.dueDate   && <span>期日: {issue.dueDate.slice(0,10)}</span>}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
