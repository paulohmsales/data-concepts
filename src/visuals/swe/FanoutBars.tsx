import { scaleLog } from 'd3'
import { useState } from 'react'
import { useVizTheme } from '../../components/vizTheme.ts'
import { mulberry32 } from '../../core/random.ts'
import { backendCall } from '../../core/swe/tail.ts'
import { useWidth } from '../useWidth.ts'
import s from '../visuals.module.css'

/** One request fans out to 40 backends; it can only answer when the slowest one does. */
export default function FanoutBars() {
  const t = useVizTheme()
  const { ref, width } = useWidth()
  const [seed, setSeed] = useState(3)
  const rng = mulberry32(seed)
  const calls = Array.from({ length: 40 }, () => backendCall({ slowShare: 0.02, fastMs: 10, slowMs: 400 }, rng))
  const worst = Math.max(...calls)
  const x = scaleLog().domain([4, 1500]).range([90, width - 20]).clamp(true)
  const rowH = 6
  const h = calls.length * rowH + 50

  return (
    <div ref={ref} className={s.wrap}>
      <div className={s.controls}>
        <button type="button" onClick={() => setSeed((v) => v + 1)}>
          ↻ Another request
        </button>
      </div>
      <div className={s.readout}>
        <span>
          median backend <b>{Math.round([...calls].sort((a, b) => a - b)[20])} ms</b>
        </span>
        <span style={{ color: worst > 100 ? '#d03b3b' : undefined }}>
          the request waits for the slowest: <b>{Math.round(worst)} ms</b>
        </span>
      </div>
      <svg width={width} height={h} role="img" aria-label="Latency of 40 backend calls in one request">
        {calls.map((v, i) => (
          <rect key={i} x={x(4)} y={10 + i * rowH} width={x(v) - x(4)} height={rowH - 1.5} rx={1.5} fill={v > 100 ? '#d03b3b' : t.series1} />
        ))}
        <line x1={x(worst)} x2={x(worst)} y1={4} y2={h - 30} stroke={t.ink} strokeDasharray="4 3" />
        <text x={8} y={h / 2 - 10} fontSize={11} fill={t.inkSecondary}>
          40 backend
        </text>
        <text x={8} y={h / 2 + 4} fontSize={11} fill={t.inkSecondary}>
          calls
        </text>
        {[10, 100, 1000].map((v) => (
          <text key={v} x={x(v)} y={h - 12} textAnchor="middle" fontSize={10} fill={t.inkSecondary}>
            {v} ms
          </text>
        ))}
      </svg>
    </div>
  )
}
