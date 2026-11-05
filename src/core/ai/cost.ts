/**
 * Cost and latency of LLM calls. Prices are per million tokens and illustrative (edit them in the
 * lab to match your provider); the shapes (input vs output, caching, batching, routing) are what
 * the module teaches.
 */
export interface Tier {
  name: string
  /** USD per million input / output tokens. */
  inPrice: number
  outPrice: number
  /** Seconds before the first token, plus input tokens processed per second (prefill). */
  ttftBase: number
  prefillPerSec: number
  /** Output tokens generated per second (decode). */
  outPerSec: number
}

export const TIERS: Record<'small' | 'medium' | 'large', Tier> = {
  small: { name: 'small', inPrice: 0.25, outPrice: 1.25, ttftBase: 0.2, prefillPerSec: 20_000, outPerSec: 150 },
  medium: { name: 'medium', inPrice: 3, outPrice: 15, ttftBase: 0.4, prefillPerSec: 8_000, outPerSec: 70 },
  large: { name: 'large', inPrice: 15, outPrice: 75, ttftBase: 0.8, prefillPerSec: 4_000, outPerSec: 35 },
}

/** Rough English conversion: ~1.3 tokens per word, ~4 characters per token. */
export const wordsToTokens = (words: number) => Math.round(words * 1.33)

export interface Workload {
  requestsPerDay: number
  inputTokens: number
  outputTokens: number
  /** Share of input tokens served from the prompt cache (e.g. a fixed system prompt). */
  cacheHit: number
  /** Cached input tokens cost this fraction of the normal input price. */
  cacheDiscount: number
  /** Batch / asynchronous processing discount (0.5 = half price), if used. */
  batch: boolean
  /** Share of requests routed to the small model instead of the chosen tier. */
  routedToSmall: number
}

export interface CostBreakdown {
  input: number
  cached: number
  output: number
  total: number
  perRequest: number
}

function costOne(t: Tier, w: Workload): Omit<CostBreakdown, 'total' | 'perRequest'> {
  const fresh = w.inputTokens * (1 - w.cacheHit)
  const cached = w.inputTokens * w.cacheHit
  const k = w.batch ? 0.5 : 1
  return {
    input: (fresh * t.inPrice * k) / 1e6,
    cached: (cached * t.inPrice * w.cacheDiscount * k) / 1e6,
    output: (w.outputTokens * t.outPrice * k) / 1e6,
  }
}

/** Monthly cost (30 days), split by input, cached input and output. */
export function monthlyCost(tier: Tier, w: Workload): CostBreakdown {
  const big = costOne(tier, w)
  const small = costOne(TIERS.small, w)
  const r = w.routedToSmall
  const per = {
    input: (1 - r) * big.input + r * small.input,
    cached: (1 - r) * big.cached + r * small.cached,
    output: (1 - r) * big.output + r * small.output,
  }
  const n = w.requestsPerDay * 30
  const perRequest = per.input + per.cached + per.output
  return { input: per.input * n, cached: per.cached * n, output: per.output * n, total: perRequest * n, perRequest }
}

/** Seconds to the first token, and to the full answer. Cached prefixes skip prefill. */
export function latency(t: Tier, inputTokens: number, outputTokens: number, cacheHit = 0) {
  const ttft = t.ttftBase + (inputTokens * (1 - cacheHit)) / t.prefillPerSec
  return { ttft, total: ttft + outputTokens / t.outPerSec }
}
