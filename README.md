# data-concepts

An interactive site for learning data engineering, analytics, statistics and ML concepts through
visual explanations and sandboxes you can break on purpose. See [PLAN.md](PLAN.md).

## Develop

```sh
npm install
npm run dev         # http://localhost:5173
npm test            # unit tests (Vitest)
npm run typecheck
npm run lint
npm run build       # static output in dist/
```

## Layout

- `src/core/`: pure, hand-written, unit-tested functions (stats, simulations)
- `src/modules/<slug>/`: one folder per concept module, built on `ModuleLayout`
- `src/components/`: shared UI
- `tests/`: Vitest tests
- `notes/`: explain-back answers
