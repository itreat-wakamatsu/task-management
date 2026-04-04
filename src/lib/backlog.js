/**
 * Backlog API クライアント
 */

export function getAuthUrl(spaceKey, clientId) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     clientId,
    redirect_uri:  `${window.location.origin}/backlog-callback`,
    state:         'backlog_oauth',
  })
  return `https://${spaceKey}.backlog.com/OAuth2AccessRequest.action?${params}`
}

export async function exchangeCode({ code, spaceKey }) {
  const res = await fetch('/api/backlog-token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      code,
      redirect_uri: `${window.location.origin}/backlog-callback`,
      space_key:    spaceKey,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Token exchange failed')
  }
  return res.json()
}

export async function refreshAccessToken({ spaceKey, refreshToken }) {
  const res = await fetch('/api/backlog-token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      grant_type:    'refresh_token',
      refresh_token: refreshToken,
      space_key:     spaceKey,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Token refresh failed')
  }
  return res.json()
}

async function apiFetch(spaceKey, accessToken, path) {
  const res = await fetch(
    `https://${spaceKey}.backlog.com/api/v2${path}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  if (!res.ok) throw new Error(`Backlog API error: ${res.status}`)
  return res.json()
}

export async function getMyself(spaceKey, accessToken) {
  return apiFetch(spaceKey, accessToken, '/users/myself')
}

export async function getMyIssues(spaceKey, accessToken, assigneeId) {
  const params = new URLSearchParams({ count: '100' })
  params.append('assigneeId[]', assigneeId)
  params.append('statusId[]', '1')
  params.append('statusId[]', '2')
  params.append('statusId[]', '3')
  return apiFetch(spaceKey, accessToken, `/issues?${params}`)
}
