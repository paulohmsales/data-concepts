import { Link } from 'react-router'
import { CATEGORIES, modules, ROLES, type Role } from '../modules/registry.ts'
import styles from './Pages.module.css'

const TRACK_BLURB: Record<string, string> = {
  Statistics: 'What averages, intervals and samples can and can’t tell you.',
  Experimentation: 'Running tests that don’t lie: power, peeking, broken splits, variance.',
  'Analytics engineering': 'Modelling the warehouse so every number has one meaning.',
  'Data engineering': 'Moving data reliably: loads, retries, late events, storage layout.',
  'Data analysis': 'Reading behaviour over time: cohorts, funnels, seasons.',
  'Machine learning': 'Training models that generalise, and choosing how to act on them.',
  'AI engineering': 'Building on LLMs: retrieval, agents, evals, cost.',
  'Software engineering': 'Services that stay up: limits, caches, queues, consistency.',
  'Data leadership': 'Prioritising, promising and running data work.',
}

export default function Home() {
  const live = CATEGORIES.filter((c) => modules.some((m) => m.category === c))
  const planned = CATEGORIES.filter((c) => !live.includes(c))
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
            <strong>{Object.keys(ROLES).length}</strong> role paths
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
        {live.map((cat) => (
          <section key={cat} className={styles.trackCard}>
            <h2>{cat}</h2>
            <p className={styles.trackBlurb}>{TRACK_BLURB[cat]}</p>
            <ul>
              {modules
                .filter((m) => m.category === cat)
                .map((m) => (
                  <li key={m.slug}>
                    <Link to={`/${m.slug}`}>{m.title}</Link>
                    <span>{m.summary}</span>
                  </li>
                ))}
            </ul>
          </section>
        ))}
        {planned.map((cat) => (
          <section key={cat} className={`${styles.trackCard} ${styles.planned}`}>
            <h2>
              {cat} <span className={styles.badge}>coming</span>
            </h2>
            <p className={styles.trackBlurb}>{TRACK_BLURB[cat]}</p>
          </section>
        ))}
      </div>

      <section className={styles.roleStrip}>
        <h2>Paths by role</h2>
        <div>
          {(Object.keys(ROLES) as Role[]).map((r) => (
            <Link key={r} to={`/roles#${r}`}>
              {ROLES[r]}
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
