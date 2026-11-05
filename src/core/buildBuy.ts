/**
 * Build vs buy over 36 months. Both options deliver the same value per month once live.
 *   Build: a team builds for `buildMonths`, then `maintFte` engineers keep it running, plus infra.
 *   Buy: a short integration, then a licence that grows with usage and the vendor's yearly price rises.
 * Engineers cost `engineerMonth` fully loaded; `opportunity` is the value an engineer-month would
 * have produced elsewhere (the cost of what you didn't build).
 */
export const MONTHS = 36

export interface BuildBuyParams {
  valuePerMonth: number
  engineerMonth: number
  opportunity: number
  buildTeam: number
  buildMonths: number
  maintFte: number
  infraPerMonth: number
  licencePerMonth: number
  usageGrowth: number
  priceRise: number
  integrationMonths: number
}

export interface Month {
  month: number
  build: number
  buy: number
}

export interface BuildBuyResult {
  months: Month[]
  buildNet: number
  buyNet: number
  buildCost: number
  buyCost: number
  /** first month where build's cumulative net overtakes buy's (null if never within 36 months) */
  crossover: number | null
}

export function simulate(p: BuildBuyParams): BuildBuyResult {
  let b = 0
  let y = 0
  let buildCost = 0
  let buyCost = 0
  const months: Month[] = [{ month: 0, build: 0, buy: 0 }]
  let crossover: number | null = null
  for (let m = 0; m < MONTHS; m++) {
    const buildingFte = m < p.buildMonths ? p.buildTeam : p.maintFte
    const bc = buildingFte * (p.engineerMonth + p.opportunity) + p.infraPerMonth
    const bv = m >= p.buildMonths ? p.valuePerMonth : 0
    const integrating = m < p.integrationMonths
    const licence = integrating ? 0 : p.licencePerMonth * (1 + p.usageGrowth) ** (m / 12) * (1 + p.priceRise) ** Math.floor(m / 12)
    const yc = (integrating ? p.engineerMonth + p.opportunity : 0) + licence
    const yv = integrating ? 0 : p.valuePerMonth
    buildCost += bc
    buyCost += yc
    b += bv - bc
    y += yv - yc
    months.push({ month: m + 1, build: b, buy: y })
    if (crossover === null && m > 0 && b > y && months[m].build <= months[m].buy) crossover = m + 1
  }
  return { months, buildNet: b, buyNet: y, buildCost, buyCost, crossover }
}

export const DEFAULTS: BuildBuyParams = {
  valuePerMonth: 40_000,
  engineerMonth: 15_000,
  opportunity: 0,
  buildTeam: 3,
  buildMonths: 6,
  maintFte: 1,
  infraPerMonth: 2_000,
  licencePerMonth: 8_000,
  usageGrowth: 0.3,
  priceRise: 0.05,
  integrationMonths: 2,
}
