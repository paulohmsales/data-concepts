import { Link } from 'react-router'
import { modules } from '../modules/registry.ts'

export default function Home() {
  return (
    <>
      <h1>data-concepts</h1>
      <p>Visual explanations and sandboxes you can break on purpose.</p>
      <ul>
        {modules.map((m) => (
          <li key={m.slug}>
            <Link to={`/${m.slug}`}>{m.title}</Link>: {m.summary}
          </li>
        ))}
      </ul>
    </>
  )
}
