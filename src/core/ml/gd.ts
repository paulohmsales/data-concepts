/**
 * Gradient descent on two-parameter loss surfaces.
 * bowl: f(w) = ½[(w₁ − 3)² + κ (w₂ − 2)²]; κ is the condition number (think: one feature unscaled).
 * valleys: f(w) = (w₁² − 1)² + 0.3·w₁ + w₂²: two minima, the left one deeper.
 */
export type Surface = 'bowl' | 'valleys'

export interface SurfaceDef {
  f: (w: [number, number]) => number
  grad: (w: [number, number]) => [number, number]
  minimum: [number, number]
  domain: { x: [number, number]; y: [number, number] }
}

export function surface(kind: Surface, kappa: number): SurfaceDef {
  if (kind === 'bowl')
    return {
      f: ([a, b]) => 0.5 * ((a - 3) ** 2 + kappa * (b - 2) ** 2),
      grad: ([a, b]) => [a - 3, kappa * (b - 2)],
      minimum: [3, 2],
      domain: { x: [-3, 6], y: [-2, 5] },
    }
  // left minimum near w₁ ≈ −1.04
  return {
    f: ([a, b]) => (a * a - 1) ** 2 + 0.3 * a + b * b,
    grad: ([a, b]) => [4 * a * (a * a - 1) + 0.3, 2 * b],
    minimum: [-1.036, 0],
    domain: { x: [-2, 2], y: [-1.5, 1.5] },
  }
}

export interface GdResult {
  path: { step: number; w1: number; w2: number; loss: number }[]
  diverged: boolean
  /** First step where the loss is within 1e-6 of the minimum's (or NaN). */
  convergedAt: number
}

/** Plain gradient descent with optional heavy-ball momentum β. */
export function descend(s: SurfaceDef, start: [number, number], lr: number, steps: number, momentum = 0): GdResult {
  let w: [number, number] = [...start]
  let v: [number, number] = [0, 0]
  const fMin = s.f(s.minimum)
  const path = [{ step: 0, w1: w[0], w2: w[1], loss: s.f(w) }]
  let diverged = false
  let convergedAt = NaN
  for (let t = 1; t <= steps; t++) {
    const g = s.grad(w)
    v = [momentum * v[0] - lr * g[0], momentum * v[1] - lr * g[1]]
    w = [w[0] + v[0], w[1] + v[1]]
    const loss = s.f(w)
    path.push({ step: t, w1: w[0], w2: w[1], loss })
    if (!Number.isFinite(loss) || Math.abs(w[0]) > 1e6 || Math.abs(w[1]) > 1e6) {
      diverged = true
      break
    }
    if (Number.isNaN(convergedAt) && loss - fMin < 1e-6) convergedAt = t
  }
  return { path, diverged, convergedAt }
}

/** Plain GD on the bowl converges iff lr < 2 / (largest curvature). */
export const maxStableLr = (kappa: number) => 2 / Math.max(1, kappa)
