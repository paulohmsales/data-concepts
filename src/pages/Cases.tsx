import { Link } from 'react-router'
import { useCases, useCatalog } from '../lib/api.ts'
import styles from './Pages.module.css'
import s from './Cases.module.css'

/** /cases — investigations that need several modules at once, on realistic data in the browser. */
export default function Cases() {
  const cases = useCases()
  const { modules } = useCatalog()
  const title = (slug: string) => modules.find((m) => m.slug === slug)?.title ?? slug
  return (
    <div className={styles.page}>
      <h1>Case studies</h1>
      <p className="lede" style={{ maxWidth: '72ch' }}>
        Real-world problems that don't fit in one module. Each case gives you a situation, data in a SQL console and a
        step-by-step investigation: predict, query, then compare with what was really going on.
      </p>
      <div className={s.list}>
        {cases.map((c) => (
          <Link key={c.id} to={`/cases/${c.id}`} className={s.card}>
            <h2>{c.title}</h2>
            <p>{c.summary}</p>
            <small>
              {c.steps} steps · uses {c.related.map(title).join(', ')}
            </small>
          </Link>
        ))}
      </div>
    </div>
  )
}
