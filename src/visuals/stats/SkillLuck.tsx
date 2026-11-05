import { scaleLinear } from 'd3'
import { useMemo } from 'react'
import { useVizTheme } from '../../components/vizTheme.ts'
import { mulberry32, normal } from '../../core/random.ts'
import type { VisualProps } from '../index.ts'
import { useWidth } from '../useWidth.ts'
import s from '../visuals.module.css'

/**
 * 30 people, each score = skill + luck (stacked). Steps: show test 1, pick the top 5, redraw luck
 * for test 2, and see the picked group fall back while their skill bars stay put.
 */
export default function SkillLuck({ state }: VisualProps) {
  const t = useVizTheme()
  const { ref, width } = useWidth()
  const phase = Number(state?.phase ?? 1)
  const people = useMemo(() => {
    const rng = mulberry32(10) // a draw where the top five’s second-test luck averages ≈ 0, like it does on average
    return Array.from({ length: 30 }, (_, i) => ({ i, skill: 10 * normal(rng), luck1: 10 * normal(rng), luck2: 10 * normal(rng) }))
  }, [])
  const byTest1 = [...people].sort((a, b) => b.skill + b.luck1 - (a.skill + a.luck1))
  const top = new Set(byTest1.slice(0, 5).map((p) => p.i))
  const order = phase >= 2 ? byTest1 : people
  const h = 260
  const mg = { l: 30, r: 12, t: 16, b: 28 }
  const bw = (width - mg.l - mg.r) / order.length
  const y = scaleLinear().domain([-45, 45]).range([h - mg.b, mg.t])
  const luckOf = (p: (typeof people)[number]) => (phase >= 3 ? p.luck2 : p.luck1)
  const avg = (f: (p: (typeof people)[number]) => number) => [...top].reduce((a, i) => a + f(people[i]), 0) / top.size

  return (
    <div ref={ref} className={s.wrap}>
      <div className={s.readout}>
        <span>
          <span style={{ color: t.series1 }}>■</span> skill (stays)
        </span>
        <span>
          <span style={{ color: t.series2 }}>■</span> luck (redrawn each test)
        </span>
        {phase >= 2 && (
          <span>
            Top 5 on test 1: <b>{avg((p) => p.skill + p.luck1).toFixed(1)}</b> above average
          </span>
        )}
        {phase >= 3 && (
          <span>
            Same five on test 2: <b>{avg((p) => p.skill + p.luck2).toFixed(1)}</b> (their skill: {avg((p) => p.skill).toFixed(1)})
          </span>
        )}
      </div>
      <svg width={width} height={h} role="img" aria-label="Scores split into skill and luck">
        <line x1={mg.l} x2={width - mg.r} y1={y(0)} y2={y(0)} stroke={t.axis} />
        {order.map((p, k) => {
          const x0 = mg.l + k * bw + 1
          const w = Math.max(2, bw - 3)
          const sk = p.skill
          const lk = luckOf(p)
          // stack: skill from 0, luck on top of skill
          const skillY = Math.min(y(0), y(sk))
          const luckY = Math.min(y(sk), y(sk + lk))
          const picked = phase >= 2 && top.has(p.i)
          return (
            <g key={p.i} style={{ transition: 'transform 0.4s' }} opacity={phase >= 2 && !picked ? 0.4 : 1}>
              <rect x={x0} width={w} y={skillY} height={Math.abs(y(sk) - y(0))} fill={t.series1} />
              <rect x={x0} width={w} y={luckY} height={Math.abs(y(sk + lk) - y(sk))} fill={t.series2} fillOpacity={0.8} />
              <circle cx={x0 + w / 2} cy={y(sk + lk)} r={2.5} fill={t.ink} />
              {picked && <rect x={x0 - 1} width={w + 2} y={mg.t - 4} height={h - mg.t - mg.b + 4} fill="none" stroke={t.ink} strokeDasharray="3 2" />}
            </g>
          )
        })}
        <text x={mg.l} y={h - 8} fontSize={11} fill={t.inkSecondary}>
          {phase >= 2 ? 'people sorted by their test 1 score →' : 'people →'}
        </text>
        {[-30, 0, 30].map((v) => (
          <text key={v} x={mg.l - 6} y={y(v) + 4} textAnchor="end" fontSize={10} fill={t.inkSecondary}>
            {v > 0 ? `+${v}` : v}
          </text>
        ))}
      </svg>
    </div>
  )
}
