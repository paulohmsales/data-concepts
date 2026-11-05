import * as Plot from '@observablehq/plot'
import { useCallback, useMemo, useState } from 'react'
import { Choice, ResetButton, SeedControl } from '../../components/Controls.tsx'
import ModuleLayout from '../../components/ModuleLayout.tsx'
import PlotFigure from '../../components/PlotFigure.tsx'
import Slider from '../../components/Slider.tsx'
import { Stat, StatRow } from '../../components/Stat.tsx'
import type { VizTheme } from '../../components/vizTheme.ts'
import { dailyCounts, detect, INCIDENTS, score, type Check, type Day, type Detector } from '../../core/quality.ts'
import { mulberry32 } from '../../core/random.ts'
import { int } from '../../format.ts'

interface Controls {
  detector: Detector
  floor: number
  k: number
  tolerance: number
  seed: number
}
const DEFAULTS: Controls = { detector: 'static', floor: 7000, k: 3, tolerance: 0.1, seed: 1 }

function chart(days: Day[], checks: Check[], width: number, t: VizTheme): Plot.PlotOptions {
  const rows = days.map((d, i) => ({ ...d, ...checks[i] }))
  const band = rows.filter((r) => r.expectedLow != null)
  const alerts = rows.filter((r) => r.alert)
  const incidents = rows.filter((r) => r.incident)
  return {
    width,
    height: 300,
    x: { label: 'day →' },
    y: { label: '↑ rows loaded', grid: true, domain: [0, 24_000] },
    marks: [
      Plot.areaY(band, { x: 'day', y1: (r) => Math.max(0, r.expectedLow), y2: (r) => Math.min(24_000, r.expectedHigh), fill: t.series1, fillOpacity: 0.15, curve: 'step' }),
      Plot.ruleX([28], { stroke: t.axis, strokeDasharray: '4 3' }),
      Plot.text([28], { x: (d: number) => d, y: 1200, dx: 4, textAnchor: 'start', text: () => 'monitoring starts (needs 28 days of history) →', fill: t.muted }),
      Plot.lineY(rows, { x: 'day', y: 'count', stroke: t.inkSecondary, strokeWidth: 1.5 }),
      Plot.dot(rows, { x: 'day', y: 'count', r: 2.5, fill: t.inkSecondary }),
      Plot.dot(incidents, { x: 'day', y: 'count', r: 9, stroke: t.series2, strokeWidth: 2 }),
      ...[
        { rows: incidents.filter((r) => r.count > 15_000), dy: -18 },
        { rows: incidents.filter((r) => r.count <= 15_000), dy: 22 },
      ].map(({ rows: data, dy }) =>
        Plot.text(data, { x: 'day', y: 'count', text: 'short', dy, fill: t.ink, stroke: t.surface, strokeWidth: 4, paintOrder: 'stroke', fontSize: 11, fontWeight: 600 }),
      ),
      Plot.dot(alerts, { x: 'day', y: 'count', symbol: 'times', r: 5, stroke: '#d03b3b', strokeWidth: 2.5 }),
      Plot.tip(rows, Plot.pointerX({ x: 'day', y: 'count', title: (r) => `day ${r.day} (${r.weekday})\n${int(r.count)} rows${r.alert ? '\nALERT' : ''}${r.incident ? `\nincident: ${r.incident}` : ''}` })),
    ],
  }
}

export default function DataQuality() {
  const [c, setC] = useState(DEFAULTS)
  const set = <K extends keyof Controls>(k: K) => (v: Controls[K]) => setC((s) => ({ ...s, [k]: v }))
  const days = useMemo(() => dailyCounts(mulberry32(c.seed)), [c.seed])
  const checks = useMemo(() => detect(days, c.detector, c), [days, c])
  const sc = score(days, checks)
  const build = useCallback((w: number, t: VizTheme) => chart(days, checks, w, t), [days, checks])

  const panel = (
    <>
      <Choice
        label="Volume check"
        value={c.detector}
        onChange={set('detector')}
        options={[
          { value: 'static', label: 'Fixed threshold' },
          { value: 'zscore', label: 'z-score, last 28 days' },
          { value: 'seasonal', label: 'Same weekday, last 4 weeks' },
        ]}
      />
      {c.detector === 'static' && <Slider label="Alert below" value={c.floor} onChange={set('floor')} min={2000} max={9000} step={250} format={(v) => `${int(v)} rows`} />}
      {c.detector === 'zscore' && <Slider label="Alert when |z| exceeds" value={c.k} onChange={set('k')} min={1} max={4} step={0.1} format={(v) => v.toFixed(1)} />}
      {c.detector === 'seasonal' && (
        <Slider label="Alert when off by more than" value={c.tolerance} onChange={set('tolerance')} min={0.02} max={0.3} step={0.01} format={(v) => `${Math.round(v * 100)}%`} />
      )}
      <SeedControl seed={c.seed} onChange={set('seed')} />
      <ResetButton onClick={() => setC(DEFAULTS)} />
    </>
  )

  return (
    <ModuleLayout
      controls={panel}
      onPreset={(p) => setC({ ...DEFAULTS, ...(p as Partial<Controls>) })}
      play={
        <>
          <StatRow>
            <Stat label="Incidents caught" value={`${sc.caught} of ${INCIDENTS.length}`} note={sc.missed.length ? `missed: ${sc.missed.join('; ')}` : 'none missed'} />
            <Stat label="False alarms" value={String(sc.falseAlarms)} note="in 62 monitored days" />
          </StatRow>
          <PlotFigure build={build} label="Daily row counts, the expected band, incidents (circled) and alerts (×)" />
        </>
      }
    />
  )
}
