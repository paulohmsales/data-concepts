import { scaleSymlog } from 'd3'
import { useVizTheme } from '../../components/vizTheme.ts'
import type { VisualProps } from '../index.ts'
import { useWidth } from '../useWidth.ts'
import s from '../visuals.module.css'

const STEPS = ['visit', 'signup', 'cart', 'purchase'] as const
type Ev = { step: (typeof STEPS)[number]; h: number }
const USERS: { name: string; events: Ev[]; note: string }[] = [
  { name: 'Ana', events: [{ step: 'visit', h: 0 }, { step: 'signup', h: 2 }, { step: 'cart', h: 5 }, { step: 'purchase', h: 9 }], note: 'all four, in order, within a day' },
  { name: 'Bruno', events: [{ step: 'visit', h: 0 }, { step: 'signup', h: 3 }], note: 'stops at signup' },
  { name: 'Carla', events: [{ step: 'visit', h: 0 }, { step: 'cart', h: 1 }, { step: 'purchase', h: 4 }], note: 'guest checkout: no signup event' },
  { name: 'Davi', events: [{ step: 'visit', h: 0 }, { step: 'signup', h: 1 }, { step: 'cart', h: 2 }, { step: 'purchase', h: 150 }], note: 'buys six days later' },
  { name: 'bot-17', events: [{ step: 'visit', h: 0 }], note: 'a crawler' },
]

/** Individual journeys on a time axis; which ones a strict funnel (ordered, 72 h window, no bots) counts. */
export default function FunnelPaths({ state }: VisualProps) {
  const t = useVizTheme()
  const { ref, width } = useWidth()
  const phase = Number(state?.phase ?? 1)
  const windowH = 72
  const rowH = 44
  const mg = { l: 70, r: 210, t: 40 }
  const x = scaleSymlog().constant(1).domain([0, 160]).range([mg.l + 10, width - mg.r])
  const h = mg.t + USERS.length * rowH + 30
  const reached = (u: (typeof USERS)[number]) => {
    if (phase >= 4 && u.name.startsWith('bot')) return -1
    let k = -1
    for (const e of u.events) {
      if (phase >= 2 && e.step !== STEPS[k + 1]) continue
      if (phase >= 3 && e.h > windowH) break
      k = phase >= 2 ? k + 1 : Math.max(k, STEPS.indexOf(e.step))
    }
    return k
  }
  const counts = STEPS.map((_, i) => USERS.filter((u) => (phase >= 2 ? reached(u) >= i : u.events.some((e) => e.step === STEPS[i]) && !(phase >= 4 && u.name.startsWith('bot')))).length)
  const color = [t.neutral, t.series1, t.series3, t.series2]

  return (
    <div ref={ref} className={s.wrap}>
      <div className={s.readout}>
        {STEPS.map((st, i) => (
          <span key={st}>
            {st} <b>{counts[i]}</b>
            {i > 0 && counts[i - 1] ? ` (${Math.round((100 * counts[i]) / counts[i - 1])}%)` : ''}
          </span>
        ))}
      </div>
      <svg width={width} height={h} role="img" aria-label="User journeys through the funnel">
        {phase >= 3 && <rect x={x(0)} width={x(windowH) - x(0)} y={mg.t - 6} height={USERS.length * rowH} fill={t.series1} fillOpacity={0.06} />}
        {phase >= 3 && (
          <text x={x(windowH)} y={mg.t - 8} textAnchor="end" fontSize={11} fill={t.series1}>
            72 h window
          </text>
        )}
        {USERS.map((u, r) => {
          const k = reached(u)
          const y0 = mg.t + r * rowH + 14
          const excluded = phase >= 4 && u.name.startsWith('bot')
          return (
            <g key={u.name} opacity={excluded ? 0.35 : 1}>
              <text x={mg.l - 10} y={y0 + 4} textAnchor="end" fontSize={12} fontWeight={600} fill={t.ink}>
                {u.name}
              </text>
              <line x1={x(0)} x2={x(Math.min(160, u.events[u.events.length - 1].h))} y1={y0} y2={y0} stroke={t.axis} />
              {u.events.map((e) => {
                const counted = phase >= 2 ? STEPS.indexOf(e.step) <= k && !(phase >= 3 && e.h > windowH) : !excluded
                return (
                  <g key={e.step}>
                    <circle cx={x(Math.min(160, e.h))} cy={y0} r={9} fill={counted ? color[STEPS.indexOf(e.step)] : t.surface} stroke={color[STEPS.indexOf(e.step)]} strokeWidth={2} />
                  </g>
                )
              })}
              <text x={width - mg.r + 12} y={y0 + 4} fontSize={11} fill={t.inkSecondary}>
                {u.note}
              </text>
            </g>
          )
        })}
        {[0, 1, 5, 24, 72, 150].map((v) => (
          <text key={v} x={x(v)} y={h - 16} textAnchor="middle" fontSize={10} fill={t.inkSecondary}>
            {v}h
          </text>
        ))}
        <text x={x(160)} y={h - 1} textAnchor="end" fontSize={11} fill={t.inkSecondary}>
          hours since first visit (log scale) →
        </text>
        {STEPS.map((st, i) => (
          <g key={st} transform={`translate(${mg.l + i * 80}, 14)`}>
            <circle r={5} cx={0} cy={-4} fill={color[i]} />
            <text x={8} fontSize={11} fill={t.inkSecondary}>
              {st}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}
