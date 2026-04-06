/**
 * クライアントカラーユーティリティ
 * ユーザーごとに localStorage に保存した色を優先し、なければ決定論的パレットを使用
 */

const PALETTE = [
  '#6366f1', '#f59e0b', '#10b981', '#ef4444',
  '#8b5cf6', '#14b8a6', '#f97316', '#06b6d4',
  '#84cc16', '#ec4899', '#3b82f6', '#a855f7',
]

const DEFAULT_DB_COLOR = '#378ADD'

// ログイン中のユーザーID（App.jsx から setColorUserId で設定）
let _userId = null
export function setColorUserId(userId) { _userId = userId }

/**
 * クライアントの表示色を返す
 * 優先順: localStorage(ユーザー別) > DBの独自色 > パレット
 */
export function getClientColor(client) {
  if (!client) return null
  if (_userId) {
    const stored = localStorage.getItem(`cc_${_userId}_${client.id}`)
    if (stored) return stored
  }
  if (client.color && client.color !== DEFAULT_DB_COLOR) return client.color
  return PALETTE[client.id % PALETTE.length]
}

/**
 * クライアントの色を localStorage に保存（ユーザー別）
 */
export function saveClientColor(userId, clientId, hex) {
  localStorage.setItem(`cc_${userId}_${clientId}`, hex)
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
