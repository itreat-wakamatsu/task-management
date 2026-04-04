/**
 * Backlog OAuth トークン交換・リフレッシュ
 * Vercel Serverless Function
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const clientId     = process.env.VITE_BACKLOG_CLIENT_ID
  const clientSecret = process.env.BACKLOG_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: 'Backlog credentials not configured on server' })
  }

  const { grant_type = 'authorization_code', code, redirect_uri, refresh_token, space_key } = req.body

  if (!space_key) return res.status(400).json({ error: 'space_key is required' })

  const tokenUrl    = `https://${space_key}.backlog.com/api/v2/oauth2/token`
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const body = new URLSearchParams({ grant_type })
  if (grant_type === 'authorization_code') {
    body.set('code', code)
    body.set('redirect_uri', redirect_uri)
  } else if (grant_type === 'refresh_token') {
    body.set('refresh_token', refresh_token)
  }

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
    },
    body,
  })

  if (!response.ok) {
    const err = await response.text()
    return res.status(response.status).json({ error: err })
  }

  const data = await response.json()
  return res.status(200).json(data)
}
