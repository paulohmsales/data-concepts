import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useCatalog } from '../lib/api.ts'
import type { ExperimentContent, InterviewContent } from '../lib/content.ts'
import { mark, useProgress } from '../lib/progress.ts'
import Markdown from './Markdown.tsx'
import styles from './content.module.css'

/** A displayed formula (plain Unicode maths, monospace). */
export function Formula({ children, caption }: { children: ReactNode; caption?: ReactNode }) {
  return (
    <figure className={styles.formula}>
      <div>{children}</div>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  )
}

/** Side notes: a key idea, a warning, or how it looks in production. */
export function Callout({ kind = 'note', title, children }: { kind?: 'note' | 'warn' | 'prod'; title?: string; children: ReactNode }) {
  const label = title ?? (kind === 'warn' ? 'Watch out' : kind === 'prod' ? 'In production' : 'Key idea')
  return (
    <aside className={`${styles.callout} ${styles[kind]}`}>
      <strong>{label}</strong>
      <div>{children}</div>
    </aside>
  )
}

/** A worked example with numbers. */
export function Worked({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={styles.worked}>
      <div className={styles.workedTitle}>Worked example · {title}</div>
      {children}
    </div>
  )
}

/** Numbered mechanism steps. */
export function Steps({ items }: { items: { title: string; body: ReactNode }[] }) {
  return (
    <ol className={styles.steps}>
      {items.map((it, i) => (
        <li key={it.title}>
          <span className={styles.stepNum}>{i + 1}</span>
          <div>
            <strong>{it.title}</strong>
            <div>{it.body}</div>
          </div>
        </li>
      ))}
    </ol>
  )
}

/** Links to other modules by slug. */
export function Related({ slugs }: { slugs: string[] }) {
  const { modules } = useCatalog()
  const moduleBySlug = (s: string) => modules.find((m) => m.slug === s)
  return (
    <div className={styles.related}>
      <span>Related:</span>
      {slugs.map((s) => {
        const m = moduleBySlug(s)
        return m ? (
          <Link key={s} to={`/${s}`}>
            {m.title}
          </Link>
        ) : null
      })}
    </div>
  )
}

/** Guided experiments from content: set it up (via the lab's preset handler), look, then reveal why. */
export function Experiments({ items, onPreset, slug }: { items: ExperimentContent[]; onPreset?: (params: Record<string, unknown>) => void; slug?: string }) {
  const [open, setOpen] = useState<number | null>(null)
  const [active, setActive] = useState<number | null>(null)
  const progress = useProgress()
  const doneSet = new Set(slug ? (progress.modules[slug]?.experiment ?? []) : [])
  return (
    <ol className={styles.experiments}>
      {items.map((e, i) => (
        <li key={e.title} className={`${styles.experiment} ${active === i ? styles.expActive : ''} ${doneSet.has(i) ? styles.expDone : ''}`}>
          <div className={styles.expHead}>
            {slug ? (
              <Tick checked={doneSet.has(i)} onChange={(v) => mark(slug, 'experiment', i, v)} label={`Experiment ${i + 1} done`} num={i + 1} />
            ) : (
              <span className={styles.expNum}>{i + 1}</span>
            )}
            <div className={styles.expBody}>
              <strong>{e.title}</strong>
              <Markdown md={e.goal} />
            </div>
            {e.setup && onPreset && (
              <button
                type="button"
                className={styles.setup}
                onClick={() => {
                  onPreset(e.setup!)
                  setActive(i)
                  if (slug) mark(slug, 'experiment', i, true)
                }}
              >
                {active === i ? 'Set up ✓' : 'Set it up'}
              </button>
            )}
          </div>
          <div className={styles.look}>
            <span>Look for</span> <Markdown md={e.look} inline />
          </div>
          <button type="button" className={styles.whyToggle} onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
            {open === i ? 'Hide why' : 'Why does this happen?'}
          </button>
          {open === i && (
            <div className={styles.why}>
              <Markdown md={e.why} />
            </div>
          )}
        </li>
      ))}
    </ol>
  )
}

/** Interview questions with a model answer, follow-ups and what a strong answer includes. */
export function Interview({ items, slug }: { items: InterviewContent[]; slug?: string }) {
  const progress = useProgress()
  const doneSet = new Set(slug ? (progress.modules[slug]?.interview ?? []) : [])
  return (
    <div className={styles.interview}>
      <p className={styles.interviewIntro}>
        Answer out loud first, with a timer (2–3 minutes each), then compare. The checklist is what an
        interviewer would tick off.
      </p>
      {items.map((it, i) => (
        <details key={it.q} className={`${styles.question} ${doneSet.has(i) ? styles.qDone : ''}`}>
          <summary>
            <span className={`${styles.level} ${styles[it.level]}`}>{it.level}</span>
            <span className={styles.qText}>{it.q}</span>
            {doneSet.has(i) && <span className={styles.qCheck}>✓</span>}
          </summary>
          <div className={styles.answer}>
            <div className={styles.answerLabel}>A strong answer</div>
            <Markdown md={it.answer} />
            <div className={styles.answerLabel}>Interviewers listen for</div>
            <ul className={styles.listen}>
              {it.listen_for.map((l) => (
                <li key={l}>✓ {l}</li>
              ))}
            </ul>
            {it.follow_ups.length > 0 && (
              <>
                <div className={styles.answerLabel}>Follow-ups</div>
                {it.follow_ups.map((f) => (
                  <div key={f.q} className={styles.followUp}>
                    <strong>{f.q}</strong>
                    <Markdown md={f.a} />
                  </div>
                ))}
              </>
            )}
            {slug && (
              <button type="button" className={doneSet.has(i) ? styles.canAnswerOn : styles.canAnswer} onClick={() => mark(slug, 'interview', i, !doneSet.has(i))}>
                {doneSet.has(i) ? '✓ I could answer this' : 'I could answer this'}
              </button>
            )}
          </div>
        </details>
      ))}
    </div>
  )
}

/** A round tick box with the item number inside until it is ticked. */
function Tick({ checked, onChange, label, num }: { checked: boolean; onChange: (v: boolean) => void; label: string; num: number }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} aria-label={label} title={checked ? 'Done (click to undo)' : 'Mark as done'} className={checked ? styles.tickOn : styles.tick} onClick={() => onChange(!checked)}>
      {checked ? '✓' : num}
    </button>
  )
}
