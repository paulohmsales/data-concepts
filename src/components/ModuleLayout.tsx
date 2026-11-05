import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useCatalog } from '../lib/api.ts'
import { useModule } from '../lib/moduleContext.ts'
import { mark, moduleFraction, useProgress } from '../lib/progress.ts'
import Blocks from './blocks/Blocks.tsx'
import { Experiments, Interview } from './content.tsx'
import ExplainBack from './ExplainBack.tsx'
import Markdown from './Markdown.tsx'
import styles from './ModuleLayout.module.css'

interface Props {
  /** The main interactive lab. */
  play: ReactNode
  /** Lab-specific figures shown under the guided experiments (e.g. the peeking chart). */
  breakIt?: ReactNode
  /** The lab's controls, shown beside the charts. */
  controls?: ReactNode
  /** Applies an experiment's `setup` parameters to the lab. */
  onPreset?: (params: Record<string, unknown>) => void
  /** @deprecated text now comes from the content API; kept so older labs still compile. */
  title?: string
  intuition?: ReactNode
  explainBack?: ReactNode
  deepDive?: ReactNode
  interview?: ReactNode
}

/** Template v2: lab first, then experiments, understanding, interview prep and a self-check. */
export default function ModuleLayout({ play, breakIt, controls, onPreset }: Props) {
  const m = useModule()
  const { tracks, modules, roles } = useCatalog()
  const track = tracks.find((t) => t.key === m.track)
  const i = modules.findIndex((x) => x.slug === m.slug)
  const prev = i > 0 ? modules[i - 1] : undefined
  const next = i >= 0 && i < modules.length - 1 ? modules[i + 1] : undefined
  const roleTitle = (k: string) => roles.find((r) => r.key === k)?.title ?? k
  const sections = [
    { id: 'lab', label: 'Lab' },
    { id: 'experiments', label: 'Experiments' },
    { id: 'understand', label: 'Understand' },
    ...(m.interview.length ? [{ id: 'interview', label: 'Interview' }] : []),
    ...(m.check.length ? [{ id: 'check', label: 'Check yourself' }] : []),
  ]
  const active = useScrollSpy(sections.map((s) => s.id))
  const progress = useProgress()
  const mp = progress.modules[m.slug]
  const meta = modules.find((x) => x.slug === m.slug)
  const fraction = meta ? moduleFraction(meta, mp) : 0
  // record the visit once per module page (for “continue where you left off”)
  useEffect(() => {
    mark(m.slug, 'visit')
  }, [m.slug])

  return (
    <article className={styles.module}>
      <header className={styles.header}>
        <div className={styles.crumbs}>
          <Link to="/">Tracks</Link> <span>/</span> {track?.title}
        </div>
        <h1>{m.title}</h1>
        <p className={styles.promise}>{m.summary.charAt(0).toUpperCase() + m.summary.slice(1)}</p>
        <div className={styles.progressRow}>
          <div className={styles.progressBar} aria-label={`${Math.round(fraction * 100)}% done`}>
            <span style={{ width: `${fraction * 100}%` }} className={fraction >= 1 ? styles.full : undefined} />
          </div>
          <span className={styles.progressText}>
            {fraction >= 1 ? 'Done' : `${Math.round(fraction * 100)}%`} · {mp?.experiment.length ?? 0}/{m.experiments.length} experiments · {mp?.interview.length ?? 0}/{m.interview.length} interview · {mp?.check.length ?? 0}/{m.check.length} checks
          </span>
          <button type="button" className={mp?.done ? styles.doneOn : styles.doneBtn} onClick={() => mark(m.slug, 'done', 0, !mp?.done)}>
            {mp?.done ? '✓ Module done' : 'Mark module done'}
          </button>
        </div>
        {m.roles.length > 0 && (
          <div className={styles.roles}>
            {m.roles.map((r) => (
              <Link key={r} to={`/roles#${r}`} className={styles.role}>
                {roleTitle(r)}
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
            {m.experiments.length > 0 && <Experiments items={m.experiments} onPreset={onPreset} slug={m.slug} />}
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
        {m.intuition && (
          <div className={styles.intuition}>
            <div className={styles.kicker}>The intuition</div>
            <Markdown md={m.intuition} />
          </div>
        )}
        {m.deep_dive.length > 0 && (
          <div className={styles.deep}>
            <div className={styles.kicker}>Deep dive</div>
            <Blocks blocks={m.deep_dive} />
          </div>
        )}
      </section>

      {m.interview.length > 0 && (
        <section id="interview" className={styles.text}>
          <h2>Interview</h2>
          <Interview items={m.interview} slug={m.slug} />
        </section>
      )}

      {m.check.length > 0 && (
        <section id="check" className={styles.text}>
          <h2>Check yourself</h2>
          <ExplainBack questions={m.check} slug={m.slug} />
        </section>
      )}

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
