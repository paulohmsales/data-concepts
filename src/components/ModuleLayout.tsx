import type { ReactNode } from 'react'
import styles from './ModuleLayout.module.css'

interface Props {
  title: string
  intuition: ReactNode
  play: ReactNode
  breakIt: ReactNode
  explainBack: ReactNode
  /** Optional sticky sidebar with the module's controls, shared by every part. */
  controls?: ReactNode
}

/** The four-part template every module follows (PLAN.md §2.1). */
export default function ModuleLayout({ title, intuition, play, breakIt, explainBack, controls }: Props) {
  const parts = [
    { id: 'intuition', heading: '1. Intuition', body: intuition },
    { id: 'play', heading: '2. Play', body: play },
    { id: 'break-it', heading: '3. Break it', body: breakIt },
    { id: 'explain-back', heading: '4. Explain-back', body: explainBack },
  ]

  return (
    <article>
      <h1>{title}</h1>
      <nav className={styles.toc}>
        {parts.map((p) => (
          <a key={p.id} href={`#${p.id}`}>
            {p.heading}
          </a>
        ))}
      </nav>
      <div className={controls ? styles.withControls : undefined}>
        {controls && <aside className={styles.controls}>{controls}</aside>}
        <div className={styles.content}>
          {parts.map((p) => (
            <section key={p.id} id={p.id} className={styles.part}>
              <h2>{p.heading}</h2>
              {p.body}
            </section>
          ))}
        </div>
      </div>
    </article>
  )
}
