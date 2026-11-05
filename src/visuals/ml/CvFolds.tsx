import { useVizTheme } from '../../components/vizTheme.ts'
import type { VisualProps } from '../index.ts'
import { useWidth } from '../useWidth.ts'
import s from '../visuals.module.css'

/**
 * 5 folds × 12 rows. Steps: the data; leaky selection looks at every row (including the test fold);
 * proper selection looks only at the training folds, separately for each split.
 */
export default function CvFolds({ state }: VisualProps) {
  const t = useVizTheme()
  const { ref, width } = useWidth()
  const phase = Number(state?.phase ?? 1)
  const folds = 5
  const rows = 12
  const cw = Math.min(70, (width - 260) / folds)
  const ch = 14
  const testFold = 2
  const used = (f: number) => (phase === 2 ? true : phase >= 3 ? f !== testFold : false)

  return (
    <div ref={ref} className={s.wrap}>
      <svg width={width} height={rows * ch + 70} role="img" aria-label={`Cross-validation step ${phase}`}>
        {Array.from({ length: folds }, (_, f) => (
          <g key={f} transform={`translate(${20 + f * (cw + 8)}, 24)`}>
            <text x={cw / 2} y={-8} textAnchor="middle" fontSize={11} fontWeight={f === testFold ? 700 : 400} fill={f === testFold ? t.series2 : t.inkSecondary}>
              {f === testFold ? 'test fold' : `fold ${f + 1}`}
            </text>
            {Array.from({ length: rows }, (_, r) => (
              <rect
                key={r}
                y={r * ch}
                width={cw}
                height={ch - 2}
                rx={2}
                fill={f === testFold ? t.series2 : t.series1}
                fillOpacity={phase >= 2 && used(f) ? 0.85 : 0.25}
                stroke={phase === 2 && f === testFold ? '#d03b3b' : 'none'}
                strokeWidth={2}
              />
            ))}
          </g>
        ))}
        <g transform={`translate(${20 + folds * (cw + 8) + 12}, 40)`}>
          {phase >= 2 && (
            <>
              <rect width={200} height={70} rx={8} fill={t.surface} stroke={phase === 2 ? '#d03b3b' : t.series3} strokeWidth={2} />
              <text x={100} y={22} textAnchor="middle" fontSize={12} fontWeight={700} fill={t.ink}>
                pick the 20 best features
              </text>
              <text x={100} y={42} textAnchor="middle" fontSize={11} fill={phase === 2 ? '#d03b3b' : t.series3}>
                {phase === 2 ? 'using ALL rows (test labels too) ✗' : 'using training folds only ✓'}
              </text>
              <text x={100} y={60} textAnchor="middle" fontSize={11} fill={t.inkSecondary}>
                {phase === 2 ? 'once, before splitting' : 'redone for every split'}
              </text>
            </>
          )}
        </g>
        <text x={20} y={rows * ch + 58} fontSize={11} fill={t.inkSecondary}>
          bright = rows the selection step looked at
        </text>
      </svg>
    </div>
  )
}
