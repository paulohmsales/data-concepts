import { mark, useProgress } from '../lib/progress.ts'
import Markdown from './Markdown.tsx'
import styles from './ExplainBack.module.css'

export interface Question {
  q: string
  a: string
}

/** Part 4 of every module: questions to answer in your own words, with a hidden reference answer. */
export default function ExplainBack({ questions, slug }: { questions: Question[]; slug?: string }) {
  const progress = useProgress()
  const doneSet = new Set(slug ? (progress.modules[slug]?.check ?? []) : [])
  return (
    <>
      <p>
        Optional self-check: try answering each one out loud <em>before</em> opening the reference
        answer. If you can’t explain it without notes, go back to the matching part above.
      </p>
      <ol className={styles.list}>
        {questions.map(({ q, a }, i) => (
          <li key={q}>
            <p>
              {q}{' '}
              {slug && (
                <button type="button" className={doneSet.has(i) ? styles.gotItOn : styles.gotIt} onClick={() => mark(slug, 'check', i, !doneSet.has(i))}>
                  {doneSet.has(i) ? '✓ got it' : 'got it'}
                </button>
              )}
            </p>
            <details>
              <summary>Reference answer</summary>
              <Markdown md={a} />
            </details>
          </li>
        ))}
      </ol>
    </>
  )
}
