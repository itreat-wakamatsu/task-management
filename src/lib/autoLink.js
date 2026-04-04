/**
 * タスク自動紐付けロジック
 *
 * スコアリング方針:
 *  1. 過去の使用履歴（usage_count）を最優先
 *  2. タイトルの単語レベル一致率
 *  3. 完了タスク（status=2）は候補から除外
 */

/** イベントタイトルとタスク一覧からスコア付き候補を返す */
export function scoreCandidates(eventTitle, tasks) {
  const eWords = tokenize(eventTitle)

  return tasks
    .filter(t => t.status !== 2) // 完了タスクを除外
    .map(t => {
      const tWords  = tokenize(t.title)
      const overlap = eWords.filter(w => tWords.some(tw => tw.includes(w) || w.includes(tw)))
      const titleScore = eWords.length > 0
        ? overlap.length / Math.max(eWords.length, tWords.length)
        : 0

      // 使用履歴ボーナス（最大 0.3 上乗せ）
      const historyBonus = Math.min((t.usageCount || 0) / 20, 0.3)

      return { ...t, score: Math.min(titleScore + historyBonus, 1.0) }
    })
    .sort((a, b) => b.score - a.score)
}

/**
 * 自動紐付けを試みる
 * @returns { taskId, confidence: 'high'|'medium'|'none' }
 */
export function autoLink(eventTitle, tasks) {
  const cands = scoreCandidates(eventTitle, tasks)
  if (!cands.length) return { taskId: null, confidence: 'none' }

  const top = cands[0]
  if (top.score >= 0.65) return { taskId: top.id, confidence: 'high' }
  if (top.score >= 0.35) return { taskId: top.id, confidence: 'medium' }
  return { taskId: null, confidence: 'none' }
}

/** タイトルをトークン分割（日本語・英語対応） */
function tokenize(str) {
  return (str || '')
    .split(/[\s　・\-_/／・（）()【】「」]+/)
    .filter(w => w.length > 1)
    .map(w => w.toLowerCase())
}
