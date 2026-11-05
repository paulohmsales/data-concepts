import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { moduleBySlug, neighbours, ROLES } from '../modules/registry.ts'
import styles from './ModuleLayout.module.css'

interface Props {
  title: string
  /** Short plain-language framing (shown first in "Understand"). */
  intuition: ReactNode
  /** The main interactive lab. */
  play: ReactNode
  /** Guided ways to break it (shown right under the lab, same controls). */
  breakIt: ReactNode
  /** Optional self-check questions. */
  explainBack: ReactNode
  /** The lab's controls, shown beside the charts. */
  controls?: ReactNode
  /** Mechanism, maths, worked example, production notes. */
  deepDive?: ReactNode
  /** Interview questions with model answers. */
  interview?: ReactNode
}

/** Template v2: lab first, then experiments, understanding, interview prep and a self-check. */
export default function ModuleLayout({ title, intuition, play, breakIt, explainBack, controls, deepDive, interview }: Props) {
  const { pathname } = useLocation()
  const slug = pathname.replace(/^\//, '')
  const entry = moduleBySlug(slug)
  const { prev, next } = neighbours(slug)
  const sections = [
    { id: 'lab', label: 'Lab' },
    { id: 'experiments', label: 'Experiments' },
    { id: 'understand', label: 'Understand' },
    ...(interview ? [{ id: 'interview', label: 'Interview' }] : []),
    { id: 'check', label: 'Check yourself' },
  ]
  const active = useScrollSpy(sections.map((s) => s.id))

  return (
    <article className={styles.module}>
      <header className={styles.header}>
        {entry && (
          <div className={styles.crumbs}>
            <Link to="/">Tracks</Link> <span>/</span> {entry.category}
          </div>
        )}
        <h1>{title}</h1>
        {entry && <p className={styles.promise}>{entry.summary.charAt(0).toUpperCase() + entry.summary.slice(1)}</p>}
        {entry && entry.roles.length > 0 && (
          <div className={styles.roles}>
            {entry.roles.map((r) => (
              <Link key={r} to={`/roles#${r}`} className={styles.role}>
                {ROLES[r]}
              </Link>
            ))}
          </div>
        )}
      </header>

      <nav className={styles.tabs} aria-label="Sections">
        {sections.map((s) => (
          <a key={s.id} href={`#${s.id}`} className={active === s.id ? styles.tabActive : undefined}>
            {s.label}
          </a>
        ))}
      </nav>

      <div className={controls ? styles.stage : styles.stageWide}>
        <div className={styles.stageMain}>
          <section id="lab" className={styles.lab}>
            {play}
          </section>
          <section id="experiments" className={styles.experiments}>
            <h2>Experiments: break it on purpose</h2>
            {breakIt}
          </section>
        </div>
        {controls && (
          <aside className={styles.controls} aria-label="Lab controls">
            <div className={styles.controlsTitle}>Controls</div>
            {controls}
          </aside>
        )}
      </div>

      <section id="understand" className={styles.text}>
        <h2>Understand</h2>
        <div className={styles.intuition}>
          <div className={styles.kicker}>The intuition</div>
          {intuition}
        </div>
        {deepDive ? (
          <div className={styles.deep}>
            <div className={styles.kicker}>Deep dive</div>
            {deepDive}
          </div>
        ) : null}
      </section>

      {interview && (
        <section id="interview" className={styles.text}>
          <h2>Interview</h2>
          {interview}
        </section>
      )}

      <section id="check" className={styles.text}>
        <h2>Check yourself</h2>
        {explainBack}
      </section>

      <nav className={styles.pager} aria-label="Previous and next module">
        {prev ? (
          <Link to={`/${prev.slug}`}>
            <small>← Previous</small>
            {prev.title}
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link to={`/${next.slug}`} className={styles.next}>
            <small>Next →</small>
            {next.title}
          </Link>
        )}
      </nav>
    </article>
  )
}

/** Which section is currently in view (for the sticky section bar). */
function useScrollSpy(ids: string[]) {
  const [active, setActive] = useState(ids[0])
  const key = ids.join(',')
  useEffect(() => {
    const els = key.split(',').map((id) => document.getElementById(id)).filter((e): e is HTMLElement => !!e)
    const onScroll = () => {
      const line = 140
      let current = els[0]?.id
      for (const el of els) if (el.getBoundingClientRect().top <= line) current = el.id
      setActive(current)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [key])
  return active
}
