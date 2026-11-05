import { useVizTheme } from '../../components/vizTheme.ts'
import type { VisualProps } from '../index.ts'
import { useWidth } from '../useWidth.ts'
import s from '../visuals.module.css'

const DAY1 = ['bruno', 'carla', 'davi']
const DAY2 = ['ana', 'bruno', 'carla', 'davi']
const FACTS = [
  { order: 1, who: 'bruno' },
  { order: 2, who: 'carla' },
  { order: 3, who: 'davi' },
]

/** Facts store keys from day 1; the dimension is rebuilt on day 2. row_number keys shift, hashes don’t. */
export default function KeyShift({ state }: VisualProps) {
  const t = useVizTheme()
  const { ref, width } = useWidth()
  const phase = Number(state?.phase ?? 1)
  const strategy = String(state?.strategy ?? 'rownum')
  const dim = phase >= 2 ? DAY2 : DAY1
  const key = (name: string, list: string[]) => (strategy === 'hash' ? `md5:${name.slice(0, 2)}…` : String(list.indexOf(name) + 1))
  const rowH = 30
  const colW = Math.min(200, (width - 80) / 2)
  const xF = 10
  const xD = width - colW - 10
  const h = 40 + rowH * 4 + 30

  return (
    <div ref={ref} className={s.wrap}>
      <svg width={width} height={h} role="img" aria-label="Fact keys pointing into a rebuilt dimension">
        <text x={xF} y={16} fontSize={11} fontWeight={700} fill={t.ink}>
          fact_orders (keys saved on day 1)
        </text>
        <text x={xD} y={16} fontSize={11} fontWeight={700} fill={t.ink}>
          dim_customer (built on day {phase >= 2 ? 2 : 1})
        </text>
        {dim.map((name, i) => (
          <g key={name} transform={`translate(${xD}, ${28 + i * rowH})`}>
            <rect width={colW} height={rowH - 6} rx={5} fill={name === 'ana' ? t.series2 : t.series1} fillOpacity={0.16} stroke={name === 'ana' ? t.series2 : t.series1} />
            <text x={8} y={17} fontSize={12} fill={t.ink}>
              key {key(name, dim)} → {name}
            </text>
          </g>
        ))}
        {FACTS.map((f, i) => {
          const savedKey = key(f.who, DAY1)
          const target = dim.findIndex((n) => key(n, dim) === savedKey)
          const wrong = dim[target] !== f.who
          return (
            <g key={f.order}>
              <g transform={`translate(${xF}, ${28 + i * rowH})`}>
                <rect width={colW} height={rowH - 6} rx={5} fill={t.surface} stroke={wrong ? '#d03b3b' : t.axis} />
                <text x={8} y={17} fontSize={12} fill={t.ink}>
                  order {f.order}: key {savedKey} ({f.who}’s)
                </text>
              </g>
              <path
                d={`M${xF + colW},${28 + i * rowH + 12} C${(xF + colW + xD) / 2},${28 + i * rowH + 12} ${(xF + colW + xD) / 2},${28 + target * rowH + 12} ${xD},${28 + target * rowH + 12}`}
                fill="none"
                stroke={wrong ? '#d03b3b' : t.series3}
                strokeWidth={2}
              />
              {wrong && (
                <text x={(xF + colW + xD) / 2} y={28 + target * rowH + 4} textAnchor="middle" fontSize={11} fill="#d03b3b" fontWeight={600}>
                  now credited to {dim[target]} ✗
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
