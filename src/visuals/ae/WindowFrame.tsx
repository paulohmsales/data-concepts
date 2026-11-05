import { useEffect, useRef, useState } from 'react'
import { useVizTheme } from '../../components/vizTheme.ts'
import type { VisualProps } from '../index.ts'
import { useWidth } from '../useWidth.ts'
import s from '../visuals.module.css'

const ROWS = [
  { day: 1, amount: 10 },
  { day: 2, amount: 5 },
  { day: 2, amount: 20 },
  { day: 3, amount: 30 },
  { day: 4, amount: 15 },
]

type Frame = 'rows_unbounded' | 'range_default' | 'rows_2'
const LABEL: Record<Frame, string> = {
  rows_unbounded: 'ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW',
  range_default: 'default with ORDER BY: RANGE … CURRENT ROW (includes peers)',
  rows_2: 'ROWS BETWEEN 2 PRECEDING AND CURRENT ROW',
}

function frameOf(i: number, f: Frame): [number, number] {
  if (f === 'rows_2') return [Math.max(0, i - 2), i]
  if (f === 'rows_unbounded') return [0, i]
  let hi = i
  while (hi + 1 < ROWS.length && ROWS[hi + 1].day === ROWS[i].day) hi++
  return [0, hi]
}

/** The current row walks down one partition; the frame bracket shows which rows SUM sees. */
export default function WindowFrame({ props }: VisualProps) {
  const t = useVizTheme()
  const { ref, width } = useWidth()
  const [frame, setFrame] = useState<Frame>((props.frame as Frame) ?? 'range_default')
  const [cur, setCur] = useState(0)
  const [playing, setPlaying] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (!playing) return
    timer.current = window.setInterval(() => setCur((c) => (c + 1) % ROWS.length), 1100)
    return () => window.clearInterval(timer.current)
  }, [playing])
  const rowH = 34
  const [lo, hi] = frameOf(cur, frame)
  const result = (i: number) => {
    const [a, b] = frameOf(i, frame)
    return ROWS.slice(a, b + 1).reduce((x, r) => x + r.amount, 0)
  }
  const tableW = Math.min(420, width - 40)

  return (
    <div ref={ref} className={s.wrap}>
      <div className={s.controls}>
        <button type="button" onClick={() => setPlaying((p) => !p)}>
          {playing ? '❚❚ Pause' : '▶ Walk the rows'}
        </button>
        <button type="button" onClick={() => setCur((c) => (c + 1) % ROWS.length)}>
          Next row
        </button>
        <select value={frame} onChange={(e) => setFrame(e.target.value as Frame)} aria-label="Frame">
          <option value="range_default">default frame (RANGE)</option>
          <option value="rows_unbounded">ROWS unbounded → current</option>
          <option value="rows_2">ROWS 2 preceding</option>
        </select>
      </div>
      <div className={s.readout}>
        <code>SUM(amount) OVER (ORDER BY day {frame === 'range_default' ? '' : LABEL[frame]})</code>
      </div>
      <svg width={width} height={ROWS.length * rowH + 50} role="img" aria-label="Window frame for the current row">
        <text x={20} y={16} fontSize={11} fill={t.inkSecondary}>
          day · amount
        </text>
        <text x={20 + tableW - 10} y={16} textAnchor="end" fontSize={11} fill={t.inkSecondary}>
          SUM over the frame
        </text>
        <rect x={12} y={26 + lo * rowH} width={tableW + 16} height={(hi - lo + 1) * rowH - 4} rx={8} fill={t.series1} fillOpacity={0.12} stroke={t.series1} style={{ transition: 'all 0.35s' }} />
        {ROWS.map((r, i) => {
          const isCur = i === cur
          const peer = ROWS[i].day === ROWS[cur].day && i !== cur
          return (
            <g key={i} transform={`translate(20, ${30 + i * rowH})`}>
              <text x={0} y={18} fontSize={13} fontWeight={isCur ? 700 : 400} fill={t.ink}>
                {isCur ? '▶ ' : '   '}day {r.day} · {r.amount}
                {frame === 'range_default' && peer ? '  (peer: same day)' : ''}
              </text>
              <text x={tableW - 10} y={18} textAnchor="end" fontSize={13} fontWeight={isCur ? 700 : 400} fill={i <= cur ? t.ink : t.muted}>
                {i <= cur ? result(i) : ''}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
