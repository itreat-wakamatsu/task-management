import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '@/store/useStore'
import { exchangeCode } from '@/lib/backlog'
import { supabase } from '@/lib/supabase'

export default function BacklogCallback() {
  const navigate              = useNavigate()
  const { session, setBacklogToken } = useStore()
  const [status, setStatus]   = useState('Backlog認証処理中...')
  const [error,  setError]    = useState(null)
  const [done,   setDone]     = useState(false)

  useEffect(() => {
    if (done) return
    // session が null (未ロード) の間は待機
    if (session === null) return

    const params   = new URLSearchParams(window.location.search)
    const code     = params.get('code')
    const state    = params.get('state')
    const spaceKey = sessionStorage.getItem('backlog_space_key')

    if (!code || state !== 'backlog_oauth') {
      setError('認証コードが取得できませんでした。最初からやり直してください。')
      return
    }
    if (!spaceKey) {
      setError('スペースキーが取得できませんでした。最初からやり直してください。')
      return
    }
    if (!session?.user?.id) {
      setError('ログインセッションが見つかりません。再度ログインしてください。')
      return
    }

    setDone(true)

    async function doExchange() {
      try {
        const data      = await exchangeCode({ code, spaceKey })
        const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString()
        const record    = {
          user_id:       session.user.id,
          access_token:  data.access_token,
          refresh_token: data.refresh_token,
          expires_at:    expiresAt,
          space_key:     spaceKey,
        }
        await supabase.from('backlog_tokens').upsert(record)
        setBacklogToken(record)
        sessionStorage.removeItem('backlog_space_key')
        setStatus('連携完了！ホームに戻ります...')
        setTimeout(() => navigate('/'), 1500)
      } catch (e) {
        setError(`エラーが発生しました: ${e.message}`)
      }
    }

    doExchange()
  }, [session, done])

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 16 }}>
      {error ? (
        <>
          <div style={{ color: '#e53e3e', fontSize: '0.9375rem' }}>{error}</div>
          <button onClick={() => navigate('/')} style={{ padding: '8px 20px', cursor: 'pointer', borderRadius: 8, border: '0.5px solid #ccc' }}>
            ホームに戻る
          </button>
        </>
      ) : (
        <div style={{ color: '#555', fontSize: '0.9375rem' }}>{status}</div>
      )}
    </div>
  )
}
