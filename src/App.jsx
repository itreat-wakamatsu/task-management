import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/store/useStore'
import LoginPage   from '@/components/Auth/LoginPage'
import AppLayout   from '@/components/Layout/AppLayout'

export default function App() {
  const { session, setSession } = useStore()

  useEffect(() => {
    // 初回セッション取得
    supabase.auth.getSession().then(({ data }) => setSession(data.session))

    // セッション変更を監視
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess)
    })
    return () => subscription.unsubscribe()
  }, [setSession])

  if (session === null) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route path="/"          element={<AppLayout />} />
      <Route path="/today"     element={<Navigate to="/" replace />} />
      <Route path="*"          element={<Navigate to="/" replace />} />
    </Routes>
  )
}
