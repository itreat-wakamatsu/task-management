/**
 * チュートリアルのステップ定義
 *
 * 各 step のプロパティ:
 *   - title:          ステップ見出し
 *   - body:           説明テキスト
 *   - placement:      ポップオーバー位置 'bottom' | 'top' | 'center'
 *   - icon:           装飾アイコン（省略可）
 *
 *   ── インタラクティブ系 ──
 *   - highlight:       ハイライト対象の CSS セレクタ
 *   - clickTarget:     ユーザーにクリックさせる要素の CSS セレクタ
 *                      （highlight と同じ場合が多いが、別要素も指定可）
 *   - actionLabel:     クリック促進テキスト（例: "「今日」タブをクリック"）
 *
 *   clickTarget が設定されたステップは「次へ」ボタンが消え、
 *   ユーザーが実際にその要素をクリックすると次に進む。
 */

export const TUTORIALS = [
  {
    id: 'daily-workflow',
    title: '1日の使い方ガイド',
    description: 'タスクタイマーの基本的な使い方を学びます',
    icon: '📋',
    steps: [
      {
        title: 'ようこそ！タスクタイマーへ',
        body: 'このアプリは、1日の作業時間を正確に記録するためのツールです。\n\nGoogleカレンダーと連携し、予定ごとの実績時間を自動で計測できます。\n\nこのガイドでは、実際に画面を操作しながら使い方を覚えていきます。',
        placement: 'center',
      },
      {
        title: '① 今日の予定を確認',
        body: '「今日」タブには、Googleカレンダーから取得した本日の予定が一覧で表示されます。\n\nここが1日の作業のホーム画面です。',
        highlight: '[data-tutorial="tab-today"]',
        clickTarget: '[data-tutorial="tab-today"]',
        actionLabel: '「今日」タブをクリックしてみましょう',
        placement: 'bottom',
      },
      {
        title: '② タスクを登録する',
        body: '「タスク管理」タブで、作業内容をあらかじめ登録しておきます。\n\nクライアント・案件・カテゴリを設定することで、集計時にどの案件にどれだけ時間を使ったかがわかります。',
        highlight: '[data-tutorial="tab-tasks"]',
        clickTarget: '[data-tutorial="tab-tasks"]',
        actionLabel: '「タスク管理」タブをクリックしてみましょう',
        placement: 'bottom',
      },
      {
        title: '③ 予定とタスクを紐付ける',
        body: 'カレンダーの予定をクリックすると、登録済みタスクと紐付けができます。\n\n紐付けることで、その予定の実績時間がタスクに自動集計されます。',
        placement: 'center',
        icon: '🔗',
      },
      {
        title: '④ 作業を開始する',
        body: '予定の時間になったら「予定通り」ボタンまたは「▶ 開始」ボタンを押して作業を開始します。\n\nタイマーが自動で計測を始めます。',
        placement: 'center',
        icon: '▶️',
      },
      {
        title: '⑤ 一時停止・再開',
        body: '作業中に離席するときは「⏸ 一時停止」ボタンで計測を一時停止できます。\n\n戻ったら「▶ 再開」ボタンで計測が再開されます。\n中断時間は自動的に差し引かれます。',
        placement: 'center',
        icon: '⏸️',
      },
      {
        title: '⑥ 作業を終了する',
        body: '作業が終わったら「⏹ 終了」ボタンを押します。\n\n予定時間と実績時間が記録されます。',
        placement: 'center',
        icon: '⏹️',
      },
      {
        title: '⑦ 空き時間を活用',
        body: 'ヘッダーに表示される「空き ○時間○分」は、今日の残り空き時間です。\n\nタスク管理タブから「今日の予定に追加」で空き時間にタスクを入れられます。',
        highlight: '[data-tutorial="free-time"]',
        clickTarget: '[data-tutorial="free-time"]',
        actionLabel: '空き時間の表示を確認してみましょう',
        placement: 'bottom',
      },
      {
        title: '⑧ 集計・レポート',
        body: '「集計・履歴」タブで、案件ごと・日ごとの実績を確認できます。\n\n日報の作成にも活用できます。',
        highlight: '[data-tutorial="tab-analytics"]',
        clickTarget: '[data-tutorial="tab-analytics"]',
        actionLabel: '「集計・履歴」タブをクリックしてみましょう',
        placement: 'bottom',
      },
      {
        title: '⑨ ヘルプを見る',
        body: 'このアイコンからいつでもガイドを見返せます。\n\nBacklog連携ガイドもここから開始できます。',
        highlight: '[data-tutorial="help-btn"]',
        clickTarget: '[data-tutorial="help-btn"]',
        actionLabel: '「？」アイコンをクリックしてみましょう',
        placement: 'bottom',
      },
      {
        title: 'ガイド完了！',
        body: 'これで基本的な使い方は以上です。\n\nさっそく今日の作業を始めましょう！',
        placement: 'center',
        icon: '🎉',
      },
    ],
  },
  {
    id: 'backlog-setup',
    title: 'Backlog 連携ガイド',
    description: 'Backlogとの連携設定とタスクの取り込み方法を学びます',
    icon: '🔄',
    steps: [
      {
        title: 'Backlog 連携について',
        body: 'Backlogのタスク（課題）をタスクタイマーに取り込むことで、Backlogで管理している作業の時間計測が簡単にできます。\n\nまずは連携設定を行いましょう。',
        placement: 'center',
      },
      {
        title: '① Backlog ボタンを開く',
        body: 'ヘッダーの「Backlog」ボタンをクリックすると、連携設定画面が開きます。',
        highlight: '[data-tutorial="btn-backlog"]',
        clickTarget: '[data-tutorial="btn-backlog"]',
        actionLabel: '「Backlog」ボタンをクリックしてみましょう',
        placement: 'bottom',
      },
      {
        title: '② スペースキーを入力',
        body: 'Backlogのスペースキー（URLの「○○○.backlog.com」の○○○部分）を入力します。',
        placement: 'center',
        icon: '🔑',
      },
      {
        title: '③ API キーを入力',
        body: 'BacklogのAPIキーを入力します。\n\nAPIキーは Backlog の「個人設定」→「API」から発行できます。',
        placement: 'center',
        icon: '🔐',
      },
      {
        title: '④ 連携を保存',
        body: '入力が完了したら「保存」ボタンを押します。\n\n接続テストが自動で行われ、成功すると緑色の「連携済み」表示に変わります。',
        placement: 'center',
      },
      {
        title: '⑤ タスクを取り込む',
        body: '連携が完了したら、タスク管理画面でBacklogの課題をタスクとして取り込めます。\n\nプロジェクトや担当者でフィルタリングして必要な課題だけを選択できます。',
        placement: 'center',
        icon: '📥',
      },
      {
        title: '連携ガイド完了！',
        body: 'Backlog連携の設定方法は以上です。\n\n連携後は、Backlogで新しく課題が追加された際に、タスクタイマーにもワンクリックで取り込めるようになります。',
        placement: 'center',
        icon: '🎉',
      },
    ],
  },
]

/** localStorage キー */
export const STORAGE_KEY_COMPLETED = 'tutorial_completed'
export const STORAGE_KEY_DISMISSED = 'tutorial_dismissed'

/** 完了済みチュートリアルの取得 */
export function getCompletedTutorials() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY_COMPLETED) || '[]')
  } catch { return [] }
}

/** チュートリアルを完了済みにマーク */
export function markTutorialCompleted(id) {
  const completed = getCompletedTutorials()
  if (!completed.includes(id)) {
    localStorage.setItem(STORAGE_KEY_COMPLETED, JSON.stringify([...completed, id]))
  }
}

/** 「今後表示しない」の取得 */
export function isDismissedForever() {
  return localStorage.getItem(STORAGE_KEY_DISMISSED) === 'true'
}

/** 「今後表示しない」を設定 */
export function dismissForever() {
  localStorage.setItem(STORAGE_KEY_DISMISSED, 'true')
}

/** 「今後表示しない」を解除 */
export function resetDismiss() {
  localStorage.removeItem(STORAGE_KEY_DISMISSED)
}
