import type { Role } from '../modules/registry.ts'

/**
 * Share of job posts mentioning each skill, by title family. Source: the jobz job-board database
 * (posts with a description, snapshot 2026-11-05). Aggregate counts only; see PLAN.md §11.
 */
export const SAMPLE: Record<Role, number> = { da: 2952, ae: 515, de: 2688, ds: 1203, mle: 873, ai: 1042, swe: 16000, mgr: 3328 }

export const DEMAND: Record<string, Record<Role, number>> = {
  SQL: { da: 70, ae: 93, de: 80, ds: 68, mle: 20, ai: 19, swe: 21, mgr: 32 },
  Python: { da: 43, ae: 70, de: 77, ds: 85, mle: 68, ai: 73, swe: 46, mgr: 27 },
  'Data modelling': { da: 24, ae: 76, de: 54, ds: 10, mle: 1, ai: 9, swe: 11, mgr: 14 },
  dbt: { da: 13, ae: 71, de: 35, ds: 11, mle: 4, ai: 2, swe: 1, mgr: 8 },
  'Data quality': { da: 35, ae: 56, de: 54, ds: 14, mle: 22, ai: 38, swe: 27, mgr: 28 },
  Governance: { da: 22, ae: 40, de: 44, ds: 13, mle: 11, ai: 20, swe: 8, mgr: 35 },
  'System design': { da: 19, ae: 53, de: 65, ds: 30, mle: 58, ai: 51, swe: 61, mgr: 37 },
  'Batch / ETL': { da: 12, ae: 36, de: 54, ds: 6, mle: 3, ai: 4, swe: 3, mgr: 8 },
  Streaming: { da: 6, ae: 9, de: 33, ds: 17, mle: 28, ai: 23, swe: 22, mgr: 14 },
  Spark: { da: 5, ae: 14, de: 43, ds: 19, mle: 19, ai: 4, swe: 5, mgr: 6 },
  Databricks: { da: 9, ae: 28, de: 41, ds: 16, mle: 9, ai: 8, swe: 2, mgr: 9 },
  Snowflake: { da: 12, ae: 51, de: 35, ds: 12, mle: 4, ai: 6, swe: 3, mgr: 12 },
  BigQuery: { da: 8, ae: 35, de: 17, ds: 8, mle: 2, ai: 4, swe: 2, mgr: 5 },
  AWS: { da: 7, ae: 17, de: 51, ds: 21, mle: 35, ai: 39, swe: 40, mgr: 14 },
  GCP: { da: 5, ae: 15, de: 30, ds: 15, mle: 21, ai: 25, swe: 17, mgr: 9 },
  Azure: { da: 8, ae: 12, de: 36, ds: 13, mle: 20, ai: 27, swe: 16, mgr: 10 },
  Airflow: { da: 3, ae: 35, de: 34, ds: 7, mle: 12, ai: 3, swe: 2, mgr: 5 },
  'CI/CD': { da: 2, ae: 21, de: 39, ds: 9, mle: 20, ai: 32, swe: 30, mgr: 8 },
  Statistics: { da: 39, ae: 10, de: 5, ds: 66, mle: 23, ai: 4, swe: 2, mgr: 15 },
  'A/B testing': { da: 16, ae: 10, de: 4, ds: 40, mle: 27, ai: 14, swe: 7, mgr: 15 },
  'Causal inference': { da: 2, ae: 2, de: 1, ds: 24, mle: 3, ai: 0, swe: 0, mgr: 3 },
  'Power BI': { da: 35, ae: 23, de: 11, ds: 8, mle: 1, ai: 1, swe: 1, mgr: 10 },
  Tableau: { da: 32, ae: 25, de: 7, ds: 11, mle: 1, ai: 1, swe: 0, mgr: 12 },
  Looker: { da: 17, ae: 28, de: 5, ds: 7, mle: 0, ai: 0, swe: 0, mgr: 6 },
  'Machine learning': { da: 8, ae: 17, de: 21, ds: 63, mle: 73, ai: 27, swe: 8, mgr: 19 },
  MLOps: { da: 0, ae: 4, de: 8, ds: 20, mle: 35, ai: 17, swe: 2, mgr: 6 },
  LLMs: { da: 9, ae: 20, de: 17, ds: 34, mle: 54, ai: 80, swe: 20, mgr: 29 },
  RAG: { da: 1, ae: 3, de: 8, ds: 14, mle: 30, ai: 50, swe: 6, mgr: 10 },
  Agents: { da: 12, ae: 28, de: 19, ds: 29, mle: 38, ai: 76, swe: 30, mgr: 38 },
  Evals: { da: 9, ae: 9, de: 6, ds: 30, mle: 52, ai: 55, swe: 12, mgr: 22 },
  Prompting: { da: 4, ae: 3, de: 4, ds: 14, mle: 21, ai: 46, swe: 8, mgr: 11 },
  'PyTorch / TF': { da: 0, ae: 0, de: 1, ds: 15, mle: 42, ai: 10, swe: 1, mgr: 2 },
  APIs: { da: 35, ae: 42, de: 51, ds: 43, mle: 44, ai: 67, swe: 71, mgr: 42 },
  Kubernetes: { da: 1, ae: 2, de: 10, ds: 2, mle: 18, ai: 17, swe: 28, mgr: 4 },
  TypeScript: { da: 3, ae: 3, de: 6, ds: 3, mle: 6, ai: 38, swe: 47, mgr: 4 },
  Stakeholders: { da: 64, ae: 59, de: 42, ds: 52, mle: 20, ai: 31, swe: 21, mgr: 59 },
  Strategy: { da: 46, ae: 29, de: 25, ds: 45, mle: 34, ai: 33, swe: 20, mgr: 71 },
  Roadmaps: { da: 10, ae: 13, de: 7, ds: 18, mle: 23, ai: 16, swe: 14, mgr: 43 },
  'KPIs / OKRs': { da: 20, ae: 15, de: 3, ds: 8, mle: 3, ai: 1, swe: 1, mgr: 15 },
  'Cost / budget': { da: 12, ae: 12, de: 11, ds: 16, mle: 11, ai: 17, swe: 11, mgr: 21 },
}

export interface RoleBrief {
  what: string
  ic: string[]
  manager: string[]
  interviews: string[]
  /** Topics planned (PLAN.md §12) that this role needs and the site doesn't cover yet. */
  planned: string[]
}

export const BRIEFS: Record<Role, RoleBrief> = {
  da: {
    what: 'Turns questions into numbers people trust and act on: defines metrics, queries, analyses, explains.',
    ic: ['Analyst: reliable SQL, clean charts, answers well-posed questions', 'Senior: frames the question, picks the method, pushes back on bad metrics', 'Staff/principal: owns a domain’s metrics and decision process, teaches the org'],
    manager: ['Analytics manager: prioritises requests, sets standards, hires', 'Head of analytics: metric strategy, self-serve, partnership with product and finance'],
    interviews: ['SQL live (joins, windows, gaps and islands)', 'Metric design: “how would you measure success of X?”', 'Product case: a metric dropped 10%, investigate', 'A/B test reading and pitfalls', 'Communicating to non-technical stakeholders'],
    planned: ['KPI design and metric trees', 'Causal inference without an experiment', 'SQL patterns: gaps and islands, sessionisation', 'Dashboard design'],
  },
  ae: {
    what: 'Builds the modelled, tested, documented layer between raw data and every dashboard: the warehouse’s source of truth.',
    ic: ['AE: dbt models with tests, clear grain, documented', 'Senior: designs the dimensional model and conventions, CI for data', 'Staff: semantic layer, contracts with producers, cost and performance across the warehouse'],
    manager: ['AE manager: modelling standards, review culture, roadmap with analysts', 'Head of data platform/analytics engineering: tooling, governance, build vs buy'],
    interviews: ['SQL and window functions', 'Model this business as facts and dimensions', 'Incremental vs full refresh; materializations', 'SCD2 with snapshots', 'A test failed in production: what now?', 'Take-home dbt project'],
    planned: ['Dimensional modelling (facts, dims, SCD 1/2/3/6)', 'dbt in practice (DAG, incremental strategies, tests, CI)', 'Data quality, contracts and observability', 'Semantic layer and metric definitions'],
  },
  de: {
    what: 'Moves, stores and serves data reliably at scale: ingestion, pipelines, storage formats, streaming, platform.',
    ic: ['DE: builds and operates pipelines; idempotent, tested, monitored', 'Senior: designs systems with clear trade-offs (freshness, cost, correctness)', 'Staff: platform architecture, multi-team standards, incident and cost ownership'],
    manager: ['DE manager: delivery, on-call health, SLAs, hiring', 'Director of data platform: strategy, budgets, vendor choices, org design'],
    interviews: ['System design: clickstream, surge pricing, CDC into a lakehouse', 'Incremental loads without change columns', 'SCD2 on a full daily extract', 'Slow/costly Spark joins, skew', 'Streaming checkpoints and late data', 'Deploying across environments; 10,000 API calls in Python'],
    planned: ['DE system design board', 'Orchestration (DAGs, backfills, SLAs)', 'Streaming internals (Kafka, offsets, exactly-once)', 'Spark execution (shuffles, joins, skew)', 'Lakehouse formats and medallion layers', 'CDC', 'Ingesting from APIs at scale'],
  },
  ds: {
    what: 'Uses statistics, experiments and models to answer causal and predictive questions.',
    ic: ['DS: sound analyses and experiments', 'Senior: chooses methods, designs experimentation programs', 'Staff: org-wide methodology, decision science'],
    manager: ['DS manager: portfolio of problems, review of methods, hiring', 'Head of data science: strategy, experimentation platform, ethics'],
    interviews: ['Probability and statistics fundamentals', 'Experiment design and analysis', 'Causal inference', 'ML modelling case', 'Product sense'],
    planned: ['Sequential testing', 'Interference and switchback tests', 'Causal inference (DiD, synthetic control, RDD)', 'Bayesian A/B'],
  },
  mle: {
    what: 'Ships models to production and keeps them working: training pipelines, serving, monitoring.',
    ic: ['MLE: trains, evaluates and deploys models', 'Senior: ML system design, monitoring and retraining', 'Staff: ML platform, evaluation standards'],
    manager: ['ML engineering manager: roadmap, reliability, hiring', 'Head of ML: platform strategy, build vs buy'],
    interviews: ['ML system design (recommendations, fraud)', 'Evaluation and leakage', 'Training at scale, serving latency', 'Monitoring and drift', 'LLM fine-tuning vs RAG'],
    planned: ['Model monitoring and drift', 'Time-series cross-validation', 'Calibration', 'Feature stores'],
  },
  ai: {
    what: 'Builds products on top of LLMs: retrieval, agents, evaluation, cost and safety.',
    ic: ['AI engineer: prompt, RAG and tool-calling features with evals', 'Senior: system design for LLM apps, eval strategy, cost/latency', 'Staff: platform for evals, guardrails, model choice across the org'],
    manager: ['AI engineering manager: roadmap, eval quality bar, vendor/model strategy'],
    interviews: ['Design a RAG system; chunking and retrieval choices', 'Model evals vs system evals', 'Agent vs chain; tool-use failure modes', 'Cost, latency, hallucination handling', 'Prompt vs RAG vs fine-tune'],
    planned: ['Tokens, context, cost and latency', 'Embeddings and vector search', 'RAG end to end', 'Evals', 'Agents and tool use', 'Structured output and prompting', 'Guardrails and prompt injection'],
  },
  swe: {
    what: 'Builds and runs software systems: APIs, services, storage, reliability.',
    ic: ['SWE: correct, tested code', 'Senior: designs services, owns reliability', 'Staff: cross-team architecture'],
    manager: ['Engineering manager: delivery, people, process', 'Director: org design, strategy'],
    interviews: ['Coding', 'System design', 'APIs, concurrency, caching, queues', 'Databases and indexes', 'Behavioural'],
    planned: ['Rate limiting and backoff with jitter', 'Caching', 'Queues and backpressure (Little’s law)', 'Indexes and query plans', 'Replication and consistency', 'Tail latency'],
  },
  mgr: {
    what: 'Leads data people and platforms: strategy, prioritisation, quality bar, stakeholders, budget.',
    ic: ['(IC leadership) Staff/principal: sets technical direction without managing'],
    manager: ['Lead/manager: a team’s delivery, quality and growth', 'Senior manager/director: several teams, roadmap, budget', 'Head/VP of data: strategy, org design, executive partnership'],
    interviews: ['Data strategy for a company', 'Prioritising competing requests', 'Ensuring quality across pipelines; SLAs', 'Compliance and PII', 'Leading a project end to end; handling a failed one', 'Hiring and growing people'],
    planned: ['Prioritisation (cost of delay)', 'SLAs, SLOs and error budgets for data', 'Incident management and postmortems', 'Team topologies', 'Build vs buy', 'Governance and PII'],
  },
}
