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
| M6 | Backlog (§8) | Every backlog module built with the four parts, tested, deployed | ✅ 22 modules (2026-11-05) |

## 8. Backlog of later modules

All built (M6). Data engineering “idempotency and retries” became *Retries and idempotency* (delivery
semantics); retries of batch loads were already in module 2.


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
| – | Explain-back | Optional: reference answers on each page; notes/ answers not required | Your call | 2026-11-05 ✅ |
| – | SQL modules | Shared SqlLab on DuckDB-WASM, one schema per module; same SQL tested natively | Real SQL to edit, no backend | 2026-11-05 ✅ |

---

# v2 (2026-11-05): depth, lab-first, more roles, real integrations

Feedback: navigation and UI are poor; intuition is shallow, so add depth; the experiment should be the
centre of each module; broaden topics (AI/LLM, software engineering, management); add integrations with
real tools (GCP, Snowflake, AWS, Databricks).

## 11. What the market asks for (jobz, 2026-11-05)

Share of job posts mentioning each item, by title family (jobz `jobs` table, posts with a description;
aggregate counts only). n: DA 2,952 · AE 515 · DE 2,688 · DS 1,203 · MLE 873 · AI/LLM 1,042 · SWE 16,000 ·
data manager/lead 3,328.

| Skill | DA | AE | DE | DS | MLE | AI | SWE | Mgr |
|---|---|---|---|---|---|---|---|---|
| SQL | 70 | 93 | 80 | 68 | 20 | 19 | 21 | 32 |
| Python | 43 | 70 | 77 | 85 | 68 | 73 | 46 | 27 |
| Data modelling | 24 | **76** | 54 | 10 | 1 | 9 | 11 | 14 |
| dbt | 13 | **71** | 35 | 11 | 4 | 2 | 1 | 8 |
| Data quality / contracts | 35 | 56 | 54 | 14 | 22 | 38 | 27 | 28 |
| Governance / lineage | 22 | 40 | 44 | 13 | 11 | 20 | 8 | 35 |
| System design | 19 | 53 | **65** | 30 | 58 | 51 | 61 | 37 |
| Batch / ETL | 12 | 36 | 54 | 6 | 3 | 4 | 3 | 8 |
| Streaming | 6 | 9 | 33 | 17 | 28 | 23 | 22 | 14 |
| Spark / Databricks | 5/9 | 14/28 | 43/41 | 19/16 | 19/9 | 4/8 | 5/2 | 6/9 |
| Snowflake / BigQuery | 12/8 | 51/35 | 35/17 | 12/8 | 4/2 | 6/4 | 3/2 | 12/5 |
| AWS / GCP / Azure | 7/5/8 | 17/15/12 | 51/30/36 | 21/15/13 | 35/21/20 | 39/25/27 | 40/17/16 | 14/9/10 |
| Airflow / Dagster | 3/0 | 35/10 | 34/9 | 7/1 | 12/0 | 3/0 | 2/0 | 5/1 |
| CI/CD | 2 | 21 | 39 | 9 | 20 | 32 | 30 | 8 |
| Statistics / A/B | 39/16 | 10/10 | 5/4 | 66/40 | 23/27 | 4/14 | 2/7 | 15/15 |
| BI (Power BI / Tableau / Looker) | 35/32/17 | 23/25/28 | 11/7/5 | 8/11/7 | – | – | – | 10/12/6 |
| LLM / RAG / agents / evals | 9/1/12/9 | 20/3/28/9 | 17/8/19/6 | 34/14/29/30 | 54/30/38/52 | **80/50/76/55** | 20/6/30/12 | 29/10/38/22 |
| APIs | 35 | 42 | 51 | 43 | 44 | 67 | **71** | 42 |
| Stakeholders / strategy / roadmap | 64/46/10 | 59/29/13 | 42/25/7 | 52/45/18 | 20/34/23 | 31/33/16 | 21/20/14 | 59/**71**/43 |

Interview themes (prep sites and posted loops; directional): DE system design with trade-offs and
failure handling (real-time clickstream, surge pricing: freshness over consistency), incremental loads
without CDC columns, SCD2 on a full daily extract, medallion layers mixing Kafka and batch, slow/costly
joins and skew in Spark/Databricks, streaming checkpoints, deployment across environments, 10,000 API
calls from Python; AE: incremental vs full refresh, materializations, snapshots, tests failing, metric
usefulness; AI engineering: RAG chunking/retrieval, model vs system evals, agents vs chains, cost,
latency, hallucination, prompt vs fine-tune; managers: strategy, quality across pipelines, compliance,
leading projects end to end.

## 12. Gaps, and the new topics

Current 24 modules cover statistics, experimentation, a slice of AE/DE, analysis and classic ML. Missing,
by role demand:

- **Analytics engineering:** dimensional modelling (facts, dimensions, conformed dims, SCD 1/2/3/6);
  dbt in practice (DAG, ref, materializations, incremental strategies, tests, snapshots, CI slim builds);
  data quality, contracts and observability; semantic layer / one definition of a metric.
- **Data engineering:** DE system design (an interactive design board: requirements → components →
  failure injection; surge pricing, clickstream, CDC to lakehouse); orchestration (DAGs, backfills,
  catch-up, retries, SLAs); streaming internals (Kafka partitions, ordering, consumer lag, offsets,
  checkpoints, exactly-once); Spark execution (shuffle, broadcast vs sort-merge join, skew, AQE, file
  sizes); lakehouse formats (Delta/Iceberg: ACID, time travel, MERGE, compaction, vacuum) and medallion;
  CDC (log vs query based, no-change-column diffing); ingestion from APIs (concurrency, rate limits,
  backoff, pagination); cost and FinOps.
- **Data analysis:** KPI design and metric trees; causal inference without an experiment (DiD, synthetic
  control, regression discontinuity, matching); SQL patterns (gaps and islands, sessionisation); forecasting.
- **Experimentation:** sequential testing (the fix for peeking), interference and switchback tests (surge
  pricing again), novelty effects, Bayesian A/B.
- **ML:** model monitoring and drift; time-series cross-validation; calibration; feature stores.
- **AI / LLM engineering (new track):** tokens, context, cost and latency; embeddings and vector search;
  RAG (chunking, retrieval, reranking, failure modes); evals (golden sets, LLM-as-judge, system vs model
  evals); agents and tool use (loops, budgets, failure); structured output and prompting; guardrails and
  prompt injection; prompt vs RAG vs fine-tune.
- **Software engineering (new track):** rate limiting and retries with backoff and jitter (the 10,000
  API calls); caching (hit rate, TTL, invalidation, stampedes); queues and backpressure (Little's law,
  utilisation and latency); indexes and query plans; replication and consistency; tail latency (p99,
  fan-out).
- **Data leadership (new track):** prioritisation (cost of delay, WSJF); SLAs, SLOs and error budgets for
  data; incident management and postmortems; team topologies (central, embedded, hub and spoke); build
  vs buy; governance and PII. Each gets a simulator, not just prose.
- **Roles page:** for each role (DA, AE, DE, DS, MLE, AI, SWE; IC and manager paths) the demand table
  above, the modules that cover it, and an interview checklist.

## 13. Module template v2

1. **Header:** track, title, one-line promise, roles it matters for, time.
2. **Lab first:** the interactive experiment fills the page width under the header, with its controls
   beside the charts, inside the lab. Below it, **experiments**: numbered challenges, each with a “set it
   up” button that configures the lab, what to look for, and why it happens.
3. **Understand:** a short intuition, then the **deep dive**: the mechanism step by step, the maths or
   algorithm, a worked example with numbers, edge cases, how it shows up in production, related modules.
4. **Interview:** real-style questions with a model answer, the follow-ups interviewers ask, and what a
   strong answer includes.
5. **Check yourself:** the explain-back questions (optional).

Navigation: a persistent sidebar with tracks and modules (search, current module highlighted), a top
bar (search, roles, integrations, theme), breadcrumbs and previous/next at the end of each module.

## 14. Integrations: a lab API with real accounts

- **Shape:** a small FastAPI service on the VPS (`lab-api`, Docker Swarm, behind Traefik and the same
  login, `/api`). Credentials live only on the server as Swarm secrets; the browser never sees them.
- **Providers:** BigQuery (service account limited to one sandbox dataset; `maximum_bytes_billed` on
  every job), Snowflake (role limited to one database; X-Small warehouse, auto-suspend 60 s, resource
  monitor with a credit quota), AWS (IAM user limited to one S3 bucket, one Athena workgroup with a
  bytes-scanned limit, one Glue database), Databricks (Free Edition SQL warehouse via the Statement
  Execution API).
- **Safety:** per-call timeouts and row limits, per-provider daily budget, an audit log of every
  statement, a kill switch, read-only by default with write labs confined to sandbox objects.
- **Labs:** same query on four engines (bytes scanned, time, cost); load a file (object store → table)
  three ways; MERGE and SCD2 on each warehouse; partitioning/clustering and the bill; time travel and
  zero-copy clones; external tables over S3/GCS.
- **Needed from you:** the accounts exist; I prepare least-privilege setup steps per provider and you
  create the keys (I don't create cloud accounts or keys myself).

## 15. Milestones v2

| # | Milestone | Done when | Status |
|---|---|---|---|
| M7 | Shell, navigation, design system, lab-first template; roles page; two pilot modules with full depth | Deployed; you review the pilots | in progress |
| M8 | Deep dive + interview sections for all 24 modules | Every module has template v2 | |
| M9 | New topics (§12): AE modelling/dbt/quality, DE design/orchestration/streaming/Spark/lakehouse/CDC, AI/LLM track, SWE track, leadership track | Built, tested, deployed | |
| M10 | Lab API + provider adapters + first four integration labs | Real queries run on all four providers under budget caps | |
