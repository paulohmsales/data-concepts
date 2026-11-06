import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, Route, Routes, useLocation } from 'react-router'
import CommandPalette from './components/shell/CommandPalette.tsx'
import { MenuIcon, MoonIcon, SearchIcon, SunIcon } from './components/shell/icons.tsx'
import Sidebar from './components/shell/Sidebar.tsx'
import styles from './components/shell/Shell.module.css'
import { setTheme, useTheme } from './lib/theme.ts'
import ErrorBoundary from './components/ErrorBoundary.tsx'
import Home from './pages/Home.tsx'

const Roles = lazy(() => import('./pages/Roles.tsx'))
const Platforms = lazy(() => import('./pages/Platforms.tsx'))
const ModulePage = lazy(() => import('./pages/ModulePage.tsx'))
const Integrations = lazy(() => import('./pages/Integrations.tsx'))
const IntegrationProvider = lazy(() => import('./pages/IntegrationProvider.tsx'))
const CheatSheet = lazy(() => import('./pages/CheatSheet.tsx'))
const ConceptMap = lazy(() => import('./pages/ConceptMap.tsx'))
const Cases = lazy(() => import('./pages/Cases.tsx'))
const CasePage = lazy(() => import('./pages/CasePage.tsx'))

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
          <Link to="/platforms">Platforms</Link>
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
          <Suspense fallback={null}>
            <Sidebar onNavigate={() => setMenu(false)} />
          </Suspense>
        </div>
        {menu && <div className={styles.scrim} onClick={() => setMenu(false)} />}
        <main className={styles.main}>
          <ErrorBoundary key={pathname}>
            <Suspense fallback={<p className="lede">Loading…</p>}>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/roles" element={<Roles />} />
                <Route path="/platforms" element={<Platforms />} />
                <Route path="/integrations" element={<Integrations />} />
                <Route path="/map" element={<ConceptMap />} />
                <Route path="/cases" element={<Cases />} />
                <Route path="/cases/:id" element={<CasePage />} />
                <Route path="/integrations/:key" element={<IntegrationProvider />} />
                <Route path="/:slug/cheatsheet" element={<CheatSheet />} />
                <Route path="/:slug" element={<ModulePage />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
      {palette && (
        <Suspense fallback={null}>
          <CommandPalette onClose={() => setPalette(false)} />
        </Suspense>
      )}
    </div>
  )
}
