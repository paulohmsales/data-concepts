import * as Plot from '@observablehq/plot'
import { useCallback, useDeferredValue, useMemo, useState } from 'react'
import { ResetButton, SeedControl } from '../../components/Controls.tsx'
import DataTable from '../../components/DataTable.tsx'
import ModuleLayout from '../../components/ModuleLayout.tsx'
import PlotFigure from '../../components/PlotFigure.tsx'
import Slider from '../../components/Slider.tsx'
import { Stat, StatRow } from '../../components/Stat.tsx'
import Status from '../../components/Status.tsx'
import type { VizTheme } from '../../components/vizTheme.ts'
import { mulberry32 } from '../../core/random.ts'
import { simulateLeak, srmTest } from '../../core/srm.ts'
import { int, pct, pValue, signedPct } from '../../format.ts'
import styles from '../common.module.css'

interface Controls {
  n: number
  share: number
  leak: number
  lift: number
  seed: number
}

const DEFAULTS: Controls = { n: 100_000, share: 0.503, leak: 0.1, lift: 0, seed: 1 }
const ALARM = 0.001
const BASELINE = 0.1

function leakStudy(c: Controls) {
  const params = { n: c.n, baseline: BASELINE, lift: c.lift, leak: c.leak }
  const one = simulateLeak(params, mulberry32(c.seed))
  const rng = mulberry32(c.seed + 1)
  const runs = 400
  const results = Array.from({ length: runs }, () => simulateLeak(params, rng))
  return {
    one,
    runs,
    wins: results.filter((r) => r.ab.significant && r.ab.diff > 0).length / runs,
    flagged: results.filter((r) => r.srm.p < ALARM).length / runs,
  }
}

export default function Srm() {
  const [c, setC] = useState(DEFAULTS)
  const deferred = useDeferredValue(c)
  const stale = deferred !== c
  const set = <K extends keyof Controls>(k: K) => (v: Controls[K]) => setC((s) => ({ ...s, [k]: v }))

  const nB = Math.round(c.n * c.share)
  const test = srmTest([c.n - nB, nB], [0.5, 0.5])

  const leak = useMemo(() => leakStudy(deferred), [deferred])

  const buildCurve = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => {
      const n = c.n
      const b0 = Math.round(n * c.share)
      const here = srmTest([n - b0, b0], [0.5, 0.5]).p
      const pts = Array.from({ length: 201 }, (_, i) => {
        const s = 0.48 + (0.04 * i) / 200
        const b = Math.round(n * s)
        return { s, p: Math.max(1e-12, srmTest([n - b, b], [0.5, 0.5]).p) }
      })
      return {
        width,
        height: 240,
        x: { domain: [0.48, 0.52], tickFormat: '.1%', label: 'share of users logged in B →' },
        y: { type: 'log', domain: [1e-12, 1], tickFormat: '~g', label: '↑ SRM p-value (log)', grid: true },
        marks: [
          Plot.areaY(pts.filter((d) => d.p < ALARM), { x: 's', y1: 1e-12, y2: ALARM, fill: '#d03b3b', fillOpacity: 0.08, z: (d: { s: number }) => (d.s < 0.5 ? 'lo' : 'hi') }),
          Plot.ruleY([ALARM], { stroke: '#d03b3b', strokeDasharray: '4 3' }),
          Plot.text([ALARM], { y: (d: number) => d, frameAnchor: 'left', dy: -8, dx: 4, textAnchor: 'start', text: () => '✗ alarm below p = 0.001', fill: t.inkSecondary }),
          Plot.line(pts, { x: 's', y: 'p', stroke: t.series1, strokeWidth: 2, tip: { format: { x: '.2%', y: '.2g' } } }),
          Plot.dot([{ s: c.share, p: Math.max(1e-12, here) }], { x: 's', y: 'p', fill: t.series1, r: 6, stroke: t.surface, strokeWidth: 2 }),
        ],
      }
    },
    [c.n, c.share],
  )

  const { one } = leak
  const panel = (
    <>
      <strong>Play: an observed split</strong>
      <Slider label="Users in the experiment" value={c.n} onChange={set('n')} min={1000} max={10_000_000} step={1} log format={int} />
      <Slider label="Share logged in B (planned 50%)" value={c.share} onChange={set('share')} min={0.48} max={0.52} step={0.0005} format={(v) => pct(v, 2)} />
      <strong>Break it: a leaky B</strong>
      <Slider label="B’s low-intent users lost from logs" value={c.leak} onChange={set('leak')} min={0} max={0.3} step={0.01} format={(v) => pct(v, 0)} />
      <Slider label="B’s true lift" value={c.lift} onChange={set('lift')} min={-0.1} max={0.1} step={0.01} format={(v) => signedPct(v, 0)} />
      <SeedControl seed={c.seed} onChange={set('seed')} />
      <ResetButton onClick={() => setC(DEFAULTS)} />
    </>
  )

  return (
    <ModuleLayout
      onPreset={(p) => setC({ ...DEFAULTS, ...(p as Partial<Controls>) })}
      controls={panel}
      play={
        <>
          <h3>Is this split suspicious?</h3>
          <StatRow>
            <Stat label="A / B users" value={`${int(c.n - nB)} / ${int(nB)}`} note={`gap ${int(Math.abs(c.n - 2 * nB))}`} />
            <Stat label="Chi-square" value={test.chi2.toFixed(2)} note="1 degree of freedom" />
            <Stat label="SRM p-value" value={pValue(test.p)} note={test.p < ALARM ? <Status level="bad">mismatch: don’t trust the results</Status> : <Status level="good">consistent with 50/50</Status>} />
          </StatRow>
          <PlotFigure build={buildCurve} label="SRM p-value against observed share at the current sample size" />
        </>
      }
      breakIt={
        <div className={stale ? styles.stale : undefined}>
          <h3>The variant that wins because it lost users</h3>
          <p className="lede">
            B does nothing (true lift {signedPct(deferred.lift, 0)}), but its page is slower. Impatient,
            low-intent visitors leave before the tracking fires, so {pct(deferred.leak, 0)} of them never
            appear in B’s logs. The users left in B are more motivated than A’s.
          </p>
          <DataTable
            rows={[
              { arm: 'A', n: one.nA, conv: one.convA },
              { arm: 'B', n: one.nB, conv: one.convB },
            ]}
            rowKey={(r) => r.arm}
            columns={[
              { key: 'a', label: 'Arm', render: (r) => r.arm },
              { key: 'n', label: 'Users logged', align: 'right', render: (r) => int(r.n) },
              { key: 'c', label: 'Conversions', align: 'right', render: (r) => int(r.conv) },
              { key: 'r', label: 'Rate', align: 'right', render: (r) => pct(r.conv / r.n, 2) },
            ]}
          />
          <StatRow>
            <Stat label="A/B test says" value={one.ab.significant && one.ab.diff > 0 ? 'B wins' : one.ab.significant ? 'B loses' : 'no difference'} note={`lift ${signedPct(one.ab.relLift)}, p ${pValue(one.ab.pValue)}`} />
            <Stat label="SRM check says" value={one.srm.p < ALARM ? <Status level="bad">mismatch</Status> : <Status level="good">ok</Status>} note={`p ${pValue(one.srm.p)}`} />
            <Stat label={`Over ${leak.runs} reruns`} value={`${pct(leak.wins, 0)} “B wins”`} note={`SRM flagged ${pct(leak.flagged, 0)} of them`} />
          </StatRow>
        </div>
      }
    />
  )
}
