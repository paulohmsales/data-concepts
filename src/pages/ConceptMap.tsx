import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useVizTheme } from '../components/vizTheme.ts'
import { useCatalog } from '../lib/api.ts'
import type { ModuleMeta } from '../lib/content.ts'
import { moduleFraction, useProgress } from '../lib/progress.ts'
import { useWidth } from '../visuals/useWidth.ts'
import styles from './Pages.module.css'

interface Node extends SimulationNodeDatum {
  id: string
  m: ModuleMeta
  cx: number
  cy: number
}
type Link = SimulationLinkDatum<Node> & { source: Node | string; target: Node | string }

const W = 1100
const H = 860

/** Lay the graph out once, deterministically, in a fixed coordinate space that the SVG scales. */
function layout(modules: ModuleMeta[], trackKeys: string[]) {
  const centre = (i: number) => {
    const a = (i / trackKeys.length) * Math.PI * 2 - Math.PI / 2
    return { cx: W / 2 + Math.cos(a) * W * 0.37, cy: H / 2 + Math.sin(a) * H * 0.37 }
  }
  const nodes: Node[] = modules.map((m, i) => {
    const c = centre(trackKeys.indexOf(m.track))
    // seeded start positions around the cluster centre, so the layout is the same on every visit
    return { id: m.slug, m, ...c, x: c.cx + Math.cos(i * 2.4) * 30, y: c.cy + Math.sin(i * 2.4) * 30 }
  })
  const ids = new Set(nodes.map((n) => n.id))
  const seen = new Set<string>()
  const links: Link[] = []
  for (const m of modules)
    for (const r of m.related ?? []) {
      const key = [m.slug, r].sort().join('|')
      if (ids.has(r) && !seen.has(key)) {
        seen.add(key)
        links.push({ source: m.slug, target: r })
      }
    }
  const sim = forceSimulation(nodes)
    .force(
      'link',
      forceLink<Node, Link>(links)
        .id((d) => d.id)
        .distance(60)
        // links inside a track hold the cluster together; links across tracks barely pull
        .strength((l) => ((l.source as Node).m.track === (l.target as Node).m.track ? 0.15 : 0.005)),
    )
    .force('charge', forceManyBody().strength(-60))
    .force('x', forceX<Node>((d) => d.cx).strength(0.35))
    .force('y', forceY<Node>((d) => d.cy).strength(0.35))
    .force('collide', forceCollide(36))
    .stop()
  for (let i = 0; i < 400; i++) sim.tick()
  for (const n of nodes) {
    n.x = Math.max(20, Math.min(W - 20, n.x ?? 0))
    n.y = Math.max(70, Math.min(H - 20, n.y ?? 0))
  }
  // track labels sit just above each cluster as it actually ended up
  const centres = trackKeys.map((k) => {
    const ns = nodes.filter((n) => n.m.track === k)
    const x = ns.reduce((a, n) => a + (n.x ?? 0), 0) / Math.max(1, ns.length)
    const top = Math.min(...ns.map((n) => n.y ?? 0))
    return { key: k, cx: x, cy: Math.max(18, top - 34) }
  })
  return { nodes, links: links as { source: Node; target: Node }[], centres }
}

export default function ConceptMap() {
  const { tracks, modules } = useCatalog()
  const progress = useProgress()
  const t = useVizTheme()
  const navigate = useNavigate()
  const { ref, width } = useWidth()
  const [hover, setHover] = useState<string | null>(null)
  const g = useMemo(() => layout(modules, tracks.map((x) => x.key)), [modules, tracks])
  const neighbours = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const l of g.links) {
      map.set(l.source.id, (map.get(l.source.id) ?? new Set()).add(l.target.id))
      map.set(l.target.id, (map.get(l.target.id) ?? new Set()).add(l.source.id))
    }
    return map
  }, [g])
  const near = hover ? new Set([hover, ...(neighbours.get(hover) ?? [])]) : null
  const fill = (m: ModuleMeta) => {
    const f = moduleFraction(m, progress.modules[m.slug])
    return f >= 1 ? t.series1 : f > 0 ? `color-mix(in srgb, ${t.series1} 40%, ${t.surface})` : t.surface
  }
  const height = Math.round((width / W) * H)
  const done = modules.filter((m) => moduleFraction(m, progress.modules[m.slug]) >= 1).length
  const started = modules.filter((m) => {
    const f = moduleFraction(m, progress.modules[m.slug])
    return f > 0 && f < 1
  }).length

  return (
    <div className={styles.page}>
      <h1>Concept map</h1>
      <p className="lede" style={{ maxWidth: '72ch' }}>
        Every module, grouped by track, with a line wherever one module builds on or connects to another. Hover to
        see a module’s neighbours; click to open it. Filled circles are done, tinted ones are in progress.
      </p>
      <p className="lede">
        {done} done · {started} in progress · {modules.length - done - started} not started
      </p>
      <div ref={ref} style={{ width: '100%' }}>
        <svg width={width} height={height} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Map of all modules and how they connect">
          {g.centres.map((c) => {
            const tr = tracks.find((x) => x.key === c.key)
            return (
              <text key={c.key} x={c.cx} y={c.cy} textAnchor="middle" fontSize={13} fontWeight={700} fill={t.muted} style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {tr?.title}
              </text>
            )
          })}
          {g.links.map((l) => {
            const on = near && near.has(l.source.id) && near.has(l.target.id) && (l.source.id === hover || l.target.id === hover)
            const across = l.source.m.track !== l.target.m.track
            return (
              <line
                key={`${l.source.id}-${l.target.id}`}
                x1={l.source.x}
                y1={l.source.y}
                x2={l.target.x}
                y2={l.target.y}
                stroke={on ? t.series1 : t.axis}
                strokeWidth={on ? 2 : 1}
                strokeOpacity={on ? 0.9 : near ? 0.08 : across ? 0.18 : 0.7}
              />
            )
          })}
          {g.nodes.map((n) => {
            const dim = near && !near.has(n.id)
            return (
              <g
                key={n.id}
                transform={`translate(${n.x},${n.y})`}
                opacity={dim ? 0.25 : 1}
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHover(n.id)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(n.id)}
                onBlur={() => setHover(null)}
                onClick={() => navigate(`/${n.id}`)}
                onKeyDown={(e) => e.key === 'Enter' && navigate(`/${n.id}`)}
                tabIndex={0}
                role="link"
                aria-label={n.m.title}
              >
                <circle r={hover === n.id ? 11 : 8} fill={fill(n.m)} stroke={t.series1} strokeWidth={1.5} />
                <text y={-13} textAnchor="middle" fontSize={hover === n.id ? 13 : 10.5} fontWeight={hover === n.id ? 700 : 500} fill={t.ink} stroke={t.surface} strokeWidth={3} paintOrder="stroke">
                  {n.m.title.length > 24 && hover !== n.id ? `${n.m.title.slice(0, 22)}…` : n.m.title}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}
