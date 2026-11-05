import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { modules, ROLES } from '../../modules/registry.ts'
import styles from './Shell.module.css'

const PAGES = [
  { path: '/', title: 'Overview', hint: 'all tracks' },
  { path: '/roles', title: 'Roles and paths', hint: 'what each role needs' },
  { path: '/integrations', title: 'Integrations', hint: 'BigQuery, Snowflake, AWS, Databricks' },
]

/** ⌘K / Ctrl+K: jump to any module by typing part of its title, track, summary or role. */
/** Mounted only while open, so every opening starts with an empty query. */
export default function CommandPalette({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const navigate = useNavigate()

  const results = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
    const items = [
      ...PAGES.map((p) => ({ path: p.path, title: p.title, hint: p.hint, text: `${p.title} ${p.hint}` })),
      ...modules.map((m) => ({
        path: `/${m.slug}`,
        title: m.title,
        hint: m.category,
        text: `${m.title} ${m.category} ${m.summary} ${m.roles.map((r) => ROLES[r]).join(' ')}`,
      })),
    ]
    return items.filter((it) => terms.every((t) => it.text.toLowerCase().includes(t))).slice(0, 12)
  }, [q])


  const go = (path: string) => {
    navigate(path)
    onClose()
  }

  return (
    <div className={styles.paletteBackdrop} onClick={onClose}>
      <div className={styles.palette} role="dialog" aria-label="Search modules" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          className={styles.paletteInput}
          placeholder="Search modules, tracks, roles…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setActive(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose()
            if (e.key === 'ArrowDown') setActive((a) => Math.min(results.length - 1, a + 1))
            if (e.key === 'ArrowUp') setActive((a) => Math.max(0, a - 1))
            if (e.key === 'Enter' && results[active]) go(results[active].path)
          }}
        />
        <ul className={styles.paletteList}>
          {results.map((r, i) => (
            <li key={r.path}>
              <button type="button" className={i === active ? styles.paletteActive : undefined} onMouseEnter={() => setActive(i)} onClick={() => go(r.path)}>
                <span>{r.title}</span>
                <small>{r.hint}</small>
              </button>
            </li>
          ))}
          {!results.length && <li className={styles.paletteEmpty}>No match.</li>}
        </ul>
      </div>
    </div>
  )
}
