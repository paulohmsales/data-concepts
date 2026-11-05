import * as Plot from '@observablehq/plot'
import { useCallback, useState } from 'react'
import { Choice, ResetButton } from '../../components/Controls.tsx'
import DataTable from '../../components/DataTable.tsx'
import ModuleLayout from '../../components/ModuleLayout.tsx'
import PlotFigure from '../../components/PlotFigure.tsx'
import Slider from '../../components/Slider.tsx'
import { Stat, StatRow } from '../../components/Stat.tsx'
import Status from '../../components/Status.tsx'
import type { VizTheme } from '../../components/vizTheme.ts'
import { DEFAULT_TABLE as T, partitions, QUERIES, queryCost, workerLoads, type QueryName, type Scheme } from '../../core/partitioning.ts'
import { int, pct } from '../../format.ts'

interface Controls {
  scheme: Scheme
  query: QueryName
  workers: number
  hotShare: number
  salt: number
}

const DEFAULTS: Controls = { scheme: 'day', query: 'last7', workers: 16, hotShare: 0.3, salt: 1 }
const SCHEMES: { value: Scheme; label: string; sql: string }[] = [
  { value: 'none', label: 'not partitioned', sql: '' },
  { value: 'day', label: 'by day', sql: 'PARTITIONED BY (event_date)' },
  { value: 'month', label: 'by month', sql: 'PARTITIONED BY (month(event_date))' },
  { value: 'user', label: 'by user_id', sql: 'PARTITIONED BY (user_id)' },
]
const SCANNED = 'scanned'
const PRUNED = 'skipped (pruned)'
const gb = (b: number) => (b >= 2 ** 30 ? `${(b / 2 ** 30).toFixed(1)} GB` : `${(b / 2 ** 20).toFixed(1)} MB`)
const secs = (s: number) => (s >= 120 ? `${(s / 60).toFixed(1)} min` : `${s.toFixed(1)} s`)
const MAX_CELLS = 400

export default function Partitioning() {
  const [c, setC] = useState(DEFAULTS)
  const set = <K extends keyof Controls>(k: K) => (v: Controls[K]) => setC((s) => ({ ...s, [k]: v }))
  const cost = queryCost(T, c.scheme, c.query)
  const all = SCHEMES.map((s) => ({ ...s, cost: queryCost(T, s.value, c.query) }))
  const loads = workerLoads(c.workers, c.hotShare, c.salt)
  const slowest = Math.max(...loads) * c.workers

  const buildGrid = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => {
      const parts = partitions(T, c.scheme)
      const q = QUERIES[c.query]
      // group very many partitions into at most MAX_CELLS cells so the grid stays drawable
      const per = Math.ceil(parts.length / MAX_CELLS)
      const cells = Array.from({ length: Math.ceil(parts.length / per) }, (_, i) => {
        const group = parts.slice(i * per, (i + 1) * per)
        const scanned = group.some((p) => q.prune(p))
        return { i, label: per > 1 ? `${group[0].key} … (${group.length} partitions)` : group[0].key, kind: scanned ? SCANNED : PRUNED, files: group.reduce((s, p) => s + p.files, 0) }
      })
      const cols = c.scheme === 'day' ? 30 : c.scheme === 'user' ? 40 : cells.length
      return {
        width,
        height: Math.max(90, Math.ceil(cells.length / cols) * Math.min(28, width / cols) + 40),
        marginLeft: 10,
        marginBottom: 10,
        x: { axis: null },
        y: { axis: null },
        color: { domain: [SCANNED, PRUNED], range: [t.series2, t.neutral], legend: true },
        marks: [
          Plot.cell(cells, { x: (d: { i: number }) => d.i % cols, y: (d: { i: number }) => Math.floor(d.i / cols), fill: 'kind', inset: 1, rx: 2, tip: { channels: { partition: 'label', files: 'files' }, format: { x: false, y: false } } }),
          ...(cells.length <= 3 ? [Plot.text(cells, { x: (d: { i: number }) => d.i % cols, y: () => 0, text: 'label', fill: t.ink })] : []),
        ],
      }
    },
    [c.scheme, c.query],
  )

  const buildSkew = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => {
      const data = loads.map((l, w) => ({ worker: w + 1, load: l }))
      return {
        width,
        height: 220,
        x: { label: 'worker →', tickFormat: 'd', ticks: data.filter((d) => d.worker % 2 === 1).map((d) => d.worker) },
        y: { label: '↑ share of all rows', tickFormat: '.0%', grid: true },
        marks: [
          Plot.barY(data, { x: 'worker', y: 'load', fill: (d: { load: number }) => (d.load > 1.5 / c.workers ? t.series2 : t.series1), rx: 3, tip: { format: { y: '.1%' } } }),
          Plot.ruleY([1 / c.workers], { stroke: t.ink, strokeDasharray: '4 3' }),
          Plot.text([1 / c.workers], { y: (d: number) => d, frameAnchor: 'right', dy: -8, text: () => 'fair share', fill: t.inkSecondary }),
        ],
      }
    },
    [loads, c.workers],
  )

  const panel = (
    <>
      <Choice label="Table layout" value={c.scheme} onChange={set('scheme')} options={SCHEMES} />
      <Choice label="Query" value={c.query} onChange={set('query')} options={(Object.keys(QUERIES) as QueryName[]).map((q) => ({ value: q, label: QUERIES[q].label }))} />
      <strong>Skew (Break it)</strong>
      <Slider label="Workers" value={c.workers} onChange={set('workers')} min={4} max={32} step={1} format={String} />
      <Slider label="Rows from the biggest customer" value={c.hotShare} onChange={set('hotShare')} min={0} max={0.6} step={0.01} format={(v) => pct(v, 0)} />
      <Slider label="Salt buckets for that key" value={c.salt} onChange={set('salt')} min={1} max={c.workers} step={1} format={String} />
      <ResetButton onClick={() => setC(DEFAULTS)} />
    </>
  )

  return (
    <ModuleLayout
      onPreset={(p) => setC({ ...DEFAULTS, ...(p as Partial<Controls>) })}
      controls={panel}
      play={
        <>
          <p className="lede">
            {gb(T.days * T.rowsPerDay * T.rowBytes)} of events: {T.days} days × {int(T.rowsPerDay)} rows, {int(T.users)} users.{' '}
            <code>{SCHEMES.find((s) => s.value === c.scheme)!.sql || 'no partitioning'}</code>, query <code>{QUERIES[c.query].sql}</code>.
          </p>
          <PlotFigure build={buildGrid} label="Partitions scanned and skipped by the query" />
          <StatRow>
            <Stat label="Partitions read" value={`${int(cost.partitionsScanned)} / ${int(cost.partitionsTotal)}`} />
            <Stat label="Files opened" value={int(cost.filesScanned)} note={`${FILE_NOTE}`} />
            <Stat label="Data scanned" value={gb(cost.bytesScanned)} note={`needed: ${gb(cost.bytesNeeded)}`} />
            <Stat label="Estimated time" value={secs(cost.seconds)} />
          </StatRow>
          <h3>Same query, every layout</h3>
          <DataTable
            rows={all}
            rowKey={(r) => r.value}
            rowClass={(r) => (r.value === c.scheme ? 'hl' : undefined)}
            columns={[
              { key: 'l', label: 'Layout', render: (r) => r.label },
              { key: 'p', label: 'Partitions read', align: 'right', render: (r) => `${int(r.cost.partitionsScanned)} / ${int(r.cost.partitionsTotal)}` },
              { key: 'f', label: 'Files', align: 'right', render: (r) => int(r.cost.filesScanned) },
              { key: 'b', label: 'Scanned', align: 'right', render: (r) => gb(r.cost.bytesScanned) },
              { key: 'w', label: 'Wasted', align: 'right', render: (r) => pct(1 - r.cost.bytesNeeded / r.cost.bytesScanned, 0) },
              { key: 's', label: 'Time', align: 'right', render: (r) => secs(r.cost.seconds) },
            ]}
          />
        </>
      }
      breakIt={
        <>
          <h3>Three ways to lose the benefit</h3>
          <ul>
            <li>
              <b>Hiding the partition column in a function.</b> <code>strftime(event_date, '%Y-%m') = '2026-03'</code>{' '}
              asks for the same rows as a BETWEEN, but many engines can’t translate it back to partitions,
              so they read all 90 days: {secs(queryCost(T, 'day', 'marchFn').seconds)} instead of{' '}
              {secs(queryCost(T, 'day', 'march').seconds)}. Write filters as plain ranges on the partition column.
            </li>
            <li>
              <b>Too many partitions.</b> By user_id there are {int(T.users)} folders of{' '}
              {gb((T.days * T.rowsPerDay * T.rowBytes) / T.users)} each. A full scan opens {int(T.users)} files and spends{' '}
              {secs(T.users * 0.02)} just on per-file overhead. Small files also slow writes and metadata. Partition by
              something coarse, and cluster or sort within files for the rest.
            </li>
          </ul>
          <h3>Skew: one key, one overloaded worker</h3>
          <p className="lede">
            Joins and aggregations hash rows to workers by key. If one customer owns {pct(c.hotShare, 0)} of the rows,
            the worker that gets them does {pct(Math.max(...loads), 0)} of all the work while the rest wait.
          </p>
          <PlotFigure build={buildSkew} label="Share of rows per worker" />
          <StatRow>
            <Stat label="Slowest worker vs fair share" value={`${slowest.toFixed(1)}×`} note={slowest > 1.5 ? <Status level="bad">the job waits for it</Status> : <Status level="good">balanced</Status>} />
            <Stat label="Fix" value="salting" note="split the hot key into k sub-keys (key || '-' || random(k)), aggregate twice" />
          </StatRow>
        </>
      }
    />
  )
}

const FILE_NOTE = '20 ms overhead each'
