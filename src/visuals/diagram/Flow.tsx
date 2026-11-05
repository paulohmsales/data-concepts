import { useVizTheme } from '../../components/vizTheme.ts'
import type { VisualProps } from '../index.ts'
import { useWidth } from '../useWidth.ts'
import s from '../visuals.module.css'

interface Node {
  id: string
  label: string
  sub?: string
  col: number
  row: number
}
interface Edge {
  from: string
  to: string
  label?: string
}

/**
 * A generic architecture/flow diagram from content: nodes on a grid (col, row) and arrows.
 * Stepper states can highlight nodes (`active`), mark failures (`bad`) and dim the rest.
 */
export default function Flow({ props, state }: VisualProps) {
  const t = useVizTheme()
  const { ref, width } = useWidth()
  const nodes = (props.nodes as Node[]) ?? []
  const edges = (props.edges as Edge[]) ?? []
  const active = new Set((state?.active as string[]) ?? nodes.map((n) => n.id))
  const bad = new Set((state?.bad as string[]) ?? [])
  const note = state?.note as string | undefined
  const cols = Math.max(...nodes.map((n) => n.col)) + 1
  const rows = Math.max(...nodes.map((n) => n.row)) + 1
  const cellW = (width - 20) / cols
  const nodeW = Math.min(170, cellW - 26)
  const nodeH = 52
  const rowH = 92
  const pos = (n: Node) => ({ x: 10 + n.col * cellW + (cellW - nodeW) / 2, y: 14 + n.row * rowH })
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const h = rows * rowH + (note ? 30 : 6)

  return (
    <div ref={ref} className={s.wrap}>
      <svg width={width} height={h} role="img" aria-label="Architecture diagram">
        <defs>
          <marker id="flowArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={t.inkSecondary} />
          </marker>
        </defs>
        {edges.map((e) => {
          const a = byId.get(e.from)
          const b = byId.get(e.to)
          if (!a || !b) return null
          const pa = pos(a)
          const pb = pos(b)
          const sameRow = a.row === b.row
          const x1 = sameRow ? pa.x + (b.col > a.col ? nodeW : 0) : pa.x + nodeW / 2
          const y1 = sameRow ? pa.y + nodeH / 2 : pa.y + (b.row > a.row ? nodeH : 0)
          const x2 = sameRow ? pb.x + (b.col > a.col ? 0 : nodeW) : pb.x + nodeW / 2
          const y2 = sameRow ? pb.y + nodeH / 2 : pb.y + (b.row > a.row ? 0 : nodeH)
          const on = active.has(e.from) && active.has(e.to)
          return (
            <g key={e.from + e.to} opacity={on ? 1 : 0.25}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={bad.has(e.to) ? '#d03b3b' : t.inkSecondary} strokeWidth={1.6} markerEnd="url(#flowArrow)" />
              {e.label && (
                <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 5} textAnchor="middle" fontSize={10} fill={t.inkSecondary}>
                  {e.label}
                </text>
              )}
            </g>
          )
        })}
        {nodes.map((n) => {
          const p = pos(n)
          const on = active.has(n.id)
          const isBad = bad.has(n.id)
          return (
            <g key={n.id} transform={`translate(${p.x}, ${p.y})`} opacity={on ? 1 : 0.3} style={{ transition: 'opacity 0.3s' }}>
              <rect width={nodeW} height={nodeH} rx={8} fill={isBad ? 'color-mix(in srgb, #d03b3b 14%, transparent)' : on ? t.surface : t.surface} stroke={isBad ? '#d03b3b' : on ? t.series1 : t.axis} strokeWidth={on ? 2 : 1} />
              <text x={nodeW / 2} y={n.sub ? 21 : 30} textAnchor="middle" fontSize={12.5} fontWeight={600} fill={t.ink}>
                {n.label}
              </text>
              {n.sub && (
                <text x={nodeW / 2} y={38} textAnchor="middle" fontSize={10.5} fill={t.inkSecondary}>
                  {n.sub}
                </text>
              )}
            </g>
          )
        })}
        {note && (
          <text x={10} y={h - 8} fontSize={12} fill={bad.size ? '#d03b3b' : t.inkSecondary}>
            {note}
          </text>
        )}
      </svg>
    </div>
  )
}
