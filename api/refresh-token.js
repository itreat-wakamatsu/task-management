import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  // Supabase JWT でユーザーを特定
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' })

  const jwt = auth.slice(7)
  const { data: { user }, error } = await supabase.auth.getUser(jwt)
  if (error || !user) return res.status(401).json({ error: 'Invalid token' })

  // user_google_tokens から refresh_token を取得
  const { data: tokenRow } = await supabase
    .from('user_google_tokens')
    .select('refresh_token')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!tokenRow?.refresh_token) {
    return res.status(404).json({ error: 'No refresh token stored. Please re-login with Google.' })
  }

  // Google OAuth で新しい access_token を取得
  const params = new URLSearchParams({
    grant_type:    'refresh_token',
    refresh_token: tokenRow.refresh_token,
    client_id:     process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
  })

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    params,
  })

  if (!tokenRes.ok) {
    const err = await tokenRes.json()
    console.error('[refresh-token] Google error:', err)
    return res.status(502).json({ error: 'Failed to refresh Google token' })
  }

  const { access_token, expires_in } = await tokenRes.json()
  return res.status(200).json({ access_token, expires_in })
}
