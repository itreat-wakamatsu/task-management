/**
 * クライアントカラーユーティリティ
 * DB の clients.color が未設定（デフォルト '#378ADD'）の場合、ID から決定論的に色を割り当てる
 */

const PALETTE = [
  '#6366f1', // indigo
  '#f59e0b', // amber
  '#10b981', // emerald
  '#ef4444', // red
  '#8b5cf6', // violet
  '#14b8a6', // teal
  '#f97316', // orange
  '#06b6d4', // cyan
  '#84cc16', // lime
  '#ec4899', // pink
  '#3b82f6', // blue
  '#a855f7', // purple
]

const DEFAULT_DB_COLOR = '#378ADD'

/**
 * クライアントの表示色を返す
 * DB に独自色がある場合はそれを優先、なければパレットから割り当て
 */
export function getClientColor(client) {
  if (!client) return null
  if (client.color && client.color !== DEFAULT_DB_COLOR) return client.color
  return PALETTE[client.id % PALETTE.length]
}

/**
 * 16進カラーから rgba 背景色を生成（薄い）
 */
export function hexToRgba(hex, alpha = 0.12) {
  if (!hex || hex.length < 7) return null
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  if (isNaN(r) || isNaN(g) || isNaN(b)) return null
  return `rgba(${r},${g},${b},${alpha})`
}
