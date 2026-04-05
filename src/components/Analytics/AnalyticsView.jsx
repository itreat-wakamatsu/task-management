import { useState, useEffect } from 'react'
import { useStore } from '@/store/useStore'
import { supabase } from '@/lib/supabase'
import FeedbackCard from '@/components/shared/FeedbackCard'
import SearchableSelect from '@/components/shared/SearchableSelect'
import styles from './AnalyticsView.module.css'

const SUBTABS = ['日別', '月別', 'タスク別', '案件別', 'カテゴリ別']

function fmtM(m) {
  const h = Math.floor(Math.abs(m) / 60), rm = Math.abs(m) % 60
  return h > 0 ? (rm > 0 ? `${h}h${rm}m` : `${h}h`) : `${m}分`
}
function effColor(eff) { return eff > 110 ? '#A32D2D' : eff > 100 ? '#854F0B' : '#3B6D11' }
function diffStr(d)    { return (d >= 0 ? '+' : '') + d + '分' }

export default function AnalyticsView() {
  const [tab,     setTab]     = useState(0)
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)

  const { session, clients, projects, categories, appTasks } = useStore()

  // 実績データ読み込み（直近30日）
  useEffect(() => {
    async function load() {
      setLoading(true)
      const since = new Date()
      since.setDate(since.getDate() - 30)
      const sinceStr = since.toISOString().slice(0, 10)

      // FK結合を使わず2ステップで取得（DB側にFK制約がなくても動作する）
      const { data: recordRows } = await supabase
        .from('app_records')
        .select('id, target_date')
        .eq('user_id', session.user.id)
        .gte('target_date', sinceStr)

      const recordIds = (recordRows || []).map(r => r.id)
      const recordMap = Object.fromEntries((recordRows || []).map(r => [r.id, r]))

      if (!recordIds.length) {
        setRecords([])
        setLoading(false)
        return
      }

      const { data: details } = await supabase
        .from('app_record_details')
        .select('*')
        .in('record_id', recordIds)
        .not('actual_end', 'is', null)

      // app_records の情報を各 detail に付加
      const enriched = (details || []).map(r => ({
        ...r,
        app_records: recordMap[r.record_id] || null,
      }))

      setRecords(enriched)
      setLoading(false)
    }
    load()
  }, [session.user.id])

  // 正味作業時間(分)を計算
  function netMinutes(r) {
    if (r.override_elapsed_ms != null) return Math.round(r.override_elapsed_ms / 60000)
    const ms = new Date(r.actual_end) - new Date(r.actual_start)
    let paused = 0
    for (const p of (r.pause_log || [])) {
      if (p.s && p.e) paused += new Date(p.e) - new Date(p.s)
    }
    return Math.round((ms - paused) / 60000)
  }

  function plannedMinutes(r) {
    if (!r.planned_start || !r.planned_end) return 0
    return Math.round((new Date(r.planned_end) - new Date(r.planned_start)) / 60000)
  }

  if (loading) return <div className={styles.loading}>集計データを読み込んでいます...</div>

  return (
    <div>
      {/* サブタブ */}
      <div className={styles.subtabs}>
        {SUBTABS.map((t, i) => (
          <button
            key={i}
            className={`${styles.subtab} ${tab === i ? styles.active : ''}`}
            onClick={() => setTab(i)}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 0 && <DailyTab    records={records} netM={netMinutes} planM={plannedMinutes} clients={clients} />}
      {tab === 1 && <MonthlyTab  records={records} netM={netMinutes} planM={plannedMinutes} />}
      {tab === 2 && <TaskTab     records={records} netM={netMinutes} planM={plannedMinutes} appTasks={appTasks} clients={clients} projects={projects} />}
      {tab === 3 && <ProjectTab  records={records} netM={netMinutes} planM={plannedMinutes} appTasks={appTasks} clients={clients} projects={projects} />}
      {tab === 4 && <CategoryTab records={records} netM={netMinutes} planM={plannedMinutes} appTasks={appTasks} projects={projects} categories={categories} clients={clients} />}
    </div>
  )
}

// ── 日別 ──
function DailyTab({ records, netM, planM, clients }) {
  const [range,    setRange]    = useState('14')
  const [filterCl, setFilterCl] = useState('')

  const since = new Date()
  since.setDate(since.getDate() - parseInt(range))

  const filtered = records.filter(r => {
    const d = r.app_records?.target_date
    if (!d || new Date(d) < since) return false
    return true
  })

  // 日別グループ
  const byDate = {}
  filtered.forEach(r => {
    const d = r.app_records?.target_date || '不明'
    if (!byDate[d]) byDate[d] = []
    byDate[d].push(r)
  })

  let totalPlan = 0, totalActual = 0, ot = 0
  filtered.forEach(r => { const p = planM(r), a = netM(r); totalPlan += p; totalActual += a; if (a > p) ot += a - p })

  return (
    <div>
      <div className={styles.filterBar}>
        <select value={range} onChange={e => setRange(e.target.value)}>
          <option value="7">直近7日</option>
          <option value="14">直近14日</option>
          <option value="30">直近30日</option>
        </select>
        <div className={styles.filterItem}>
          <SearchableSelect
            options={clients.map(c => ({ value: String(c.id), label: c.display_name || c.name }))}
            value={filterCl}
            onChange={setFilterCl}
            placeholder="全クライアント"
          />
        </div>
      </div>
      <StatGrid items={[
        { label: '記録日数',   value: Object.keys(byDate).length + '日', cls: 'b' },
        { label: '総超過時間', value: (ot > 0 ? '+' : '') + fmtM(Math.round(ot)), cls: ot > 0 ? 'r' : 'g' },
        { label: '全体効率',   value: totalActual > 0 ? Math.round(totalPlan / totalActual * 100) + '%' : '-', cls: totalActual <= totalPlan ? 'g' : 'r' },
      ]} />
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead><tr><th>日付</th><th>タスク</th><th>予定</th><th>実績</th><th>差分</th></tr></thead>
          <tbody>
            {Object.entries(byDate).sort((a,b) => b[0].localeCompare(a[0])).flatMap(([date, rows]) =>
              rows.map((r, i) => {
                const p = planM(r), a = netM(r), d = a - p
                return (
                  <tr key={r.id}>
                    <td className={styles.tdDate}>{i === 0 ? date : ''}</td>
                    <td>{r.calendar_event_title}</td>
                    <td className={styles.mono}>{fmtM(p)}</td>
                    <td className={styles.mono}>{fmtM(a)}</td>
                    <td><span style={{ color: effColor(a > 0 ? Math.round(a/p*100) : 100) }}>{diffStr(d)}</span></td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── 月別 ──
function MonthlyTab({ records, netM, planM }) {
  const byMonth = {}
  records.forEach(r => {
    const m = (r.app_records?.target_date || '').slice(0, 7)
    if (!m) return
    if (!byMonth[m]) byMonth[m] = { plan: 0, actual: 0, count: 0 }
    byMonth[m].plan   += planM(r)
    byMonth[m].actual += netM(r)
    byMonth[m].count  += 1
  })

  const months = Object.entries(byMonth).sort((a, b) => b[0].localeCompare(a[0]))
  const totP   = months.reduce((s, [, v]) => s + v.plan,   0)
  const totA   = months.reduce((s, [, v]) => s + v.actual, 0)

  return (
    <div>
      <StatGrid items={[
        { label: '集計月数',   value: months.length + 'ヶ月', cls: 'b' },
        { label: '累計作業時間', value: fmtM(totA), cls: 'b' },
        { label: '平均効率',    value: totA > 0 ? Math.round(totP / totA * 100) + '%' : '-', cls: totA <= totP ? 'g' : 'r' },
      ]} />
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead><tr><th>月</th><th>タスク数</th><th>予定</th><th>実績</th><th>差分</th><th>効率</th></tr></thead>
          <tbody>
            {months.map(([m, v]) => {
              const diff = v.actual - v.plan
              const eff  = v.actual > 0 ? Math.round(v.plan / v.actual * 100) : 100
              return (
                <tr key={m}>
                  <td style={{ fontWeight: 600 }}>{m.replace('-', '年')}月</td>
                  <td>{v.count}件</td>
                  <td className={styles.mono}>{fmtM(v.plan)}</td>
                  <td className={styles.mono}>{fmtM(v.actual)}</td>
                  <td><span style={{ color: effColor(eff) }}>{diffStr(diff)}</span></td>
                  <td><span style={{ color: effColor(eff), fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{eff}%</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── タスク別 ──
function TaskTab({ records, netM, planM, appTasks, clients, projects }) {
  const [filterCl, setFilterCl] = useState('')
  const [filterPj, setFilterPj] = useState('')
  const [sort,     setSort]     = useState('eff')

  const byTask = {}
  records.forEach(r => {
    const tid = r.task_id
    if (!tid) return
    const task = appTasks.find(t => t.id === tid)
    if (!task) return
    if (filterCl && task.client_id !== parseInt(filterCl)) return
    if (filterPj && task.project_id !== parseInt(filterPj)) return
    if (!byTask[tid]) byTask[tid] = { task, plan: 0, actual: 0, sessions: 0 }
    byTask[tid].plan    += planM(r)
    byTask[tid].actual  += netM(r)
    byTask[tid].sessions += 1
  })

  let items = Object.values(byTask)
  if (sort === 'eff')  items.sort((a, b) => b.actual/b.plan - a.actual/a.plan)
  if (sort === 'diff') items.sort((a, b) => (b.actual - b.plan) - (a.actual - a.plan))
  if (sort === 'plan') items.sort((a, b) => b.plan - a.plan)

  const totP = items.reduce((s, v) => s + v.plan,   0)
  const totA = items.reduce((s, v) => s + v.actual, 0)
  const over = items.filter(v => v.actual > v.plan).length

  return (
    <div>
      <div className={styles.filterBar}>
        <div className={styles.filterItem}>
          <SearchableSelect
            options={clients.map(c => ({ value: String(c.id), label: c.display_name || c.name }))}
            value={filterCl}
            onChange={setFilterCl}
            placeholder="全クライアント"
          />
        </div>
        <div className={styles.filterItem}>
          <SearchableSelect
            options={projects.map(p => ({ value: String(p.id), label: p.name }))}
            value={filterPj}
            onChange={setFilterPj}
            placeholder="全案件"
          />
        </div>
      </div>
      <div className={styles.sortRow}>
        <span className={styles.sortLabel}>並び順：</span>
        {[['eff','効率が低い順'],['diff','超過時間順'],['plan','予定工数順']].map(([v, lbl]) => (
          <button key={v} className={`${styles.sortBtn} ${sort === v ? styles.sortActive : ''}`} onClick={() => setSort(v)}>{lbl}</button>
        ))}
      </div>
      <StatGrid items={[
        { label: 'タスク数',   value: items.length + '件', cls: 'b' },
        { label: '超過タスク', value: over + '件', cls: over > 0 ? 'r' : 'g' },
        { label: '全体効率',   value: totA > 0 ? Math.round(totP / totA * 100) + '%' : '-', cls: totA <= totP ? 'g' : 'r' },
      ]} />
      <div className={styles.cardGrid}>
        {items.map(({ task, plan, actual, sessions }) => {
          const cl = clients.find(c => c.id === task.client_id)
          const pj = projects.find(p => p.id === task.project_id)
          return (
            <FeedbackCard
              key={task.id}
              title={task.title}
              plan={plan}
              actual={actual}
              sessions={sessions}
              chips={[
                cl && { label: cl.display_name || cl.name, color: cl.color },
                pj && { label: pj.name, color: '#888' },
                task.is_recurring && { label: '定期', color: '#085041' },
              ].filter(Boolean)}
            />
          )
        })}
        {items.length === 0 && <div className={styles.empty}>該当データがありません</div>}
      </div>
    </div>
  )
}

// ── 案件別 ──
function ProjectTab({ records, netM, planM, appTasks, clients, projects }) {
  const [filterCl, setFilterCl] = useState('')

  const byProj = {}
  records.forEach(r => {
    const task = appTasks.find(t => t.id === r.task_id)
    const pjid = task?.project_id
    if (!pjid) return
    const pj = projects.find(p => p.id === pjid)
    if (!pj) return
    if (filterCl && pj.client_id !== parseInt(filterCl)) return
    if (!byProj[pjid]) byProj[pjid] = { pj, plan: 0, actual: 0, sessions: 0 }
    byProj[pjid].plan    += planM(r)
    byProj[pjid].actual  += netM(r)
    byProj[pjid].sessions += 1
  })

  const items = Object.values(byProj).sort((a, b) => b.actual/b.plan - a.actual/a.plan)
  const totP  = items.reduce((s, v) => s + v.plan,   0)
  const totA  = items.reduce((s, v) => s + v.actual, 0)

  return (
    <div>
      <div className={styles.filterBar}>
        <div className={styles.filterItem}>
          <SearchableSelect
            options={clients.map(c => ({ value: String(c.id), label: c.display_name || c.name }))}
            value={filterCl}
            onChange={setFilterCl}
            placeholder="全クライアント"
          />
        </div>
      </div>
      <StatGrid items={[
        { label: '案件数',     value: items.length + '件', cls: 'b' },
        { label: '総予定工数', value: fmtM(totP), cls: 'b' },
        { label: '全体効率',   value: totA > 0 ? Math.round(totP / totA * 100) + '%' : '-', cls: totA <= totP ? 'g' : 'r' },
      ]} />
      <div className={styles.cardGrid}>
        {items.map(({ pj, plan, actual, sessions }) => {
          const cl = clients.find(c => c.id === pj.client_id)
          return (
            <FeedbackCard
              key={pj.id}
              title={pj.name}
              plan={plan}
              actual={actual}
              sessions={sessions}
              chips={[
                cl && { label: cl.display_name || cl.name, color: cl.color },
              ].filter(Boolean)}
            />
          )
        })}
        {items.length === 0 && <div className={styles.empty}>該当データがありません</div>}
      </div>
    </div>
  )
}

// ── カテゴリ別 ──
function CategoryTab({ records, netM, planM, appTasks, projects, categories, clients }) {
  const [filterPj, setFilterPj] = useState('')
  const [filterCl, setFilterCl] = useState('')

  const byCat = {}
  records.forEach(r => {
    const task = appTasks.find(t => t.id === r.task_id)
    if (!task) return
    const pj = projects.find(p => p.id === task.project_id)
    if (!pj) return
    if (filterPj && pj.id !== parseInt(filterPj)) return
    if (filterCl && pj.client_id !== parseInt(filterCl)) return
    const cat1id = task.category_id || 'none'
    const cat2id = task.subcategory_id || 'none'
    const key    = `${cat1id}__${cat2id}`
    if (!byCat[key]) byCat[key] = { cat1id, cat2id, pj, plan: 0, actual: 0, sessions: 0 }
    byCat[key].plan    += planM(r)
    byCat[key].actual  += netM(r)
    byCat[key].sessions += 1
  })

  // 第一区分でグループ化
  const byCat1 = {}
  Object.values(byCat).forEach(item => {
    if (!byCat1[item.cat1id]) byCat1[item.cat1id] = { items: [], plan: 0, actual: 0 }
    byCat1[item.cat1id].items.push(item)
    byCat1[item.cat1id].plan   += item.plan
    byCat1[item.cat1id].actual += item.actual
  })

  const totP = Object.values(byCat).reduce((s, v) => s + v.plan,   0)
  const totA = Object.values(byCat).reduce((s, v) => s + v.actual, 0)

  return (
    <div>
      <div className={styles.filterBar}>
        <div className={styles.filterItem}>
          <SearchableSelect
            options={clients.map(c => ({ value: String(c.id), label: c.display_name || c.name }))}
            value={filterCl}
            onChange={setFilterCl}
            placeholder="全クライアント"
          />
        </div>
        <div className={styles.filterItem}>
          <SearchableSelect
            options={projects.map(p => ({ value: String(p.id), label: p.name }))}
            value={filterPj}
            onChange={setFilterPj}
            placeholder="全案件"
          />
        </div>
      </div>
      <StatGrid items={[
        { label: '区分数',     value: Object.keys(byCat1).length + '区分', cls: 'b' },
        { label: '総予定',     value: fmtM(totP), cls: 'b' },
        { label: '全体効率',   value: totA > 0 ? Math.round(totP / totA * 100) + '%' : '-', cls: totA <= totP ? 'g' : 'r' },
      ]} />
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead><tr><th colSpan={2}>区分</th><th>予定</th><th>実績</th><th>効率</th><th>差分</th></tr></thead>
          <tbody>
            {Object.entries(byCat1).map(([cat1id, group]) => {
              const c1   = categories.find(c => c.id === parseInt(cat1id))
              const eff  = group.actual > 0 ? Math.round(group.plan / group.actual * 100) : 100
              const diff = group.actual - group.plan
              return [
                <tr key={`h${cat1id}`} className={styles.cat1Row}>
                  <td colSpan={2} style={{ fontWeight: 600 }}>{c1?.name || '（未分類）'}</td>
                  <td className={styles.mono}>{fmtM(group.plan)}</td>
                  <td className={styles.mono}>{fmtM(group.actual)}</td>
                  <td><span style={{ color: effColor(eff), fontWeight: 600 }}>{eff}%</span></td>
                  <td><span style={{ color: effColor(eff) }}>{diffStr(diff)}</span></td>
                </tr>,
                ...group.items.map(item => {
                  const c2   = categories.find(c => c.id === parseInt(item.cat2id))
                  const reff = item.actual > 0 ? Math.round(item.plan / item.actual * 100) : 100
                  const rd   = item.actual - item.plan
                  return (
                    <tr key={`${cat1id}_${item.cat2id}`}>
                      <td />
                      <td className={styles.cat2Cell}>{c2?.name || '（小区分なし）'}</td>
                      <td className={styles.mono}>{fmtM(item.plan)}</td>
                      <td className={styles.mono}>{fmtM(item.actual)}</td>
                      <td><span style={{ color: effColor(reff) }}>{reff}%</span></td>
                      <td><span style={{ color: effColor(reff) }}>{diffStr(rd)}</span></td>
                    </tr>
                  )
                }),
              ]
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── 共通: StatGrid ──
function StatGrid({ items }) {
  return (
    <div className={styles.statGrid}>
      {items.map((it, i) => (
        <div key={i} className={styles.statCard}>
          <div className={styles.statLabel}>{it.label}</div>
          <div className={`${styles.statVal} ${styles[it.cls]}`}>{it.value}</div>
        </div>
      ))}
    </div>
  )
}
