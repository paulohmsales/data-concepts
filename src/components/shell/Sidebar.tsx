import { useState } from 'react'
import { NavLink, useLocation } from 'react-router'
import { CATEGORIES, modules } from '../../modules/registry.ts'
import { ChevronIcon } from './icons.tsx'
import styles from './Shell.module.css'

/** Tracks and modules. The current module's track starts open; the others can be toggled. */
export default function Sidebar({ onNavigate }: { onNavigate: () => void }) {
  const { pathname } = useLocation()
  const currentTrack = modules.find((m) => `/${m.slug}` === pathname)?.category
  const [closed, setClosed] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState('')
  const q = filter.trim().toLowerCase()

  return (
    <nav className={styles.sidebar} aria-label="Modules">
      <div className={styles.sideTop}>
        <NavLink to="/" end className={({ isActive }) => (isActive ? styles.sideLinkActive : styles.sideLink)} onClick={onNavigate}>
          Overview
        </NavLink>
        <NavLink to="/roles" className={({ isActive }) => (isActive ? styles.sideLinkActive : styles.sideLink)} onClick={onNavigate}>
          Roles and paths
        </NavLink>
        <NavLink to="/integrations" className={({ isActive }) => (isActive ? styles.sideLinkActive : styles.sideLink)} onClick={onNavigate}>
          Integrations
        </NavLink>
      </div>
      <input type="search" className={styles.filter} placeholder="Filter modules…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter modules" />
      {CATEGORIES.map((cat) => {
        const list = modules.filter((m) => m.category === cat && (!q || `${m.title} ${m.summary}`.toLowerCase().includes(q)))
        if (!list.length) return null
        const open = q !== '' || !closed.has(cat) || cat === currentTrack
        return (
          <div key={cat} className={styles.track}>
            <button
              type="button"
              className={styles.trackHead}
              aria-expanded={open}
              onClick={() =>
                setClosed((s) => {
                  const n = new Set(s)
                  if (n.has(cat)) n.delete(cat)
                  else n.add(cat)
                  return n
                })
              }
            >
              <ChevronIcon open={open} />
              <span>{cat}</span>
              <span className={styles.count}>{list.length}</span>
            </button>
            {open && (
              <ul>
                {list.map((m) => (
                  <li key={m.slug}>
                    <NavLink to={`/${m.slug}`} className={({ isActive }) => (isActive ? styles.sideLinkActive : styles.sideLink)} onClick={onNavigate}>
                      {m.title}
                    </NavLink>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
    </nav>
  )
}
