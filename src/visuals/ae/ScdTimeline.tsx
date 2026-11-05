import { useVizTheme } from '../../components/vizTheme.ts'
import type { VisualProps } from '../index.ts'
import { useWidth } from '../useWidth.ts'
import s from '../visuals.module.css'

const START = Date.UTC(2026, 0, 1)
const END = Date.UTC(2026, 6, 1)
const day = (m: number, d: number) => Date.UTC(2026, m - 1, d)
const MOVE = day(4, 1)
const SALES = [
  { t: day(1, 10), amount: 100 },
  { t: day(2, 5), amount: 40 },
  { t: day(4, 12), amount: 150 },
]
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']

/**
 * Ana's dimension rows over time and the sales that join to each.
 * state.mode: t1 (one overwritten row), t2 (versions with validity ranges), t2bug (join ignores the range).
 */
export default function ScdTimeline({ state }: VisualProps) {
  const t = useVizTheme()
  const { ref, width } = useWidth()
  const mode = String(state?.mode ?? 't2')
  const left = 96
  const right = 16
  const x = (ms: number) => left + ((ms - START) / (END - START)) * (width - left - right)
  const rows =
    mode === 't1'
      ? [{ label: 'South', from: START, to: END, note: 'region overwritten in April' }]
      : [
          { label: 'North', from: START, to: MOVE, note: 'valid until 1 Apr' },
          { label: 'South', from: MOVE, to: END, note: 'valid from 1 Apr' },
        ]
  const rowY = (i: number) => 34 + i * 34
  const salesY = 34 + 2 * 34 + 26
  const h = salesY + 44
  const targets = (ms: number) =>
    mode === 't2bug' ? rows.map((_, i) => i) : rows.flatMap((r, i) => (ms >= r.from && ms < r.to ? [i] : []))

  return (
    <div ref={ref} className={s.wrap}>
      <svg width={width} height={h} role="img" aria-label="Ana's customer dimension rows over time and which rows her sales join to">
        {MONTHS.map((m, i) => (
          <g key={m}>
            <line x1={x(day(i + 1, 1))} x2={x(day(i + 1, 1))} y1={20} y2={h - 18} stroke={t.grid} />
            <text x={x(day(i + 1, 1)) + 4} y={14} fontSize={11} fill={t.muted}>
              {m}
            </text>
          </g>
        ))}
        <line x1={x(MOVE)} x2={x(MOVE)} y1={20} y2={h - 18} stroke={t.ink} strokeDasharray="4 3" />
        <text x={x(MOVE) - 4} y={h - 4} fontSize={11} textAnchor="end" fill={t.inkSecondary}>
          ← Q1 report
        </text>
        <text x={8} y={rowY(0) + 16} fontSize={11} fontWeight={700} fill={t.ink}>
          dim_customer
        </text>
        {rows.map((r, i) => (
          <g key={r.label + i}>
            <rect x={x(r.from)} y={rowY(i)} width={x(r.to) - x(r.from) - 2} height={24} rx={5} fill={i === 0 && mode !== 't1' ? t.series1 : t.series2} fillOpacity={0.18} stroke={i === 0 && mode !== 't1' ? t.series1 : t.series2} />
            <text x={x(r.from) + 8} y={rowY(i) + 16} fontSize={12} fill={t.ink}>
              Ana · {r.label} <tspan fill={t.inkSecondary}>({r.note})</tspan>
            </text>
          </g>
        ))}
        <text x={8} y={salesY + 4} fontSize={11} fontWeight={700} fill={t.ink}>
          her sales
        </text>
        {SALES.map((sale) =>
          targets(sale.t).map((i) => (
            <line
              key={`${sale.t}-${i}`}
              x1={x(sale.t)}
              x2={x(sale.t)}
              y1={salesY - 8}
              y2={rowY(i) + 24}
              stroke={mode === 't2bug' ? '#d03b3b' : t.inkSecondary}
              strokeWidth={1.5}
              strokeDasharray={mode === 't2bug' ? '3 2' : undefined}
            />
          )),
        )}
        {SALES.map((sale) => (
          <g key={sale.t}>
            <circle cx={x(sale.t)} cy={salesY} r={6} fill={t.surface} stroke={t.ink} strokeWidth={2} />
            <text x={x(sale.t)} y={salesY + 22} fontSize={11} textAnchor="middle" fill={t.ink}>
              ${sale.amount}
              {mode === 't2bug' ? ' ×2' : ''}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}
