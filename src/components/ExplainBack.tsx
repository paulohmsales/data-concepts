import styles from './ExplainBack.module.css'

export interface Question {
  q: string
  a: string
}

/** Part 4 of every module: questions to answer in your own words, with a hidden reference answer. */
export default function ExplainBack({ questions }: { questions: Question[] }) {
  return (
    <>
      <p>
        Optional self-check: try answering each one out loud <em>before</em> opening the reference
        answer. If you can’t explain it without notes, go back to the matching part above.
      </p>
      <ol className={styles.list}>
        {questions.map(({ q, a }) => (
          <li key={q}>
            <p>{q}</p>
            <details>
              <summary>Reference answer</summary>
              <p>{a}</p>
            </details>
          </li>
        ))}
      </ol>
    </>
  )
}
