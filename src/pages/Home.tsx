import { Link } from 'react-router'
import { CATEGORIES, modules } from '../modules/registry.ts'
import styles from './Home.module.css'

export default function Home() {
  return (
    <>
      <h1>data-concepts</h1>
      <p className="lede">
        Visual explanations and sandboxes you can break on purpose. Each module has four parts:
        intuition, play, break it, explain-back.
      </p>
      <div className={styles.grid}>
        {CATEGORIES.map((cat) => {
          const list = modules.filter((m) => m.category === cat)
          if (!list.length) return null
          return (
            <section key={cat}>
              <h2>{cat}</h2>
              <ul className={styles.list}>
                {list.map((m) => (
                  <li key={m.slug}>
                    <Link to={`/${m.slug}`}>{m.title}</Link>
                    <span>{m.summary}</span>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </>
  )
}
