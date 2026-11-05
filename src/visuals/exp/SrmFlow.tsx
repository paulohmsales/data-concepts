import { useVizTheme } from '../../components/vizTheme.ts'
import type { VisualProps } from '../index.ts'
import { useWidth } from '../useWidth.ts'
import s from '../visuals.module.css'

/** Users flowing from assignment to the logs; B’s slow page loses impatient (low-intent) users. */
export default function SrmFlow({ state }: VisualProps) {
  const t = useVizTheme()
  const { ref, width } = useWidth()
  const phase = Number(state?.phase ?? 1)
  const cols = 20
  const users = Array.from({ length: 80 }, (_, i) => ({ i, arm: i % 2 ? 'B' : 'A', low: (i * 7) % 10 < 5 }))
  const lost = (u: (typeof users)[number]) => phase >= 2 && u.arm === 'B' && u.low && (u.i * 13) % 10 < 4
  const dot = Math.min(12, (width / 2 - 40) / cols)
  const h = 260
  const lane = (arm: string) => (arm === 'A' ? 0 : 1)
  const logged = (arm: string) => users.filter((u) => u.arm === arm && !lost(u))
  const rate = (arm: string) => {
    const g = logged(arm)
    return g.filter((u) => !u.low).length / g.length
  }

  return (
    <div ref={ref} className={s.wrap}>
      <div className={s.readout}>
        <span>
          Logged in A <b>{logged('A').length}</b>, in B <b>{logged('B').length}</b>
        </span>
        {phase >= 3 && (
          <span>
            Share of high-intent users: A <b>{(rate('A') * 100).toFixed(0)}%</b>, B <b style={{ color: '#d03b3b' }}>{(rate('B') * 100).toFixed(0)}%</b>
          </span>
        )}
      </div>
      <svg width={width} height={h} role="img" aria-label="Users assigned to A and B, with B losing some users before logging">
        {['A', 'B'].map((arm) => (
          <g key={arm} transform={`translate(${lane(arm) * (width / 2) + 16}, 20)`}>
            <text fontWeight={700} fontSize={13} fill={t.ink}>
              {arm === 'A' ? 'A: normal page' : 'B: slower page'}
            </text>
            {users
              .filter((u) => u.arm === arm)
              .map((u, k) => {
                const gone = lost(u)
                const cx = (k % cols) * (dot + 2) + dot / 2
                const cy = 24 + Math.floor(k / cols) * (dot + 2) + (gone ? 120 : 0)
                return (
                  <circle
                    key={u.i}
                    cx={cx}
                    cy={cy}
                    r={dot / 2}
                    fill={gone ? 'none' : u.low ? t.neutral : t.series1}
                    stroke={gone ? '#d03b3b' : 'none'}
                    strokeDasharray={gone ? '2 2' : undefined}
                    style={{ transition: 'cy 0.6s' }}
                  />
                )
              })}
            {phase >= 2 && arm === 'B' && (
              <text y={170} fontSize={11} fill="#d03b3b">
                left before the tracking event fired ✗ (never logged)
              </text>
            )}
          </g>
        ))}
        <g transform={`translate(16, ${h - 14})`}>
          <circle r={5} cx={5} cy={-4} fill={t.series1} />
          <text x={14} fontSize={11} fill={t.inkSecondary}>
            high intent
          </text>
          <circle r={5} cx={100} cy={-4} fill={t.neutral} />
          <text x={109} fontSize={11} fill={t.inkSecondary}>
            low intent
          </text>
        </g>
      </svg>
    </div>
  )
}
