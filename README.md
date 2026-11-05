# data-concepts

An interactive site for learning data engineering, analytics, statistics and ML concepts through
visual explanations and sandboxes you can break on purpose. See [PLAN.md](PLAN.md).

![Peeking at an A/B test with no real effect: the more often you look, the more often you "win"](docs/peeking.gif)

## Modules

Each module has four parts: **Intuition** (plain language), **Play** (live controls and charts),
**Break it** (cause the classic failure yourself) and **Explain-back** (questions to answer in your own
words in `notes/`).

| Module | Route | Covers |
|---|---|---|
| A/B testing | `/ab-testing` | two-proportion z-test, p-values, power and sample size, peeking, winner's curse |
| Snapshots and incremental loads | `/snapshots` | full reload vs watermark loads, SCD2 history, hard deletes, late-arriving rows, idempotent retries, "what did we know at T" |

Every simulation is checked against theory in tests (e.g. with no effect, ~5% of simulated A/B tests are
significant; simulated power matches the formula within 2 points). The module 2 SQL runs on DuckDB-WASM
in the browser and on native DuckDB in the tests, and each Break-it scenario has a test asserting it
shows the failure it describes.

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

The app is static files. `deploy/Caddyfile` serves `dist/` with automatic HTTPS, single-page-app
fallback and long-lived caching for fingerprinted assets (basic auth is one uncomment away).

```sh
DEPLOY_HOST=my-vps ./deploy/deploy.sh   # test, build, rsync dist/ to /srv/data-concepts
```

## Layout

- `src/core/`: pure, unit-tested logic (stats, simulations, load jobs as SQL behind a `Db` interface)
- `src/modules/<slug>/`: one folder per concept module, built on `ModuleLayout`
- `src/components/`: shared UI (sliders, charts, stat tiles)
- `src/lib/`: browser-only plumbing (DuckDB-WASM)
- `tests/`: Vitest tests
- `notes/`: explain-back answers
- `deploy/`: Caddy config and deploy script
