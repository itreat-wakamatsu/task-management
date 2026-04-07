import { useState, useEffect } from 'react'
import { useStore }  from '@/store/useStore'
import { supabase }  from '@/lib/supabase'
import styles from './McpSettingsModal.module.css'

export default function McpSettingsModal({ onClose }) {
  const { session } = useStore()
  const [apiKey,   setApiKey]   = useState(null)   // DB上のキー行
  const [loading,  setLoading]  = useState(true)
  const [copying,  setCopying]  = useState(false)
  const [revoking, setRevoking] = useState(false)

  const appUrl = window.location.origin

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('mcp_api_keys')
      .select('id, key, name, created_at, last_used_at')
      .eq('user_id', session.user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setApiKey(data || null)
    setLoading(false)
  }

  async function generate() {
    setLoading(true)
    const { data, error } = await supabase
      .from('mcp_api_keys')
      .insert({ user_id: session.user.id, name: 'デフォルト' })
      .select()
      .single()
    if (!error) setApiKey(data)
    setLoading(false)
  }

  async function revoke() {
    if (!apiKey || !confirm('このAPIキーを無効化しますか？\n接続中のAIツールが切断されます。')) return
    setRevoking(true)
    await supabase.from('mcp_api_keys').update({ is_active: false }).eq('id', apiKey.id)
    setApiKey(null)
    setRevoking(false)
  }

  // MCP URL（クエリパラメータ形式 — claude.ai Integrations などで使用）
  const mcpUrl = apiKey ? `${appUrl}/api/mcp?key=${apiKey.key}` : ''

  // Claude Desktop 用の設定JSON（Bearer ヘッダー形式）
  const desktopConfig = apiKey
    ? JSON.stringify({
        mcpServers: {
          'task-management': {
            type: 'http',
            url:  `${appUrl}/api/mcp`,
            headers: { Authorization: `Bearer ${apiKey.key}` },
          },
        },
      }, null, 2)
    : ''

  const [copyTarget, setCopyTarget] = useState(null) // 'url' | 'config'

  async function copy(target) {
    const text = target === 'url' ? mcpUrl : desktopConfig
    await navigator.clipboard.writeText(text)
    setCopyTarget(target)
    setTimeout(() => setCopyTarget(null), 2000)
  }

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>

        {/* ヘッダー */}
        <div className={styles.header}>
          <span className={styles.title}>MCP 連携設定</span>
          <button className={styles.close} onClick={onClose}>×</button>
        </div>

        <div className={styles.body}>
          {loading ? (
            <div className={styles.loading}>読み込み中...</div>
          ) : apiKey ? (
            <>
              {/* APIキー表示 */}
              <section className={styles.section}>
                <div className={styles.label}>API キー</div>
                <div className={styles.keyRow}>
                  <code className={styles.keyCode}>{apiKey.key}</code>
                  <button
                    className={styles.btnDanger}
                    onClick={revoke}
                    disabled={revoking}
                  >
                    無効化
                  </button>
                </div>
                <div className={styles.hint}>
                  {apiKey.last_used_at
                    ? `最終使用: ${new Date(apiKey.last_used_at).toLocaleString('ja-JP')}`
                    : `生成日: ${new Date(apiKey.created_at).toLocaleString('ja-JP')}`}
                </div>
              </section>

              {/* MCP URL（claude.ai Integrations など） */}
              <section className={styles.section}>
                <div className={styles.label}>MCP URL</div>
                <p className={styles.desc}>
                  Claude.ai の Integrations など、URL 一つで設定できるツール向けです。
                </p>
                <div className={styles.urlRow}>
                  <code className={styles.urlCode}>{mcpUrl}</code>
                  <button className={styles.btnCopy} onClick={() => copy('url')}>
                    {copyTarget === 'url' ? '✓' : 'コピー'}
                  </button>
                </div>
              </section>

              {/* Claude Desktop 設定 */}
              <section className={styles.section}>
                <div className={styles.label}>Claude Desktop 設定</div>
                <p className={styles.desc}>
                  以下の設定を Claude Desktop の設定ファイルに貼り付けてください。
                </p>
                <pre className={styles.configBox}>{desktopConfig}</pre>
                <button className={styles.btnCopy} onClick={() => copy('config')}>
                  {copyTarget === 'config' ? '✓ コピーしました' : '設定をコピー'}
                </button>
              </section>

              {/* 設定ファイルの場所 */}
              <section className={styles.section}>
                <div className={styles.label}>設定ファイルの場所</div>
                <div className={styles.pathList}>
                  <div className={styles.pathRow}>
                    <span className={styles.pathOs}>Mac</span>
                    <code className={styles.pathCode}>~/Library/Application Support/Claude/claude_desktop_config.json</code>
                  </div>
                  <div className={styles.pathRow}>
                    <span className={styles.pathOs}>Win</span>
                    <code className={styles.pathCode}>%APPDATA%\Claude\claude_desktop_config.json</code>
                  </div>
                </div>
                <div className={styles.hint}>
                  設定後は Claude Desktop を再起動してください。
                </div>
              </section>
            </>
          ) : (
            /* APIキー未生成 */
            <section className={styles.section}>
              <div className={styles.label}>APIキーの生成</div>
              <p className={styles.desc}>
                APIキーを生成すると、Claude などの AI ツールからこのアプリの
                タスク・実績・カレンダーデータへアクセスできるようになります。
              </p>
              <ul className={styles.featureList}>
                <li>タスクの漏れ確認・優先度整理</li>
                <li>来週分のスケジュールを自動で作成</li>
                <li>クライアント別・案件別の工数集計</li>
                <li>週次レポートの下書き生成</li>
              </ul>
              <button className={styles.btnGenerate} onClick={generate}>
                APIキーを生成する
              </button>
            </section>
          )}
        </div>

      </div>
    </div>
  )
}
