import { Link } from 'react-router'
import ProgressPanel from '../components/ProgressPanel.tsx'
import { useCatalog } from '../lib/api.ts'
import styles from './Pages.module.css'

export default function Home() {
  const { tracks, modules, roles } = useCatalog()
  const live = tracks.filter((t) => modules.some((m) => m.track === t.key))
  const planned = tracks.filter((t) => !live.includes(t))
  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <h1>Learn data concepts by breaking them.</h1>
        <p>
          Each module is a live lab: change the inputs, watch the numbers move, then cause the classic
          failure yourself. Every simulation is tested against theory, and every SQL lab runs real DuckDB
          in your browser.
        </p>
        <div className={styles.heroStats}>
          <div>
            <strong>{modules.length}</strong> modules
          </div>
          <div>
            <strong>{live.length}</strong> tracks
          </div>
          <div>
            <strong>{roles.length}</strong> role paths
          </div>
        </div>
        <div className={styles.heroActions}>
          <Link to="/ab-testing" className={styles.primary}>
            Start with A/B testing
          </Link>
          <Link to="/roles" className={styles.secondary}>
            Pick a role path
          </Link>
        </div>
      </section>

      <ProgressPanel />

      <section className={styles.how}>
        {[
          ['Lab', 'The experiment, centre stage, with its controls beside it.'],
          ['Experiments', 'Guided ways to break it, and what to look for.'],
          ['Understand', 'The intuition, then the mechanism, maths and production reality.'],
          ['Interview', 'Real-style questions with model answers and follow-ups.'],
        ].map(([t, d], i) => (
          <div key={t}>
            <span className={styles.step}>{i + 1}</span>
            <strong>{t}</strong>
            <p>{d}</p>
          </div>
        ))}
      </section>

      <div className={styles.trackGrid}>
        {live.map((t) => (
          <section key={t.key} className={styles.trackCard}>
            <h2>{t.title}</h2>
            <p className={styles.trackBlurb}>{t.blurb}</p>
            <ul>
              {modules
                .filter((m) => m.track === t.key)
                .map((m) => (
                  <li key={m.slug}>
                    <Link to={`/${m.slug}`}>{m.title}</Link>
                    <span>{m.summary}</span>
                  </li>
                ))}
            </ul>
          </section>
        ))}
        {planned.map((t) => (
          <section key={t.key} className={`${styles.trackCard} ${styles.planned}`}>
            <h2>
              {t.title} <span className={styles.badge}>coming</span>
            </h2>
            <p className={styles.trackBlurb}>{t.blurb}</p>
          </section>
        ))}
      </div>

      <section className={styles.roleStrip}>
        <h2>Paths by role</h2>
        <div>
          {roles.map((r) => (
            <Link key={r.key} to={`/roles#${r.key}`}>
              {r.title}
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
