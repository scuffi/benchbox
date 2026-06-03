# BenchBox

> Performance monitoring dashboard for [`cloudflare/sandbox-sdk`](https://github.com/cloudflare/sandbox-sdk).

BenchBox ingests benchmark run results, stores them in a Cloudflare D1 database, and surfaces regressions, trends, and AI-generated insights through a React dashboard. When something looks off, it also dispatches a `SandboxSDKInvestigator` agent that inspects the relevant SDK code changes and posts a diagnosis to Google Chat.

---

## What it does

- **Tracks benchmark runs** — each run carries metrics per scenario (latency percentiles, pass rates, etc.) tied to a commit SHA, branch, and SDK version.
- **Detects regressions** — statistical analysis using z-scores (short-term spikes) and linear regression slopes (long-term drift), plus direct failure detection for pass-rate drops.
- **AI insights** — Workers AI (Llama 3.3 70B) summarises each run with a verdict (`action_required` / `worth_watching` / `clean`) and per-metric reasoning.
- **SDK investigation** — a `SandboxSDKInvestigator` Durable Object agent (powered by [Project Think](https://github.com/cloudflare/agents)) inspects GitHub diffs, commit metadata, and source files across the sandbox-sdk repo to correlate code changes with benchmark signals.
- **Google Chat notifications** — `POST /api/notify` builds and sends a rich card with the run summary, AI verdict, and a collapsed SDK investigation section when relevant.
- **Dashboard** — React + Recharts SPA with per-scenario trend charts, a runs table, run detail drill-down, and dark/light theme support.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, TailwindCSS v4, Recharts |
| Backend | Cloudflare Worker (TypeScript) |
| Database | Cloudflare D1 (`sandbox-perf-results`) |
| AI | Workers AI — `@cf/meta/llama-3.3-70b-instruct-fp8-fast` |
| Agent | `@cloudflare/think` Durable Object |
| Build | Vite + `@cloudflare/vite-plugin` |
| Deploy | Wrangler |

---

## Development

```bash
npm install
npm run dev          # Vite dev server + local Worker
```

Copy `.dev.vars.example` to `.dev.vars` and fill in any required secrets before running locally.

## Deployment

```bash
npm run deploy       # tsc + vite build + wrangler deploy
```

---

## API

| Route | Method | Description |
|---|---|---|
| `/api/runs` | `GET` | List benchmark runs (filterable by branch, trigger, date) |
| `/api/runs/:id` | `GET` | Run detail with per-metric data |
| `/api/summary` | `GET` | Aggregate summary stats |
| `/api/analysis` | `GET` | Latest run regression analysis |
| `/api/filters` | `GET` | Available filter options |
| `/api/notify` | `POST` | Ingest a run, compute analysis, send GChat notification |
