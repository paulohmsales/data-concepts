# data-concepts: initial plan

Drafted 2026-11-04. Nothing below is final until marked ✅ in the decision log.

## 1. Goal

An interactive site for learning concepts in data engineering, analytics engineering, data analysis,
statistics and machine learning, through visual explanations and sandboxes you can break on purpose.

The goal is understanding: being able to explain a concept cold, without notes. Shipping features is secondary.

- **Repo:** public on GitHub.
- **App:** self-hosted on the VPS, private behind basic auth: <https://data-concepts.srv1294517.hstgr.cloud>.

## 2. Principles

1. **Every module uses the same four parts:**
   1. **Intuition:** plain language, no formulas.
   2. **Play:** sliders and live charts.
   3. **Break it:** a sandbox where you cause the classic failure yourself.
   4. **Explain-back:** 3–5 questions answered in your own words, committed in the module folder.
2. **Small, tested core.** Each module's math or simulation is a small pure function (20–40 lines) with
   unit tests. Claude writes the core, UI and chart code and explains them; you review and do the
   explain-back (see decision log, 2026-11-04).
3. **One polished module before the next.** Module 1 sets the template every later module copies.
4. **Check the code against theory.** Every simulation has a test that compares it to a known result. For
   example, under no real effect the false-positive rate must come out near alpha.

## 3. Architecture (proposed)

```
browser
 ├─ UI (components, sliders, charts)
 ├─ core/  ← pure TS functions you write: stats, simulations   (unit-tested)
 └─ DuckDB-WASM  ← in-browser SQL for the DE/AE modules        (module 2+)

VPS
 └─ static files served by a web server (optionally behind basic auth)
```

Recommendation: start **fully client-side** with no backend.
- Simulations of 1,000 A/B tests run fast in the browser.
- DuckDB-WASM gives real SQL (snapshots, SCD2, joins) without running a database server.
- Hosting is a folder of static files, and making the app private takes one config line.
- A backend (e.g. a Python API for heavier ML training, or a real Postgres) can be added later as its own
  module, if a concept needs it. It's not a starting requirement.

## 4. Open decisions

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | Framework | Vite + React · SvelteKit · Observable Framework · Astro | **Vite + React**: most common, most learning material, and easy to make each module its own route |
| D2 | Language | TypeScript · JavaScript | **TypeScript**: types catch slider/units mix-ups in the math |
| D3 | Charts | D3 · Observable Plot · Recharts · Plotly | **Observable Plot** for most charts (concise, made for exploration), plus D3 for custom animations |
| D4 | Stats math | Hand-written · jStat / simple-statistics | **Hand-written** for anything the module teaches (that's the point); a library only for the plumbing, like the normal CDF |
| D5 | Styling | Plain CSS · Tailwind · a component lib | Plain CSS modules: less to learn that isn't data |
| D6 | Tests | Vitest · Jest | **Vitest** (native to Vite) |
| D7 | Package manager | npm · pnpm | npm (fewer surprises) |
| D8 | Deploy | nginx · Caddy, with or without Docker | Caddy (automatic HTTPS) serving `dist/`; Docker optional |
| D9 | App visibility | Public · private (basic auth) | Decide before the first deploy; it doesn't affect anything until then |
| D10 | Random seed | Seeded PRNG · `Math.random` | **Seeded**: the same seed reproduces the same simulation, so a result can be shared and re-checked |

## 5. Module 1: A/B testing (the polished one)

**Concepts:** the two-proportion test, p-value, alpha, power, sample size, minimum detectable effect, peeking.

**Controls:** baseline conversion rate, true relative lift, n per arm, alpha, number of simulated tests,
peek on/off and peek frequency, seed.

**Views:**
1. **Single test:** the two observed rates, their difference, the confidence interval and the p-value.
2. **Many tests:** histogram of p-values over N simulated tests, plus the share that came out significant.
3. **Power curve:** power against n for the current lift, with the current n marked.
4. **Peeking:** the running p-value of one test plotted over time, with the 0.05 line. Shows how often it
   crosses at least once, compared with the honest end-of-test rate.
5. **Winner's curse:** the average estimated lift among significant tests compared with the true lift, at low power.

**Core functions:**
- `normalCdf(z)` (or take this one from a library, per D4)
- `twoProportionZTest(convA, nA, convB, nB) → { diff, se, z, pValue, ci }`
- `simulateTest(params, rng) → result`
- `simulateMany(params, k, rng) → results[]`
- `analyticPower(params) → number`, used to check the simulation against the formula
- `simulatePeeking(params, rng) → pValue[]`

**Acceptance checks (tests):**
- With lift = 0 and alpha = 0.05, the false-positive share over 10,000 sims falls within 0.05 ± 0.01.
- Simulated power is within ±2 points of `analyticPower`.
- With daily peeking over 20 looks and no true effect, the false-positive share is clearly above 0.05.

**Explain-back questions (draft):**
1. What exactly does a p-value of 0.03 mean, and what does it not mean?
2. Why does doubling n not halve the confidence interval?
3. Why does peeking inflate false positives when each single look uses alpha = 0.05?
4. At 30% power, why do the significant results overstate the true lift?
5. Your PM wants to detect a 1% relative lift on a 2% baseline. What do you tell them, and how did you get it?

## 6. Module 2: snapshots and incremental loads

Closes the Toptal gap: what happens when the source changes between retries, incremental loads instead
of full reloads, and data freshness.

**Sandbox (DuckDB-WASM):** a small "source" table you can edit in the UI (update, delete and insert rows),
plus buttons to run:
- a naive full reload,
- an incremental load by watermark (`updated_at > last_max`),
- a snapshot (SCD2) job.

**Views:** the target table after each run, the SCD2 timeline per key (valid_from / valid_to bars), and a
"what the dashboard showed at time T" query.

**Break it:** a late-arriving row older than the watermark, a hard delete in the source, a retry after the
source changed mid-run, and running the same job twice (idempotency).

**Spec (as built, 2026-11-04):**
- **Clock:** logical integer ticks. Every action takes one tick; an incremental job takes two (extract
  at t, finish at t+1), so "the source changed mid-run" has somewhere to happen.
- **Tables:** `source` (id, name, plan, updated_at), `source_log` (every change and when it became
  visible: the ground truth for "what was true at T"), `target_full`, `target_incr` (no keys, so a buggy
  job can duplicate), `snap_customers` (SCD2: valid_from, valid_to), `etl_state` (watermark, last run).
- **Jobs** (`src/core/loads.ts`, SQL behind a small `Db` interface):
  - full reload: delete and insert in one transaction;
  - incremental: write = merge (delete the batch's keys, then insert) or append; next watermark =
    max(updated_at) loaded or job end time; optional crash before saving the watermark; optional source
    change mid-run;
  - SCD2 snapshot: check strategy on (name, plan), hard deletes close the current version.
- **Checks:** each target is compared key by key with the source: ok, stale, missing, ghost, duplicate.
- **Break it:** eight scripted scenarios (hard delete, late row, crash + append retry, crash + merge
  retry, mid-run change with each watermark rule, two changes between snapshots, dashboard at T). Each
  has a test asserting it shows the failure it describes.
- **Tests:** the same SQL runs on native DuckDB 1.4 (`@duckdb/node-api`) in Vitest and on DuckDB-WASM
  in the browser.

## 7. Milestones

| # | Milestone | Done when | Status |
|---|---|---|---|
| M0 | Decisions D1–D8, D10 made | Decision log filled in | ✅ |
| M1 | Scaffold | App runs locally, one empty module route, tests run, CI runs tests on push | ✅ |
| M2 | A/B core | Core functions written, acceptance tests pass | ✅ |
| M3 | A/B UI | Views 1–5 built, all four template parts present | ✅ |
| M4 | A/B polish | Explain-back answered, README with GIF, deployed to VPS | README + GIF ✅; deployed ✅; explain-back: later (optional) |
| M5 | Module 2 | Spec, then the same M2–M4 cycle | Spec, core, UI ✅; deployed ✅; explain-back: later (optional) |

## 8. Backlog of later modules

- **Statistics:** central limit theorem · confidence intervals (100 intervals, some miss) · bootstrap ·
  Simpson's paradox · regression to the mean
- **Experimentation:** multiple comparisons · sample ratio mismatch · CUPED
- **Analytics engineering:** grain and join fan-out · window functions step by step · surrogate keys
- **Data engineering:** idempotency and retries · late data and watermarks · partitioning
- **Data analysis:** cohorts and retention · funnels · trend vs seasonality
- **Machine learning:** bias vs variance · train/test leakage · gradient descent · thresholds and ROC ·
  class imbalance

## 9. Proposed repo layout (after D1)

```
data-concepts/
├─ PLAN.md
├─ README.md
├─ src/
│  ├─ core/              # pure functions, hand-written, unit-tested
│  │  ├─ random.ts       # seeded PRNG
│  │  └─ abtest.ts
│  ├─ modules/
│  │  └─ ab-testing/     # UI for the module: Intuition, Play, BreakIt, ExplainBack
│  └─ components/        # shared Slider, ChartFrame, ModuleLayout
├─ notes/
│  └─ ab-testing.md      # your explain-back answers
└─ tests/
```

## 10. Decision log

| # | Decision | Choice | Why | Date |
|---|---|---|---|---|
| – | Project type | JS site, self-hosted on VPS, public repo | Best visuals; VPS already available | 2026-11-04 ✅ |
| – | First modules | A/B testing, then snapshots/incremental | Visual quick win, then the Toptal gap | 2026-11-04 ✅ |
| – | v1 scope | One polished module | Sets the template | 2026-11-04 ✅ |
| – | Name | data-concepts | | 2026-11-04 ✅ |
| D1 | Framework | Vite + React | Most common, most learning material, a route per module | 2026-11-04 ✅ |
| D2 | Language | TypeScript | Types catch slider/units mix-ups in the math | 2026-11-04 ✅ |
| D3 | Charts | Observable Plot, plus D3 for custom animations | Concise, made for exploration | 2026-11-04 ✅ |
| D4 | Stats math | Hand-written for taught concepts; simple-statistics for normal CDF/inverse | Effort goes into the test logic, not numerical plumbing | 2026-11-04 ✅ |
| D5 | Styling | Plain CSS modules | Less to learn that isn't data | 2026-11-04 ✅ |
| D6 | Tests | Vitest | Native to Vite | 2026-11-04 ✅ |
| D7 | Package manager | npm | Fewer surprises | 2026-11-04 ✅ |
| D8 | Deploy | Caddy container serving `dist/`, behind the VPS's existing Traefik (Docker Swarm) | Traefik already owns 80/443 and does HTTPS; Caddy just serves files | 2026-11-05 ✅ |
| D9 | App visibility | Private: Traefik basic auth | Your call | 2026-11-05 ✅ |
| D10 | Random seed | Seeded PRNG | Same seed reproduces the same simulation | 2026-11-04 ✅ |
| – | CI | GitHub Actions: typecheck + tests on push/PR | Repo is on GitHub | 2026-11-04 ✅ |
| – | Who writes the core | Claude writes all code; you review and answer the explain-back | Your call: focus on understanding, not implementation | 2026-11-04 ✅ |
| – | Module 2 engine | DuckDB-WASM in the browser, native DuckDB 1.4 in tests, same SQL | Real SQL, tested without a browser | 2026-11-04 ✅ |
| – | Code splitting | Each module is a lazy route; DuckDB loads only on module 2 | Home and A/B stay ~85 kB gzipped; DuckDB WASM is ~8 MB | 2026-11-04 ✅ |
