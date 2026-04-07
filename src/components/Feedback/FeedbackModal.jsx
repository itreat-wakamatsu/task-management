import { useState } from 'react'
import { useStore }  from '@/store/useStore'
import { supabase }  from '@/lib/supabase'
import styles from './FeedbackModal.module.css'

const CATEGORIES = [
  '今日の予定',
  'タスク管理',
  '集計・履歴',
  'Backlog 連携',
  'Google Calendar 連携',
  'MCP 設定',
  'その他',
]

const TYPES = [
  { value: '要望',   label: '要望（こうしてほしい）' },
  { value: '不具合', label: '不具合（動かない・おかしい）' },
  { value: '質問',   label: '質問（使い方がわからない）' },
  { value: 'その他', label: 'その他' },
]

const PRIORITIES = ['低', '中', '高']

export default function FeedbackModal({ onClose, activeTab }) {
  const { session } = useStore()
  const userName  = session?.user?.user_metadata?.full_name || session?.user?.email?.split('@')[0] || ''
  const userEmail = session?.user?.email || ''

  const [category, setCategory] = useState('')
  const [type,     setType]     = useState('')
  const [priority, setPriority] = useState('中')
  const [body,     setBody]     = useState('')
  const [name,     setName]     = useState(userName)
  const [email,    setEmail]    = useState(userEmail)
  const [sending,  setSending]  = useState(false)
  const [sent,     setSent]     = useState(false)
  const [error,    setError]    = useState(null)

  const canSubmit = category && type && body.trim()

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    setSending(true)
    setError(null)

    const { error: err } = await supabase.from('app_feedback').insert({
      user_id:     session.user.id,
      category,
      type,
      priority,
      body:        body.trim(),
      name:        name.trim(),
      email:       email.trim() || null,
      current_tab: activeTab || null,
      user_agent:  navigator.userAgent,
    })

    setSending(false)
    if (err) {
      console.error('フィードバック送信エラー:', err)
      setError('送信に失敗しました。しばらくしてから再度お試しください。')
    } else {
      setSent(true)
    }
  }

  if (sent) {
    return (
      <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
        <div className={styles.modal}>
          <div className={styles.success}>
            <div className={styles.successIcon}>&#x2714;</div>
            <div className={styles.successTitle}>フィードバックを送信しました</div>
            <div className={styles.successDesc}>
              ご意見ありがとうございます。<br />
              今後の改善に活用させていただきます。
            </div>
            <button className={styles.btnClose} onClick={onClose}>閉じる</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.title}>フィードバックを送る</span>
          <button className={styles.close} onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.body}>
            {/* カテゴリ & 種別 */}
            <div className={styles.row}>
              <div className={styles.field}>
                <label className={styles.label}>
                  カテゴリ<span className={styles.required}>*</span>
                </label>
                <select className={styles.select} value={category} onChange={e => setCategory(e.target.value)}>
                  <option value="">選択してください</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>
                  種別<span className={styles.required}>*</span>
                </label>
                <select className={styles.select} value={type} onChange={e => setType(e.target.value)}>
                  <option value="">選択してください</option>
                  {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>

            {/* 緊急度 */}
            <div className={styles.field}>
              <label className={styles.label}>緊急度</label>
              <select className={styles.select} value={priority} onChange={e => setPriority(e.target.value)}>
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            {/* 本文 */}
            <div className={styles.field}>
              <label className={styles.label}>
                内容<span className={styles.required}>*</span>
              </label>
              <textarea
                className={styles.textarea}
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder="具体的な内容を教えてください（再現手順、期待する動作など）"
              />
            </div>

            {/* 名前 & メール */}
            <div className={styles.row}>
              <div className={styles.field}>
                <label className={styles.label}>お名前</label>
                <input className={styles.input} value={name} onChange={e => setName(e.target.value)} placeholder="山田 太郎" />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>メールアドレス</label>
                <input className={styles.input} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="連絡先（任意）" />
              </div>
            </div>

            {error && <div className={styles.error}>{error}</div>}
          </div>

          <div className={styles.footer}>
            <button type="button" className={styles.btnCancel} onClick={onClose}>キャンセル</button>
            <button type="submit" className={styles.btnSubmit} disabled={!canSubmit || sending}>
              {sending ? '送信中...' : '送信する'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
