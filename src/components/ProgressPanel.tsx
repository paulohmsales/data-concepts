import { useState } from 'react'
import { Link } from 'react-router'
import { useCatalog } from '../lib/api.ts'
import { moduleFraction, resetProgress, useProgress } from '../lib/progress.ts'
import ProgressDot from './ProgressDot.tsx'
import styles from './ProgressPanel.module.css'

const WEEKS = 16

function Bar({ label, value, sub, to }: { label: string; value: number; sub: string; to?: string }) {
  const inner = (
    <>
      <span className={styles.barLabel}>{label}</span>
      <span className={styles.bar}>
        <span style={{ width: `${Math.round(value * 100)}%` }} className={value >= 1 ? styles.full : undefined} />
      </span>
      <span className={styles.barSub}>{sub}</span>
    </>
  )
  return to ? (
    <Link to={to} className={styles.barRow}>
      {inner}
    </Link>
  ) : (
    <div className={styles.barRow}>{inner}</div>
  )
}

/** Your learning progress: overall, by track, by role, and days studied. */
export default function ProgressPanel() {
  const { tracks, modules, roles } = useCatalog()
  const p = useProgress()
  const frac = (slug: string) => moduleFraction(modules.find((m) => m.slug === slug)!, p.modules[slug])
  const avg = (slugs: string[]) => (slugs.length ? slugs.reduce((s, x) => s + frac(x), 0) / slugs.length : 0)
  const done = modules.filter((m) => frac(m.slug) >= 1).length
  const overall = avg(modules.map((m) => m.slug))
  const ticked = Object.values(p.modules).reduce((s, m) => s + m.experiment.length + m.interview.length + m.check.length, 0)
  const totalItems = modules.reduce((s, m) => s + m.counts.experiment + m.counts.interview + m.counts.check, 0)

  // calendar: the last WEEKS weeks, Monday-first columns
  const [today] = useState(() => new Date())
  const start = new Date(today)
  start.setUTCDate(start.getUTCDate() - ((today.getUTCDay() + 6) % 7) - (WEEKS - 1) * 7)
  const cells = Array.from({ length: WEEKS * 7 }, (_, i) => {
    const d = new Date(start)
    d.setUTCDate(start.getUTCDate() + i)
    const key = d.toISOString().slice(0, 10)
    return { key, n: p.days[key] ?? 0, future: d > today }
  })
  let streak = 0
  for (let d = new Date(today); (p.days[d.toISOString().slice(0, 10)] ?? 0) > 0; d.setUTCDate(d.getUTCDate() - 1)) streak++
  const studiedDays = Object.values(p.days).filter((n) => n > 0).length

  const lastVisited = Object.entries(p.modules)
    .filter(([slug, m]) => m.visited && frac(slug) < 1 && modules.some((x) => x.slug === slug))
    .sort((a, b) => (b[1].visited ?? 0) - (a[1].visited ?? 0))[0]?.[0]
  const nextNew = modules.find((m) => !p.modules[m.slug])
  const cont = modules.find((m) => m.slug === lastVisited)

  return (
    <section className={styles.panel} aria-label="Your progress">
      <div className={styles.top}>
        <div className={styles.big}>
          <ProgressDot value={overall} size={64} title={`${Math.round(overall * 100)}% overall`} />
          <div>
            <div className={styles.bigNum}>{Math.round(overall * 100)}%</div>
            <div className={styles.muted}>
              {done} of {modules.length} modules done · {ticked} of {totalItems} items ticked
            </div>
          </div>
        </div>
        <div className={styles.next}>
          {cont && (
            <Link to={`/${cont.slug}`} className={styles.cta}>
              Continue: {cont.title} →
            </Link>
          )}
          {nextNew && (
            <Link to={`/${nextNew.slug}`} className={cont ? styles.ctaSecondary : styles.cta}>
              {cont ? 'Or start' : 'Start'}: {nextNew.title}
            </Link>
          )}
        </div>
      </div>

      <div className={styles.grid}>
        <div>
          <h3>By track</h3>
          {tracks
            .filter((t) => modules.some((m) => m.track === t.key))
            .map((t) => {
              const ms = modules.filter((m) => m.track === t.key)
              return <Bar key={t.key} label={t.title} value={avg(ms.map((m) => m.slug))} sub={`${ms.filter((m) => frac(m.slug) >= 1).length}/${ms.length}`} />
            })}
        </div>
        <div>
          <h3>By role</h3>
          {roles.map((r) => {
            const ms = modules.filter((m) => m.roles.includes(r.key))
            return <Bar key={r.key} label={r.title} value={avg(ms.map((m) => m.slug))} sub={`${ms.filter((m) => frac(m.slug) >= 1).length}/${ms.length}`} to={`/roles#${r.key}`} />
          })}
        </div>
        <div>
          <h3>Days studied</h3>
          <div className={styles.calendar} style={{ gridTemplateColumns: `repeat(${WEEKS}, 1fr)` }}>
            {Array.from({ length: WEEKS }, (_, w) => (
              <div key={w} className={styles.week}>
                {cells.slice(w * 7, w * 7 + 7).map((c) => (
                  <span key={c.key} title={`${c.key}: ${c.n} items`} className={c.future ? styles.dayFuture : c.n === 0 ? styles.day0 : c.n < 3 ? styles.day1 : c.n < 8 ? styles.day2 : styles.day3} />
                ))}
              </div>
            ))}
          </div>
          <div className={styles.muted}>
            {studiedDays} day{studiedDays === 1 ? '' : 's'} studied · current streak {streak} day{streak === 1 ? '' : 's'}
          </div>
          <button
            type="button"
            className={styles.reset}
            onClick={() => {
              if (window.confirm('Reset all your progress? This cannot be undone.')) void resetProgress()
            }}
          >
            Reset progress
          </button>
        </div>
      </div>
    </section>
  )
}
