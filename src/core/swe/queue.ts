import type { Rng } from '../random.ts'

/**
 * A queue in front of c identical servers: Poisson arrivals (rate λ), service times with mean 1/μ
 * (exponential, or constant), first come first served, optionally a bounded waiting room. Simulated
 * event by event; the theory below is what the tests check it against.
 */
export interface QueueParams {
  /** Arrivals per second. */
  lambda: number
  /** Services per second per server. */
  mu: number
  servers: number
  /** Service time distribution. */
  service: 'exponential' | 'constant'
  /** Max requests waiting (not in service); Infinity = unbounded. */
  capacity: number
  /** Number of arrivals to simulate. */
  n: number
}

export interface QueueStats {
  meanWait: number
  meanTime: number
  p95Time: number
  rejected: number
  /** Time-average number in the system (for Little's law). */
  meanInSystem: number
  utilization: number
  samples: { t: number; inSystem: number }[]
}

const exp = (rate: number, rng: Rng) => -Math.log(1 - rng()) / rate

export function simulateQueue(p: QueueParams, rng: Rng): QueueStats {
  const free = new Array<number>(p.servers).fill(0) // time each server becomes free
  let t = 0
  const times: number[] = []
  const waits: number[] = []
  let rejected = 0
  let busyTime = 0
  // track departures to know how many are in the system when someone arrives
  const departures: number[] = [] // min-heap would be faster; arrays are fine at this size
  let area = 0
  let lastT = 0
  const samples: { t: number; inSystem: number }[] = []
  for (let i = 0; i < p.n; i++) {
    t += exp(p.lambda, rng)
    // remove departures that happened before t, accumulating the area under N(t)
    departures.sort((a, b) => a - b)
    while (departures.length && departures[0] <= t) {
      const d = departures.shift()!
      area += (departures.length + 1) * (d - lastT)
      lastT = d
    }
    area += departures.length * (t - lastT)
    lastT = t
    const inSystem = departures.length
    if (i % Math.max(1, Math.floor(p.n / 400)) === 0) samples.push({ t, inSystem })
    const waiting = Math.max(0, inSystem - p.servers)
    if (waiting >= p.capacity) {
      rejected++
      continue
    }
    // earliest free server
    let k = 0
    for (let j = 1; j < p.servers; j++) if (free[j] < free[k]) k = j
    const start = Math.max(t, free[k])
    const s = p.service === 'constant' ? 1 / p.mu : exp(p.mu, rng)
    free[k] = start + s
    busyTime += s
    waits.push(start - t)
    times.push(start + s - t)
    departures.push(start + s)
  }
  const sorted = [...times].sort((a, b) => a - b)
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
  return {
    meanWait: mean(waits),
    meanTime: mean(times),
    p95Time: sorted[Math.floor(0.95 * (sorted.length - 1))] ?? 0,
    rejected: rejected / p.n,
    meanInSystem: area / t,
    utilization: busyTime / (t * p.servers),
    samples,
  }
}

/** M/M/1 theory: time in system W = 1 / (μ − λ), waiting Wq = ρ / (μ − λ). */
export const mm1 = (lambda: number, mu: number) => {
  const rho = lambda / mu
  return { rho, W: 1 / (mu - lambda), Wq: rho / (mu - lambda), L: rho / (1 - rho) }
}

/** M/D/1 (constant service): waiting time is half of M/M/1’s (Pollaczek–Khinchine). */
export const md1Wq = (lambda: number, mu: number) => mm1(lambda, mu).Wq / 2
