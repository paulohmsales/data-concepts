import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import Markdown from '../components/Markdown.tsx'
import { useCatalog, useModuleContent } from '../lib/api.ts'
import { loadEntries, type Entries } from '../lib/entries.ts'
import styles from './CheatSheet.module.css'

const firstSentence = (s: string) => {
  const m = s.trim().match(/^[\s\S]*?[.!?](\s|$)/)
  return (m ? m[0] : s).trim()
}

/** /:slug/cheatsheet — a printable one-pager built from the module's content, plus your notes. */
export default function CheatSheet() {
  const { slug = '' } = useParams()
  const { tracks, modules } = useCatalog()
  const meta = modules.find((m) => m.slug === slug)
  const m = useModuleContent(slug)
  const [mine, setMine] = useState<Entries | null>(null)
  useEffect(() => {
    loadEntries(slug).then(setMine)
  }, [slug])
  if (!meta) return <p>Not found.</p>
  const track = tracks.find((t) => t.key === m.track)
  const formulas = m.deep_dive.filter((b) => b.type === 'formula')
  const notes = m.deep_dive.filter((b) => b.type === 'callout' && (b.kind === 'prod' || b.kind === 'warn'))
  const predictions = Object.entries(mine?.predictions ?? {}).filter(([, p]) => p.text)

  return (
    <article className={styles.sheet}>
      <div className={styles.toolbar}>
        <Link to={`/${slug}`}>← Back to the module</Link>
        <button type="button" onClick={() => window.print()}>
          Print / save as PDF
        </button>
      </div>
      <header>
        <small>{track?.title}</small>
        <h1>{m.title}</h1>
        <p className={styles.summary}>{m.summary}</p>
      </header>

      <section>
        <h2>The idea</h2>
        <Markdown md={m.intuition} />
      </section>

      {formulas.length > 0 && (
        <section>
          <h2>Formulas</h2>
          {formulas.map((f, i) => (
            <pre key={i} className={styles.formula}>
              {f.type === 'formula' ? f.text : ''}
            </pre>
          ))}
        </section>
      )}

      <section>
        <h2>What the experiments show</h2>
        <ul className={styles.compact}>
          {m.experiments.map((e) => (
            <li key={e.title}>
              <strong>{e.title}.</strong> <Markdown md={e.look} inline /> <span className={styles.why}>{firstSentence(e.why)}</span>
            </li>
          ))}
        </ul>
      </section>

      {notes.length > 0 && (
        <section>
          <h2>In production</h2>
          {notes.map((n, i) => (n.type === 'callout' ? <Markdown key={i} md={n.md} /> : null))}
        </section>
      )}

      {m.interview.length > 0 && (
        <section>
          <h2>Interview questions</h2>
          <ul className={styles.compact}>
            {m.interview.map((q) => (
              <li key={q.q}>
                <strong>{q.q}</strong> <span className={styles.why}>Listen for: {q.listen_for.join(' · ')}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {m.check.length > 0 && (
        <section>
          <h2>Check yourself</h2>
          <dl className={styles.checks}>
            {m.check.map((c) => (
              <div key={c.q}>
                <dt>{c.q}</dt>
                <dd>
                  <Markdown md={c.a} />
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {(mine?.note || predictions.length > 0) && (
        <section className={styles.mine}>
          <h2>Yours</h2>
          {mine?.note && <Markdown md={mine.note} />}
          {predictions.length > 0 && (
            <ul className={styles.compact}>
              {predictions.map(([i, p]) => (
                <li key={i}>
                  <strong>{m.experiments[Number(i)]?.title}:</strong> you predicted “{p.text}”{p.rating ? ` (${p.rating === 'partly' ? 'partly right' : p.rating})` : ''}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </article>
  )
}
