import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { Experiments } from '../components/content.tsx'
import Markdown from '../components/Markdown.tsx'
import SqlLab, { type Preset } from '../components/SqlLab.tsx'
import { CASE_PRELUDE } from '../core/cases.ts'
import { useCase, useCatalog } from '../lib/api.ts'
import type { ExperimentContent } from '../lib/content.ts'
import { useDuckSchema } from '../lib/useDuckSchema.ts'
import styles from './Pages.module.css'
import s from './Cases.module.css'

/** /cases/:id — brief, a SQL console on the case's data, and the investigation as predict-then-reveal steps. */
export default function CasePage() {
  const { id = '' } = useParams()
  const c = useCase(id)
  const { modules } = useCatalog()
  const setup = useMemo(() => [...CASE_PRELUDE, ...c.setup], [c])
  const { db, error } = useDuckSchema(`case_${id.replace(/\W/g, '_')}`, setup)
  const [req, setReq] = useState<{ id: string; n: number } | null>(null)
  const presets: Preset[] = c.steps.map((st, i) => ({ id: `step${i}`, label: `${i + 1}. ${st.title}`, sql: st.sql.trim() }))
  const steps: ExperimentContent[] = c.steps.map((st, i) => ({ title: st.title, goal: st.prompt, look: st.finding, why: st.why, setup: { step: i } }))

  return (
    <div className={styles.page}>
      <Link to="/cases">← All case studies</Link>
      <h1>{c.title}</h1>
      <p className="lede">{c.summary}</p>

      <section className={s.brief}>
        <h2>The situation</h2>
        <Markdown md={c.brief} />
      </section>

      <section className={s.console}>
        <h2>SQL console</h2>
        <p className="lede">
          The case’s data, in DuckDB in your browser. Each step’s <em>Set it up</em> loads its query here; edit it or write
          your own.
        </p>
        <SqlLab key={req ? `lab-${req.n}` : 'lab'} initial={req?.id} db={db} error={error} presets={presets} />
      </section>

      <section className={s.steps}>
        <h2>Investigate</h2>
        <Experiments
          items={steps}
          slug={`case-${c.id}`}
          onPreset={(p) => {
            setReq((r) => ({ id: `step${Number(p.step)}`, n: (r?.n ?? 0) + 1 }))
            document.querySelector(`.${s.console}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }}
        />
      </section>

      <details className={s.resolution}>
        <summary>What was really going on</summary>
        <Markdown md={c.resolution} />
      </details>

      <section className={s.related}>
        <h3>Modules this case uses</h3>
        <ul>
          {c.related.map((slug) => (
            <li key={slug}>
              <Link to={`/${slug}`}>{modules.find((m) => m.slug === slug)?.title ?? slug}</Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
