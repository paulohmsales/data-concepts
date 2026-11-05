# data-concepts

An interactive site for learning data engineering, analytics, statistics and ML concepts through
visual explanations and sandboxes you can break on purpose. See [PLAN.md](PLAN.md).

![Peeking at an A/B test with no real effect: the more often you look, the more often you "win"](docs/peeking.gif)

## Modules

Each module has four parts: **Intuition** (plain language), **Play** (live controls and charts),
**Break it** (cause the classic failure yourself) and **Explain-back** (optional questions with
reference answers).

| Area | Module | Route |
|---|---|---|
| Statistics | Central limit theorem | `/clt` |
| | Confidence intervals | `/confidence-intervals` |
| | The bootstrap | `/bootstrap` |
| | Simpson's paradox | `/simpsons-paradox` |
| | Regression to the mean | `/regression-to-the-mean` |
| Experimentation | A/B testing | `/ab-testing` |
| | Multiple comparisons | `/multiple-comparisons` |
| | Sample ratio mismatch | `/sample-ratio-mismatch` |
| | CUPED | `/cuped` |
| Analytics engineering | Grain and join fan-out | `/join-fanout` |
| | Window functions | `/window-functions` |
| | Surrogate keys | `/surrogate-keys` |
| Data engineering | Snapshots and incremental loads | `/snapshots` |
| | Retries and idempotency | `/retries-idempotency` |
| | Late data and watermarks | `/late-data` |
| | Partitioning | `/partitioning` |
| Data analysis | Cohorts and retention | `/cohorts` |
| | Funnels | `/funnels` |
| | Trend vs seasonality | `/trend-seasonality` |
| Machine learning | Bias vs variance | `/bias-variance` |
| | Train/test leakage | `/leakage` |
| | Gradient descent | `/gradient-descent` |
| | ROC curves and thresholds | `/roc-thresholds` |
| | Class imbalance | `/class-imbalance` |

Every simulation is checked against theory in tests (e.g. with no effect, ~5% of simulated A/B tests are
significant; bootstrap and interval coverage match their promise where they should and fail where they
should; AUC matches Φ(d/√2)). SQL modules run on DuckDB-WASM in the browser and on native DuckDB in the
tests, with the same queries; the window-function evaluator is checked against DuckDB for every
deterministic frame. Each Break-it failure has a test asserting it happens.

## Develop

```sh
npm install
npm run dev         # http://localhost:5173
npm test            # unit tests (Vitest)
npm run typecheck
npm run lint
npm run build       # static output in dist/
```

## Deploy

Live at <https://data-concepts.srv1294517.hstgr.cloud> (private: basic auth).

The app is static files. On the VPS, the Traefik instance already running in Docker Swarm terminates
HTTPS (Let's Encrypt) and checks basic auth. Behind it, a small Caddy container (`deploy/Dockerfile`,
`deploy/Caddyfile`) serves `dist/` with a single-page-app fallback and long-lived caching for
fingerprinted assets.

```sh
./deploy/deploy.sh   # test, build, ship to jobz-vps, build the image there, roll out the stack
```

The first run creates the login on the server (`/opt/data-concepts/.env`, a hash only) and prints the
password once. To change it, delete that file and redeploy.

## Layout

- `src/core/`: pure, unit-tested logic (stats, simulations, load jobs as SQL behind a `Db` interface)
- `src/modules/<slug>/`: one folder per concept module, built on `ModuleLayout`
- `src/components/`: shared UI (sliders, charts, stat tiles, SQL lab, explain-back)
- `src/lib/`: browser-only plumbing (DuckDB-WASM, one schema per module)
- `tests/`: Vitest tests
- `notes/`: optional explain-back answers
- `deploy/`: Caddy config and deploy script
