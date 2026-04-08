import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import styles from './LoginPage.module.css'

const isDev = import.meta.env.DEV || import.meta.env.VITE_APP_ENV === 'development'

export default function LoginPage() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState(null)
  const [loading,  setLoading]  = useState(false)

  async function handleGoogleLogin() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        scopes: 'https://www.googleapis.com/auth/calendar',
        redirectTo: window.location.origin,
        queryParams: {
          access_type: 'offline',  // リフレッシュトークンを取得する
          prompt: 'consent',       // 再ログイン時もリフレッシュトークンを返させる
        },
      },
    })
  }

  async function handleEmailLogin(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) setError(err.message)
    setLoading(false)
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.logo}>⏱</div>
        <h1 className={styles.title}>タスクタイマー</h1>
        <p className={styles.sub}>Googleカレンダーと連携して、予定時間を守る習慣を作ります。</p>
        <button className={styles.btn} onClick={handleGoogleLogin}>
          <GoogleIcon />
          Google アカウントでログイン
        </button>

        {isDev && (
          <div className={styles.devSection}>
            <div className={styles.devLabel}>DEV MODE</div>
            <form onSubmit={handleEmailLogin} className={styles.devForm}>
              <input
                className={styles.devInput}
                type="email"
                placeholder="Email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
              <input
                className={styles.devInput}
                type="password"
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
              {error && <div className={styles.devError}>{error}</div>}
              <button className={styles.devBtn} type="submit" disabled={loading}>
                {loading ? 'ログイン中...' : 'メールでログイン'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"/>
    </svg>
  )
}
