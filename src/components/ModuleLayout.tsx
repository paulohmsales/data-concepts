import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Link } from 'react-router'
import { useCatalog } from '../lib/api.ts'
import { useModule } from '../lib/moduleContext.ts'
import { mark, moduleFraction, useProgress } from '../lib/progress.ts'
import Blocks from './blocks/Blocks.tsx'
import { Experiments, Interview } from './content.tsx'
import ExplainBack from './ExplainBack.tsx'
import Markdown from './Markdown.tsx'
import Notes from './Notes.tsx'
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
    ...(m.intuition ? [{ id: 'understand', label: 'Understand' }] : []),
    { id: 'lab', label: 'Lab' },
    { id: 'experiments', label: 'Experiments' },
    ...(m.deep_dive.length ? [{ id: 'deep', label: 'Deep dive' }] : []),
    ...(m.interview.length ? [{ id: 'interview', label: 'Interview' }] : []),
    ...(m.check.length ? [{ id: 'check', label: 'Check yourself' }] : []),
  ]
  const active = useScrollSpy(sections.map((s) => s.id))
  const [sheetOpen, setSheetOpen] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const stageRef = useRef<HTMLDivElement>(null)
  const stageVisible = useInView(stageRef)
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
          <button type="button" className={styles.doneBtn} onClick={() => setNotesOpen((o) => !o)} aria-expanded={notesOpen}>
            ✎ Notes
          </button>
          <Link to={`/${m.slug}/cheatsheet`} className={styles.doneBtn}>
            Cheat sheet
          </Link>
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

      {m.intuition && (
        <section id="understand" className={`${styles.text} ${styles.understand}`}>
          <h2>Understand</h2>
          <div className={styles.intuition}>
            <Markdown md={m.intuition} />
          </div>
        </section>
      )}

      <div ref={stageRef} className={controls ? styles.stage : styles.stageWide}>
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
          <aside className={`${styles.controls} ${sheetOpen ? styles.sheetOpen : ''} ${stageVisible ? '' : styles.sheetHidden}`} aria-label="Lab controls">
            {/* on narrow screens the controls are a bottom sheet, so the chart stays visible while you drag */}
            <button type="button" className={styles.sheetToggle} aria-expanded={sheetOpen} onClick={() => setSheetOpen((o) => !o)}>
              Controls <span aria-hidden>{sheetOpen ? '▾' : '▴'}</span>
            </button>
            <div className={styles.controlsTitle}>Controls</div>
            <div className={styles.controlsBody}>{controls}</div>
          </aside>
        )}
      </div>

      {m.deep_dive.length > 0 && (
        <section id="deep" className={styles.text}>
          <h2>Deep dive</h2>
          <div className={styles.deep}>
            <Blocks blocks={m.deep_dive} />
          </div>
        </section>
      )}

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
      <Notes slug={m.slug} title={m.title} open={notesOpen} onClose={() => setNotesOpen(false)} />
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

/** Whether an element is at least partly on screen (the mobile controls sheet only shows while the lab is). */
function useInView(ref: RefObject<HTMLElement | null>): boolean {
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: '0px 0px -40px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [ref])
  return visible
}
