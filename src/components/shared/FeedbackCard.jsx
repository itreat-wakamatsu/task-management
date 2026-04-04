import styles from './FeedbackCard.module.css'

function fmtM(m) {
  const h = Math.floor(Math.abs(m) / 60), rm = Math.abs(m) % 60
  return h > 0 ? (rm > 0 ? `${h}h${rm}m` : `${h}h`) : `${m}分`
}

export default function FeedbackCard({ title, plan, actual, sessions, chips = [] }) {
  const eff     = actual > 0 && plan > 0 ? Math.round(actual / plan * 100) : 0
  const diff    = actual - plan
  const clsCard = eff > 110 ? styles.over : eff > 100 ? styles.warn : styles.ok
  const clsEff  = eff > 110 ? styles.effR : eff > 100 ? styles.effA : styles.effG
  const barCl   = eff > 110 ? '#E24B4A' : eff > 100 ? '#EF9F27' : '#639922'
  const barW    = Math.min(actual / (plan || 1), 1.5) / 1.5 * 100

  return (
    <div className={`${styles.card} ${clsCard}`}>
      <div className={styles.header}>
        <div className={styles.title}>{title}</div>
        <span className={`${styles.eff} ${clsEff}`}>{eff}%</span>
      </div>
      <div className={styles.chips}>
        {chips.map((ch, i) => (
          <span
            key={i}
            className={styles.chip}
            style={{ background: `${ch.color}18`, color: ch.color }}
          >
            {ch.label}
          </span>
        ))}
        <span className={styles.sessions}>{sessions}セッション</span>
      </div>
      <div className={styles.barWrap}>
        <div className={styles.barPlan}  style={{ width: `${Math.min(1, 1/1.5) * 100}%` }} />
        <div className={styles.barActual} style={{ width: `${barW}%`, background: barCl }} />
      </div>
      <div className={styles.nums}>
        <span>予定 {fmtM(plan)}</span>
        <span className={styles.diff} style={{ color: barCl }}>
          {diff >= 0 ? '+' : ''}{diff}分
        </span>
        <span>実績 {fmtM(actual)}</span>
      </div>
    </div>
  )
}
