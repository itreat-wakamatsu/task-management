import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/store/useStore'
import LoginPage       from '@/components/Auth/LoginPage'
import AppLayout       from '@/components/Layout/AppLayout'
import BacklogCallback from '@/components/Backlog/BacklogCallback'

export default function App() {
  const { session, setSession } = useStore()
  const [sessionLoaded, setSessionLoaded] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setSessionLoaded(true)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess)
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
