import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/store/useStore'
import LoginPage       from '@/components/Auth/LoginPage'
import AppLayout       from '@/components/Layout/AppLayout'
import BacklogCallback from '@/components/Backlog/BacklogCallback'

/** Google refresh_token を Supabase に保存（MCP からの自動更新に使用） */
async function saveGoogleRefreshToken(session) {
  try {
    await supabase.from('user_google_tokens').upsert(
      { user_id: session.user.id, refresh_token: session.provider_refresh_token },
      { onConflict: 'user_id' }
    )
  } catch (e) {
    // テーブルが未作成の場合は静かに無視（アプリ動作には影響しない）
    console.warn('[saveGoogleRefreshToken]', e)
  }
}

export default function App() {
  const { session, setSession } = useStore()
  const [sessionLoaded, setSessionLoaded] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setSessionLoaded(true)
      // 起動時に refresh_token を保存（既存セッションの場合）
      if (data.session?.provider_refresh_token) {
        saveGoogleRefreshToken(data.session)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess)
      // ログイン時に refresh_token を保存
      if (sess?.provider_refresh_token) {
        saveGoogleRefreshToken(sess)
      }
    })
    return () => subscription.unsubscribe()
  }, [setSession])

  // セッション読み込み中はローディング表示（BacklogCallback が session を必要とするため）
  if (!sessionLoaded) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#999', fontSize: '0.875rem' }}>読み込み中...</div>
  }

  if (!session) {
    return (
      <Routes>
        <Route path="/backlog-callback" element={<BacklogCallback />} />
        <Route path="*"                 element={<LoginPage />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route path="/"                 element={<AppLayout />} />
      <Route path="/backlog-callback" element={<BacklogCallback />} />
      <Route path="/today"            element={<Navigate to="/" replace />} />
      <Route path="*"                 element={<Navigate to="/" replace />} />
    </Routes>
  )
}
