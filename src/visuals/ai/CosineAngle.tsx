import { useState } from 'react'
import { useVizTheme } from '../../components/vizTheme.ts'
import { useWidth } from '../useWidth.ts'
import s from '../visuals.module.css'

/** Two vectors from the origin: drag the angle and B’s length and compare the three similarity measures. */
export default function CosineAngle() {
  const t = useVizTheme()
  const { ref, width } = useWidth()
  const [angle, setAngle] = useState(35)
  const [len, setLen] = useState(1)
  const rad = (angle * Math.PI) / 180
  const a = [1, 0]
  const b = [len * Math.cos(rad), len * Math.sin(rad)]
  const cos = Math.cos(rad)
  const dotp = a[0] * b[0] + a[1] * b[1]
  const dist = Math.hypot(a[0] - b[0], a[1] - b[1])
  const h = 240
  const ox = Math.min(width / 2 - 60, 200)
  const oy = h - 40
  const sc = Math.min(80, (h - 60) / Math.max(1, len))
  const P = (v: number[]) => [ox + v[0] * sc, oy - v[1] * sc]
  const [ax, ay] = P(a)
  const [bx, by] = P(b)

  return (
    <div ref={ref} className={s.wrap}>
      <div className={s.controls}>
        <label>
          Angle <input type="range" min={0} max={180} value={angle} onChange={(e) => setAngle(Number(e.target.value))} /> <b>{angle}°</b>
        </label>
        <label>
          Length of B <input type="range" min={0.3} max={2.5} step={0.1} value={len} onChange={(e) => setLen(Number(e.target.value))} /> <b>{len.toFixed(1)}</b>
        </label>
      </div>
      <div className={s.readout}>
        <span>
          cosine <b>{cos.toFixed(2)}</b> (direction only)
        </span>
        <span>
          dot product <b>{dotp.toFixed(2)}</b> (direction × length)
        </span>
        <span>
          euclidean distance <b>{dist.toFixed(2)}</b>
        </span>
      </div>
      <svg width={width} height={h} role="img" aria-label="Two vectors and their similarity">
        <path d={`M${ox + 30},${oy} A30,30 0 0 0 ${ox + 30 * Math.cos(rad)},${oy - 30 * Math.sin(rad)}`} fill="none" stroke={t.inkSecondary} />
        <line x1={ox} y1={oy} x2={ax} y2={ay} stroke={t.series1} strokeWidth={3} markerEnd="url(#vArrow)" />
        <line x1={ox} y1={oy} x2={bx} y2={by} stroke={t.series2} strokeWidth={3} markerEnd="url(#vArrow)" />
        <line x1={ax} y1={ay} x2={bx} y2={by} stroke={t.axis} strokeDasharray="4 3" />
        <text x={ax + 6} y={ay + 4} fontSize={12} fill={t.series1} fontWeight={700}>
          A (query)
        </text>
        <text x={bx + 6} y={by} fontSize={12} fill={t.series2} fontWeight={700}>
          B (document)
        </text>
        <defs>
          <marker id="vArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={t.inkSecondary} />
          </marker>
        </defs>
      </svg>
    </div>
  )
}
