import { scaleLinear } from 'd3'
import { useVizTheme } from '../../components/vizTheme.ts'
import type { VisualProps } from '../index.ts'
import { useWidth } from '../useWidth.ts'
import s from '../visuals.module.css'

interface Row {
  id: string
  updatedAt: number
  /** First phase in which the row exists in the source. */
  from: number
}

const ROWS: Row[] = [
  { id: '1', updatedAt: 1, from: 1 },
  { id: '2', updatedAt: 2, from: 1 },
  { id: '3', updatedAt: 3, from: 1 },
  { id: '4', updatedAt: 4, from: 1 },
  { id: '5', updatedAt: 5, from: 1 },
  { id: '6', updatedAt: 6, from: 2 },
  { id: '7', updatedAt: 7, from: 2 },
  { id: '8', updatedAt: 9, from: 3 },
  { id: '4b', updatedAt: 4, from: 5 },
]

/** What each run extracted, by phase: (lo, hi] on updated_at. */
const RUNS: Record<number, { lo: number; hi: number; label: string }[]> = {
  1: [{ lo: 0, hi: 5, label: 'run 1' }],
  2: [{ lo: 5, hi: 7, label: 'run 2' }],
  3: [{ lo: 7, hi: 8.6, label: 'run 3 extracts at t = 9' }],
  4: [{ lo: 10, hi: 12, label: 'later runs: updated_at > 10' }],
  5: [{ lo: 10, hi: 12, label: 'updated_at > 10' }],
}

/** Rows plotted on the updated_at axis, with each run's extraction band and the saved watermark. */
export default function WatermarkTimeline({ state }: VisualProps) {
  const t = useVizTheme()
  const { ref, width } = useWidth()
  const phase = Number(state?.phase ?? 1)
  const h = 220
  const m = { l: 20, r: 20, t: 30, b: 40 }
  const x = scaleLinear().domain([0, 12]).range([m.l, width - m.r])
  const laneY = 92
  const bad = '#d03b3b'
  const good = t.series3

  const loaded = (r: Row) => {
    if (r.id === '8') return false
    if (r.id === '4b') return false
    return r.from <= Math.min(phase, 2)
  }
  const status = (r: Row) => {
    if (r.id === '8' && phase >= 4) return 'skipped'
    if (r.id === '4b' && phase >= 5) return 'late'
    return loaded(r) ? 'loaded' : 'pending'
  }
  const fill = (st: string) => (st === 'loaded' ? t.series1 : st === 'skipped' || st === 'late' ? bad : t.surface)
  const watermark = phase === 1 ? 5 : phase === 2 ? 7 : 10
  const visible = ROWS.filter((r) => r.from <= phase)

  return (
    <div ref={ref} className={s.wrap}>
      <svg width={width} height={h} role="img" aria-label={`Watermark timeline, step ${phase}`}>
        {(RUNS[phase] ?? []).map((b) => (
          <g key={b.label}>
            <rect x={x(b.lo)} width={x(b.hi) - x(b.lo)} y={m.t} height={laneY - m.t + 30} fill={t.series1} fillOpacity={0.12} rx={4} />
            <text x={(x(b.lo) + x(b.hi)) / 2} y={m.t - 8} textAnchor="middle" fontSize={11} fill={t.series1}>
              {b.label}
            </text>
          </g>
        ))}
        {phase >= 5 && (
          <g>
            <rect x={x(3)} width={x(12) - x(3)} y={laneY + 30} height={12} fill={good} fillOpacity={0.35} rx={3} />
            <text x={x(3)} y={laneY + 56} fontSize={11} fill={good}>
              a lookback of 4 (updated_at &gt; W − 4 with W = 7) would re-read from 3 and catch 4b
            </text>
          </g>
        )}
        <line x1={x(watermark)} x2={x(watermark)} y1={m.t - 2} y2={laneY + 34} stroke={phase >= 3 ? bad : t.ink} strokeWidth={2} />
        <text x={x(watermark) + (phase >= 3 ? -4 : 4)} y={laneY + 34} textAnchor={phase >= 3 ? 'end' : 'start'} fontSize={11} fill={phase >= 3 ? bad : t.ink}>
          {phase >= 3 ? 'watermark = job end (10) ✗' : `watermark ${watermark}`}
        </text>
        {phase >= 3 && (
          <g>
            <line x1={x(7)} x2={x(7)} y1={m.t + 6} y2={laneY + 20} stroke={good} strokeWidth={2} strokeDasharray="5 3" />
            <text x={x(7) - 4} y={m.t + 14} textAnchor="end" fontSize={11} fill={good}>
              max(updated_at) loaded = 7 ✓
            </text>
          </g>
        )}
        {visible.map((r) => {
          const st = status(r)
          const dy = r.id === '4b' ? -26 : 0
          return (
            <g key={r.id}>
              <circle cx={x(r.updatedAt)} cy={laneY + dy} r={11} fill={fill(st)} stroke={st === 'pending' ? t.ink : 'none'} strokeWidth={1.5} />
              <text x={x(r.updatedAt)} y={laneY + dy + 4} textAnchor="middle" fontSize={10} fontWeight={700} fill={st === 'pending' ? t.ink : '#fff'}>
                {r.id}
              </text>
              {(st === 'skipped' || st === 'late') && (
                <text x={x(r.updatedAt)} y={laneY + dy - 16} textAnchor="middle" fontSize={11} fill={bad} fontWeight={600}>
                  {st === 'skipped' ? 'never loaded ✗' : 'arrives late ✗'}
                </text>
              )}
            </g>
          )
        })}
        <line x1={m.l} x2={width - m.r} y1={h - m.b} y2={h - m.b} stroke={t.axis} />
        {Array.from({ length: 13 }, (_, i) => i).map((v) => (
          <text key={v} x={x(v)} y={h - m.b + 16} textAnchor="middle" fontSize={10} fill={t.inkSecondary}>
            {v}
          </text>
        ))}
        <text x={width - m.r} y={h - 6} textAnchor="end" fontSize={11} fill={t.inkSecondary}>
          updated_at →
        </text>
        <g transform={`translate(${m.l}, ${h - 6})`}>
          <circle r={5} cx={5} cy={-4} fill={t.series1} />
          <text x={14} fontSize={11} fill={t.inkSecondary}>
            loaded
          </text>
          <circle r={5} cx={70} cy={-4} fill={t.surface} stroke={t.ink} />
          <text x={79} fontSize={11} fill={t.inkSecondary}>
            in source, not loaded
          </text>
        </g>
      </svg>
    </div>
  )
}
