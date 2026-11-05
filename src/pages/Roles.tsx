import * as Plot from '@observablehq/plot'
import { useCallback, useEffect } from 'react'
import { Link, useLocation } from 'react-router'
import PlotFigure from '../components/PlotFigure.tsx'
import type { VizTheme } from '../components/vizTheme.ts'
import { BRIEFS, DEMAND, SAMPLE } from '../data/market.ts'
import { int } from '../format.ts'
import { modules, ROLES, type Role } from '../modules/registry.ts'
import styles from './Pages.module.css'

const ORDER: Role[] = ['da', 'ae', 'de', 'ds', 'mle', 'ai', 'swe', 'mgr']

function Demand({ role }: { role: Role }) {
  const build = useCallback(
    (width: number, t: VizTheme): Plot.PlotOptions => {
      const data = Object.entries(DEMAND)
        .map(([skill, by]) => ({ skill, pct: by[role] / 100 }))
        .sort((a, b) => b.pct - a.pct)
        .slice(0, 14)
      return {
        width,
        height: 14 * 24 + 40,
        marginLeft: 120,
        x: { domain: [0, 1], tickFormat: '.0%', label: 'share of job posts mentioning it →', grid: true },
        y: { domain: data.map((d) => d.skill), label: null },
        marks: [
          Plot.barX(data, { y: 'skill', x: 'pct', fill: t.series1, rx: 3, tip: { format: { x: '.0%' } } }),
          Plot.text(data, { y: 'skill', x: 'pct', text: (d: { pct: number }) => `${Math.round(d.pct * 100)}%`, dx: 16, fill: t.ink }),
        ],
      }
    },
    [role],
  )
  return <PlotFigure build={build} label={`Most requested skills for ${ROLES[role]}`} />
}

export default function Roles() {
  const { hash } = useLocation()
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' })
  }, [hash])

  return (
    <div className={styles.page}>
      <h1>Roles and paths</h1>
      <p className="lede" style={{ maxWidth: '70ch' }}>
        What each data role is asked for, measured on job posts in the jobz database (snapshot 2026-11-05),
        the modules that cover it, and what’s still missing. Percentages are the share of posts in that
        title family mentioning the skill.
      </p>
      <nav className={styles.roleTabs}>
        {ORDER.map((r) => (
          <a key={r} href={`#${r}`}>
            {ROLES[r]}
          </a>
        ))}
      </nav>
      {ORDER.map((r) => {
        const b = BRIEFS[r]
        const mods = modules.filter((m) => m.roles.includes(r))
        return (
          <section key={r} id={r} className={styles.roleSection}>
            <h2>{ROLES[r]}</h2>
            <p className={styles.roleWhat}>{b.what}</p>
            <div className={styles.roleGrid}>
              <div>
                <h4>Most requested ({int(SAMPLE[r])} posts)</h4>
                <Demand role={r} />
              </div>
              <div>
                <h4>Modules for this role</h4>
                <ul className={styles.modList}>
                  {mods.map((m) => (
                    <li key={m.slug}>
                      <Link to={`/${m.slug}`}>{m.title}</Link>
                    </li>
                  ))}
                </ul>
                <h4>Planned for this role</h4>
                <ul className={styles.plannedList}>
                  {b.planned.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            </div>
            <div className={styles.ladder}>
              <div>
                <h4>IC path</h4>
                <ol>
                  {b.ic.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ol>
              </div>
              <div>
                <h4>Manager path</h4>
                <ol>
                  {b.manager.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ol>
              </div>
              <div>
                <h4>What interviews test</h4>
                <ul>
                  {b.interviews.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        )
      })}
    </div>
  )
}
