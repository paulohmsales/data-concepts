import { Suspense, useState } from 'react'
import type { Block } from '../../lib/content.ts'
import { visuals } from '../../visuals/index.ts'
import { Callout, Formula, Related, Worked } from '../content.tsx'
import DataTable from '../DataTable.tsx'
import Markdown from '../Markdown.tsx'
import styles from './Blocks.module.css'

/** Renders a list of content blocks from the API. */
export default function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((b, i) => (
        <BlockView key={i} block={b} />
      ))}
    </>
  )
}

function BlockView({ block: b }: { block: Block }) {
  switch (b.type) {
    case 'markdown':
      return <Markdown md={b.md} />
    case 'heading':
      return b.level === 4 ? <h4>{b.text}</h4> : <h3>{b.text}</h3>
    case 'formula':
      return <Formula caption={b.caption}>{b.text}</Formula>
    case 'callout':
      return (
        <Callout kind={b.kind} title={b.title ?? undefined}>
          <Markdown md={b.md} />
        </Callout>
      )
    case 'steps':
      return (
        <ol className={styles.steps}>
          {b.items.map((it, i) => (
            <li key={it.title}>
              <span className={styles.num}>{i + 1}</span>
              <div>
                <strong>{it.title}</strong>
                <Markdown md={it.md} />
              </div>
            </li>
          ))}
        </ol>
      )
    case 'worked':
      return (
        <Worked title={b.title}>
          <Markdown md={b.md} />
        </Worked>
      )
    case 'code':
      return (
        <figure className={styles.code}>
          <div className={styles.lang}>{b.lang}</div>
          <pre>
            <code>{b.code.trimEnd()}</code>
          </pre>
          {b.caption && <figcaption>{b.caption}</figcaption>}
        </figure>
      )
    case 'table':
      return (
        <DataTable
          wrap
          rows={b.rows}
          rowKey={(_, i) => i}
          caption={b.caption ?? undefined}
          columns={b.columns.map((c) => ({ key: c.key, label: c.label, render: (r: Record<string, string>) => <Markdown md={r[c.key] ?? ''} inline /> }))}
        />
      )
    case 'visual':
      return <VisualBlock k={b.key} props={b.props} caption={b.caption} />
    case 'stepper':
      return <Stepper block={b} />
    case 'related':
      return <Related slugs={b.slugs} />
  }
}

function Missing({ k }: { k: string }) {
  return <p className={styles.missing}>Visual “{k}” is not registered.</p>
}

function VisualBlock({ k, props, caption, state }: { k: string; props: Record<string, unknown>; caption?: string | null; state?: Record<string, unknown> }) {
  const V = visuals[k]
  return (
    <figure className={styles.visual}>
      {V ? (
        <Suspense fallback={<div className={styles.loading}>Loading figure…</div>}>
          <V props={props} state={state} />
        </Suspense>
      ) : (
        <Missing k={k} />
      )}
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  )
}

function Stepper({ block }: { block: Extract<Block, { type: 'stepper' }> }) {
  const [i, setI] = useState(0)
  const step = block.steps[i]
  return (
    <div className={styles.stepper}>
      <VisualBlock k={block.key} props={block.props} state={step.state} caption={block.caption} />
      <div className={styles.stepNav}>
        <button type="button" onClick={() => setI((x) => Math.max(0, x - 1))} disabled={i === 0} aria-label="Previous step">
          ←
        </button>
        <div className={styles.dots} role="tablist">
          {block.steps.map((s, j) => (
            <button key={s.title} type="button" role="tab" aria-selected={i === j} className={i === j ? styles.dotOn : styles.dot} onClick={() => setI(j)} aria-label={s.title} />
          ))}
        </div>
        <button type="button" onClick={() => setI((x) => Math.min(block.steps.length - 1, x + 1))} disabled={i === block.steps.length - 1} aria-label="Next step">
          →
        </button>
        <span className={styles.stepCount}>
          Step {i + 1} of {block.steps.length}
        </span>
      </div>
      <div className={styles.stepText}>
        <strong>{step.title}</strong>
        <Markdown md={step.md} />
      </div>
    </div>
  )
}
