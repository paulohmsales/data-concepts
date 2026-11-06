import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { search, useCatalog } from '../../lib/api.ts'
import type { SearchHit } from '../../lib/content.ts'
import styles from './Shell.module.css'

const PAGES = [
  { path: '/', title: 'Overview', hint: 'all tracks' },
  { path: '/roles', title: 'Roles and paths', hint: 'what each role needs' },
  { path: '/platforms', title: 'Cloud platforms compared', hint: 'AWS, Google Cloud, Azure, Snowflake, Databricks' },
  { path: '/integrations', title: 'Integrations', hint: 'labs on real services' },
  { path: '/cases', title: 'Case studies', hint: 'investigations across modules' },
  { path: '/map', title: 'Concept map', hint: 'how the modules connect' },
]

interface Item {
  path: string
  title: string
  hint: string
}

/** ⌘K / Ctrl+K: titles match instantly; full-text hits (deep dives, services) come from the API. */
export default function CommandPalette({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const [hits, setHits] = useState<SearchHit[]>([])
  const navigate = useNavigate()
  const { modules, tracks } = useCatalog()

  useEffect(() => {
    const term = q.trim()
    const effect = { cancelled: false }
    const t = setTimeout(() => {
      if (term.length < 2) return
      search(term)
        .then((h) => !effect.cancelled && setHits(h))
        .catch(() => {})
    }, 150)
    return () => {
      effect.cancelled = true
      clearTimeout(t)
    }
  }, [q])

  const results = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
    const trackTitle = (k: string) => tracks.find((t) => t.key === k)?.title ?? k
    const local: (Item & { text: string })[] = [
      ...PAGES.map((p) => ({ ...p, text: `${p.title} ${p.hint}` })),
      ...modules.map((m) => ({ path: `/${m.slug}`, title: m.title, hint: trackTitle(m.track), text: `${m.title} ${trackTitle(m.track)} ${m.summary}` })),
    ]
    const titleMatches = local.filter((it) => terms.every((t) => it.text.toLowerCase().includes(t)))
    const seen = new Set(titleMatches.map((r) => r.path))
    const fromSearch: Item[] =
      q.trim().length < 2
        ? []
        : hits
            .map((h) =>
              h.kind === 'module'
                ? { path: `/${h.ref}`, title: h.title, hint: h.snippet.replace(/\[|\]/g, '') }
                : h.kind === 'case'
                  ? { path: `/cases/${h.ref}`, title: h.title, hint: 'case study' }
                  : { path: `/platforms#${h.ref.split(':')[1]}`, title: h.title, hint: `${h.ref.split(':')[0].toUpperCase()} service` },
            )
            .filter((r) => !seen.has(r.path) && (seen.add(r.path), true))
    return [...titleMatches, ...fromSearch].slice(0, 14)
  }, [q, hits, modules, tracks])

  const go = (path: string) => {
    navigate(path)
    onClose()
  }

  return (
    <div className={styles.paletteBackdrop} onClick={onClose}>
      <div className={styles.palette} role="dialog" aria-label="Search" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          className={styles.paletteInput}
          placeholder="Search modules, concepts, cloud services…"
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
            <li key={r.path + r.title}>
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
