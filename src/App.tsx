import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, Route, Routes, useLocation } from 'react-router'
import CommandPalette from './components/shell/CommandPalette.tsx'
import { MenuIcon, MoonIcon, SearchIcon, SunIcon } from './components/shell/icons.tsx'
import Sidebar from './components/shell/Sidebar.tsx'
import styles from './components/shell/Shell.module.css'
import { setTheme, useTheme } from './lib/theme.ts'
import { modules } from './modules/registry.ts'
import Home from './pages/Home.tsx'

const Roles = lazy(() => import('./pages/Roles.tsx'))
const Integrations = lazy(() => import('./pages/Integrations.tsx'))

export default function App() {
  const theme = useTheme()
  const [menu, setMenu] = useState(false)
  const [palette, setPalette] = useState(false)
  const { pathname } = useLocation()

  // ⌘K / Ctrl+K opens search from anywhere
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette((p) => !p)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // new page: start at the top (unless jumping to an anchor)
  useEffect(() => {
    if (!window.location.hash) window.scrollTo(0, 0)
  }, [pathname])

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <button type="button" className={styles.iconButton} onClick={() => setMenu((m) => !m)} aria-label="Toggle navigation" aria-expanded={menu}>
          <MenuIcon />
        </button>
        <Link to="/" className={styles.brand}>
          <span className={styles.logo} aria-hidden="true">◆</span> data-concepts
        </Link>
        <button type="button" className={styles.search} onClick={() => setPalette(true)}>
          <SearchIcon />
          <span>Search modules</span>
          <kbd>⌘K</kbd>
        </button>
        <nav className={styles.topLinks}>
          <Link to="/roles">Roles</Link>
          <Link to="/integrations">Integrations</Link>
        </nav>
        <button
          type="button"
          className={styles.iconButton}
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
      </header>
      <div className={styles.body}>
        <div className={`${styles.sideWrap} ${menu ? styles.sideOpen : ''}`}>
          <Sidebar onNavigate={() => setMenu(false)} />
        </div>
        {menu && <div className={styles.scrim} onClick={() => setMenu(false)} />}
        <main className={styles.main}>
          <Suspense fallback={<p className="lede">Loading…</p>}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/roles" element={<Roles />} />
              <Route path="/integrations" element={<Integrations />} />
              {modules.map((m) => (
                <Route key={m.slug} path={`/${m.slug}`} element={<m.Component />} />
              ))}
              <Route path="*" element={<p>Not found.</p>} />
            </Routes>
          </Suspense>
        </main>
      </div>
      {palette && <CommandPalette onClose={() => setPalette(false)} />}
    </div>
  )
}
