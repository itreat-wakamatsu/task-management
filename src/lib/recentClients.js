const KEY     = 'recent_client_ids'
const MAX_LEN = 5

export function getRecentClientIds() {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function pushRecentClientId(clientId) {
  if (!clientId) return
  const id   = parseInt(clientId)
  const prev = getRecentClientIds().filter(x => x !== id)
  localStorage.setItem(KEY, JSON.stringify([id, ...prev].slice(0, MAX_LEN)))
}

/** options配列を「最近使ったクライアント優先」で並び替える */
export function sortByRecent(options) {
  const recentIds = getRecentClientIds()
  if (recentIds.length === 0) return options
  const recentSet = new Set(recentIds.map(String))
  const recent  = recentIds
    .map(id => options.find(o => String(o.value) === String(id)))
    .filter(Boolean)
  const rest    = options.filter(o => !recentSet.has(String(o.value)))
  return [...recent, ...rest]
}
