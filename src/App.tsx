import { Suspense } from 'react'
import { Link, Route, Routes } from 'react-router'
import { modules } from './modules/registry.ts'
import Home from './pages/Home.tsx'
import styles from './App.module.css'

export default function App() {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link to="/" className={styles.brand}>
          data-concepts
        </Link>
      </header>
      <main className={styles.main}>
        <Suspense fallback={<p>Loading…</p>}>
        <Routes>
          <Route path="/" element={<Home />} />
          {modules.map((m) => (
            <Route key={m.slug} path={`/${m.slug}`} element={<m.Component />} />
          ))}
          <Route path="*" element={<p>Not found.</p>} />
        </Routes>
        </Suspense>
      </main>
    </div>
  )
}
