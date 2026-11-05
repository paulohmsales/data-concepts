import { useState } from 'react'
import { useVizTheme } from '../../components/vizTheme.ts'
import type { VisualProps } from '../index.ts'
import { useWidth } from '../useWidth.ts'
import s from '../visuals.module.css'

const QUERIES = {
  last7: { label: "WHERE event_date >= '2026-03-25'", scan: (d: number) => d >= 83 },
  march: { label: "WHERE event_date BETWEEN '2026-03-01' AND '2026-03-31'", scan: (d: number) => d >= 59 },
  fn: { label: "WHERE strftime(event_date, '%Y-%m') = '2026-03'", scan: () => true },
  none: { label: 'WHERE user_id = 4242', scan: () => true },
} as const
type Q = keyof typeof QUERIES

/** 90 daily folders; the engine opens only those the WHERE clause can match (from folder names alone). */
export default function PruneCalendar({ props }: VisualProps) {
  const t = useVizTheme()
  const { ref, width } = useWidth()
  const [q, setQ] = useState<Q>((props.query as Q) ?? 'last7')
  const cols = 31
  const cell = Math.min(24, (width - 90) / cols)
  const months = [
    { name: 'Jan', start: 0, days: 31 },
    { name: 'Feb', start: 31, days: 28 },
    { name: 'Mar', start: 59, days: 31 },
  ]
  const scanned = Array.from({ length: 90 }, (_, d) => QUERIES[q].scan(d)).filter(Boolean).length

  return (
    <div ref={ref} className={s.wrap}>
      <div className={s.controls}>
        {(Object.keys(QUERIES) as Q[]).map((k) => (
          <button key={k} type="button" onClick={() => setQ(k)} style={q === k ? { background: t.ink, color: t.surface } : undefined}>
            {k === 'last7' ? 'last 7 days' : k === 'march' ? 'March (range)' : k === 'fn' ? 'March (function)' : 'one user'}
          </button>
        ))}
      </div>
      <div className={s.readout}>
        <code>{QUERIES[q].label}</code>
        <span>
          folders opened <b style={{ color: scanned > 40 ? '#d03b3b' : undefined }}>{scanned} of 90</b>
        </span>
      </div>
      <svg width={width} height={months.length * (cell + 6) + 30} role="img" aria-label={`${scanned} of 90 daily partitions scanned`}>
        {months.map((m, r) => (
          <g key={m.name} transform={`translate(0, ${10 + r * (cell + 6)})`}>
            <text x={0} y={cell * 0.7} fontSize={12} fill={t.inkSecondary}>
              {m.name}
            </text>
            {Array.from({ length: m.days }, (_, i) => {
              const d = m.start + i
              const hit = QUERIES[q].scan(d)
              return <rect key={d} x={40 + i * cell} width={cell - 3} height={cell} rx={3} fill={hit ? t.series2 : t.neutral} fillOpacity={hit ? 0.9 : 0.35} style={{ transition: 'fill 0.25s' }} />
            })}
          </g>
        ))}
        <text x={40} y={months.length * (cell + 6) + 24} fontSize={11} fill={t.inkSecondary}>
          each square is a folder event_date=… ; orange = opened
        </text>
      </svg>
    </div>
  )
}
