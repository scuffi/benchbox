import {
  mean as ssMean,
  sampleStandardDeviation,
  zScore as ssZScore,
  linearRegression,
} from "simple-statistics";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function notFound(): Response {
  return json({ error: "Not found" }, 404);
}

// --- Notification helpers ---------------------------------------------------

interface PerfRun {
  run_id: string;
  timestamp: string;
  commit_sha: string | null;
  branch: string | null;
  sdk_version: string | null;
  duration_ms: number | null;
  passed: number | null;
  total: number | null;
  worker_url: string | null;
  trigger: string | null;
}

interface PerfMetric {
  scenario: string;
  metric_name: string;
  unit: string | null;
  mean_val: number | null;
}

interface HistPoint {
  scenario: string;
  metric_name: string;
  unit: string | null;
  mean_val: number;
  run_id: string;
}

interface MetricChange {
  scenario: string;
  metric_name: string;
  unit: string | null;
  current: number;
  historicalMean: number;
  pctChange: number;
  zScore: number;
  slopePerRun: number;
  slopePctPerRun: number;
  sampleCount: number;
}

interface RunSummary {
  run: PerfRun;
  metrics: PerfMetric[];
  failures: MetricChange[];
  shortTermRegressions: MetricChange[];
  shortTermImprovements: MetricChange[];
  longTermRegressions: MetricChange[];
  longTermImprovements: MetricChange[];
  historyRunCount: number;
}

const Z_THRESHOLD = 2.0;
const SLOPE_THRESHOLD = 0.02;
const FAILURE_UNITS = new Set(["percent", "%", "count", "counts"]);
const FAILURE_DROP_THRESHOLD = 0.01;

async function buildRunSummary(
  env: Env,
  runId?: string,
): Promise<RunSummary | null> {
  const run = runId
    ? await env.DB.prepare("SELECT * FROM perf_runs WHERE run_id = ?")
        .bind(runId)
        .first<PerfRun>()
    : await env.DB.prepare(
        "SELECT * FROM perf_runs ORDER BY timestamp DESC LIMIT 1",
      ).first<PerfRun>();

  if (!run) return null;

  const [{ results: metrics }, { results: histPoints }] = await Promise.all([
    env.DB.prepare(
      `SELECT scenario, metric_name, unit, mean_val
       FROM perf_metrics WHERE run_id = ? ORDER BY scenario, metric_name`,
    )
      .bind(run.run_id)
      .all<PerfMetric>(),
    env.DB.prepare(
      `SELECT m.scenario, m.metric_name, m.unit, m.mean_val, r.run_id
       FROM perf_metrics m
       JOIN perf_runs r ON r.run_id = m.run_id
       WHERE m.run_id IN (
         SELECT run_id FROM perf_runs
         WHERE branch = ? AND run_id != ? AND timestamp < ?
         ORDER BY timestamp DESC LIMIT 20
       )
       ORDER BY m.scenario, m.metric_name, r.timestamp ASC`,
    )
      .bind(run.branch ?? "", run.run_id, run.timestamp)
      .all<HistPoint>(),
  ]);

  const histByKey = new Map<string, number[]>();
  for (const p of histPoints) {
    const key = `${p.scenario}||${p.metric_name}`;
    const arr = histByKey.get(key);
    if (arr) arr.push(p.mean_val);
    else histByKey.set(key, [p.mean_val]);
  }

  const historyRunCount = new Set(histPoints.map((p) => p.run_id)).size;

  const failures: MetricChange[] = [];
  const shortTermRegressions: MetricChange[] = [];
  const shortTermImprovements: MetricChange[] = [];
  const longTermRegressions: MetricChange[] = [];
  const longTermImprovements: MetricChange[] = [];

  for (const m of metrics) {
    if (m.mean_val == null) continue;
    const hist = histByKey.get(`${m.scenario}||${m.metric_name}`);
    if (!hist || hist.length < 2) continue;

    const histMean = ssMean(hist);
    const pctChange = histMean !== 0 ? (m.mean_val - histMean) / histMean : 0;
    const isFailureUnit =
      m.unit != null && FAILURE_UNITS.has(m.unit.toLowerCase());

    if (isFailureUnit) {
      if (pctChange < -FAILURE_DROP_THRESHOLD) {
        failures.push({
          scenario: m.scenario,
          metric_name: m.metric_name,
          unit: m.unit,
          current: m.mean_val,
          historicalMean: histMean,
          pctChange,
          zScore: 0,
          slopePerRun: 0,
          slopePctPerRun: 0,
          sampleCount: hist.length,
        });
      }
      continue;
    }

    const histStdDev = sampleStandardDeviation(hist);
    const z = histStdDev > 0 ? ssZScore(m.mean_val, histMean, histStdDev) : 0;

    const pairs = hist.map((v, i) => [i, v] as [number, number]);
    const { m: slope } = linearRegression(pairs);
    const slopePctPerRun = histMean !== 0 ? slope / histMean : 0;

    const entry: MetricChange = {
      scenario: m.scenario,
      metric_name: m.metric_name,
      unit: m.unit,
      current: m.mean_val,
      historicalMean: histMean,
      pctChange,
      zScore: z,
      slopePerRun: slope,
      slopePctPerRun,
      sampleCount: hist.length,
    };

    if (z > Z_THRESHOLD) shortTermRegressions.push(entry);
    else if (z < -Z_THRESHOLD) shortTermImprovements.push(entry);

    if (slopePctPerRun > SLOPE_THRESHOLD) longTermRegressions.push(entry);
    else if (slopePctPerRun < -SLOPE_THRESHOLD)
      longTermImprovements.push(entry);
  }

  failures.sort((a, b) => a.pctChange - b.pctChange);
  shortTermRegressions.sort((a, b) => b.zScore - a.zScore);
  shortTermImprovements.sort((a, b) => a.zScore - b.zScore);
  longTermRegressions.sort((a, b) => b.slopePctPerRun - a.slopePctPerRun);
  longTermImprovements.sort((a, b) => a.slopePctPerRun - b.slopePctPerRun);

  return {
    run,
    metrics,
    failures,
    shortTermRegressions,
    shortTermImprovements,
    longTermRegressions,
    longTermImprovements,
    historyRunCount,
  };
}

function fmtNum(val: number, unit: string | null): string {
  return `${val.toFixed(2)}${unit ? ` ${unit}` : ""}`;
}

function fmtPct(pct: number): string {
  return `${pct >= 0 ? "+" : ""}${(pct * 100).toFixed(1)}%`;
}

function col(topLabel: string, text: string, bottomLabel?: string): object {
  return {
    horizontalSizeStyle: "FILL_AVAILABLE_SPACE",
    horizontalAlignment: "START",
    verticalAlignment: "CENTER",
    widgets: [
      {
        decoratedText: {
          topLabel,
          text,
          ...(bottomLabel ? { bottomLabel } : {}),
        },
      },
    ],
  };
}

function twoCol(left: object, right: object): object {
  return { columns: { columnItems: [left, right] } };
}

function metricWidget(r: MetricChange, valueHtml: string, sub: string): object {
  return {
    decoratedText: {
      topLabel: `${r.scenario} / ${r.metric_name}`,
      text: valueHtml,
      bottomLabel: sub,
    },
  };
}

function collapsibleSection(header: string, widgets: object[]): object {
  return {
    header,
    collapsible: true,
    uncollapsibleWidgetsCount: 0,
    widgets,
  };
}

function buildGoogleChatMessage(
  summary: RunSummary,
  dashboardUrl: string,
): object {
  const {
    run,
    metrics,
    failures,
    shortTermRegressions,
    shortTermImprovements,
    longTermRegressions,
    longTermImprovements,
    historyRunCount,
  } = summary;

  const sha = run.commit_sha ? run.commit_sha.slice(0, 7) : "unknown";
  const measuredCount = metrics.filter((m) => m.mean_val != null).length;
  const hasFailures = failures.length > 0;
  const hasIssues =
    shortTermRegressions.length > 0 || longTermRegressions.length > 0;
  const durationText =
    run.duration_ms != null ? `${(run.duration_ms / 1000).toFixed(1)}s` : "—";

  // --- Card header ---
  const header = {
    title: "BenchBox Performance Report",
    subtitle: `${run.branch ?? "unknown"} · ${sha}${run.sdk_version ? ` · SDK ${run.sdk_version}` : ""}`,
  };

  const sections: object[] = [];

  // --- Section 1: Run overview ---
  const statusHtml = hasFailures
    ? `<font color="#a50e0e">🚨 Failures Detected</font>`
    : hasIssues
      ? `<font color="#d93025">⚠️ Issues Detected</font>`
      : `<font color="#137333">✅ All Clear</font>`;

  sections.push({
    widgets: [
      twoCol(
        col("STATUS", statusHtml),
        col("RUN", `<font color="#5f6368">${run.run_id}</font>`),
      ),
      twoCol(
        col("PASSED", `${run.passed ?? "?"}/${run.total ?? "?"}`),
        col("DURATION", durationText),
      ),
      twoCol(
        col("TRIGGER", run.trigger ?? "—"),
        col(
          "HISTORY",
          `${historyRunCount} run${historyRunCount !== 1 ? "s" : ""} compared`,
        ),
      ),
    ],
  });

  // --- Section 2: Analysis summary ---
  const failHtml =
    failures.length > 0
      ? `<font color="#a50e0e"><b>${failures.length} failure${failures.length !== 1 ? "s" : ""}</b></font>`
      : `<font color="#137333">0 failures</font>`;
  const srHtml =
    shortTermRegressions.length > 0
      ? `<font color="#d93025"><b>${shortTermRegressions.length} regression${shortTermRegressions.length !== 1 ? "s" : ""}</b></font>`
      : `<font color="#137333">0 regressions</font>`;
  const siHtml =
    shortTermImprovements.length > 0
      ? `<font color="#137333"><b>${shortTermImprovements.length} improvement${shortTermImprovements.length !== 1 ? "s" : ""}</b></font>`
      : `<font color="#5f6368">0 improvements</font>`;
  const lrHtml =
    longTermRegressions.length > 0
      ? `<font color="#e37400"><b>${longTermRegressions.length} upward trend${longTermRegressions.length !== 1 ? "s" : ""}</b></font>`
      : `<font color="#137333">0 upward trends</font>`;
  const liHtml =
    longTermImprovements.length > 0
      ? `<font color="#137333"><b>${longTermImprovements.length} downward trend${longTermImprovements.length !== 1 ? "s" : ""}</b></font>`
      : `<font color="#5f6368">0 downward trends</font>`;

  sections.push({
    header: `📊 Analysis · ${measuredCount} metrics`,
    widgets: [
      twoCol(
        col("COUNT/PERCENT (direct)", failHtml),
        col(`SHORT-TERM (z≥${Z_THRESHOLD}σ)`, `${srHtml} · ${siHtml}`),
      ),
      {
        decoratedText: {
          topLabel: `LONG-TERM (≥${(SLOPE_THRESHOLD * 100).toFixed(0)}%/run)`,
          text: `${lrHtml} · ${liHtml}`,
        },
      },
    ],
  });

  // --- Section 3: Direct failures (conditional, highest priority) ---
  if (failures.length > 0) {
    sections.push(
      collapsibleSection(
        `🚨 Direct Failures (${failures.length}) — count/percent dropped`,
        failures.map((f) =>
          metricWidget(
            f,
            `<font color="#a50e0e">${fmtNum(f.historicalMean, f.unit)} → <b>${fmtNum(f.current, f.unit)}</b></font>`,
            `${fmtPct(f.pctChange)} · ${f.sampleCount} samples`,
          ),
        ),
      ),
    );
  }

  // --- Section 4: Short-term regressions (conditional) ---
  if (shortTermRegressions.length > 0) {
    sections.push(
      collapsibleSection(
        `🔴 Short-term Regressions (${shortTermRegressions.length}) — sudden spike`,
        shortTermRegressions
          .slice(0, 10)
          .map((r) =>
            metricWidget(
              r,
              `<font color="#d93025">${fmtNum(r.historicalMean, r.unit)} → <b>${fmtNum(r.current, r.unit)}</b></font>`,
              `z=${r.zScore.toFixed(2)}σ · ${fmtPct(r.pctChange)} · ${r.sampleCount} samples`,
            ),
          ),
      ),
    );
  }

  // --- Section 5: Short-term improvements (conditional) ---
  if (shortTermImprovements.length > 0) {
    sections.push(
      collapsibleSection(
        `🟢 Short-term Improvements (${shortTermImprovements.length}) — sudden drop`,
        shortTermImprovements
          .slice(0, 10)
          .map((imp) =>
            metricWidget(
              imp,
              `<font color="#137333">${fmtNum(imp.historicalMean, imp.unit)} → <b>${fmtNum(imp.current, imp.unit)}</b></font>`,
              `z=${imp.zScore.toFixed(2)}σ · ${fmtPct(imp.pctChange)} · ${imp.sampleCount} samples`,
            ),
          ),
      ),
    );
  }

  // --- Section 6: Long-term regression trends (conditional) ---
  if (longTermRegressions.length > 0) {
    sections.push(
      collapsibleSection(
        `📈 Long-term Regression Trends (${longTermRegressions.length}) — gradual increase`,
        longTermRegressions
          .slice(0, 10)
          .map((r) =>
            metricWidget(
              r,
              `<font color="#e37400"><b>+${(r.slopePctPerRun * 100).toFixed(2)}%/run</b></font>`,
              `mean ${fmtNum(r.historicalMean, r.unit)} · ${r.sampleCount} samples`,
            ),
          ),
      ),
    );
  }

  // --- Section 7: Long-term improvement trends (conditional) ---
  if (longTermImprovements.length > 0) {
    sections.push(
      collapsibleSection(
        `📉 Long-term Improvement Trends (${longTermImprovements.length}) — gradual decrease`,
        longTermImprovements
          .slice(0, 10)
          .map((imp) =>
            metricWidget(
              imp,
              `<font color="#137333"><b>${(imp.slopePctPerRun * 100).toFixed(2)}%/run</b></font>`,
              `mean ${fmtNum(imp.historicalMean, imp.unit)} · ${imp.sampleCount} samples`,
            ),
          ),
      ),
    );
  }

  sections.push({
    widgets: [
      {
        buttonList: {
          buttons: [
            {
              text: "View Full Dashboard →",
              onClick: { openLink: { url: dashboardUrl } },
            },
          ],
        },
      },
    ],
  });

  return {
    cardsV2: [
      {
        cardId: `benchbox-${run.run_id}`,
        card: { header, sections },
      },
    ],
  };
}

// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    const { searchParams } = url;

    if (!pathname.startsWith("/api/")) {
      return new Response(null, { status: 404 });
    }

    try {
      // GET /api/runs — list runs with optional filters
      if (pathname === "/api/runs" && request.method === "GET") {
        const branch = searchParams.get("branch");
        const trigger = searchParams.get("trigger");
        const from = searchParams.get("from");
        const to = searchParams.get("to");
        const limit = Math.min(
          parseInt(searchParams.get("limit") ?? "50"),
          200,
        );

        const conditions: string[] = [];
        const params: (string | number)[] = [];

        if (branch) {
          conditions.push("branch = ?");
          params.push(branch);
        }
        if (trigger) {
          conditions.push("trigger = ?");
          params.push(trigger);
        }
        if (from) {
          conditions.push("timestamp >= ?");
          params.push(from);
        }
        if (to) {
          conditions.push("timestamp <= ?");
          params.push(to);
        }

        const where = conditions.length
          ? `WHERE ${conditions.join(" AND ")}`
          : "";
        const stmt = env.DB.prepare(
          `SELECT run_id, timestamp, commit_sha, branch, sdk_version, duration_ms, passed, total, worker_url, trigger
           FROM perf_runs ${where} ORDER BY timestamp DESC LIMIT ?`,
        ).bind(...params, limit);

        const { results } = await stmt.all();
        return json(results);
      }

      // GET /api/runs/:id — single run + all its metrics
      const runMatch = pathname.match(/^\/api\/runs\/([^/]+)$/);
      if (runMatch && request.method === "GET") {
        const runId = runMatch[1];
        const run = await env.DB.prepare(
          "SELECT * FROM perf_runs WHERE run_id = ?",
        )
          .bind(runId)
          .first();

        if (!run) return notFound();

        const { results: metrics } = await env.DB.prepare(
          `SELECT scenario, metric_name, unit, sample_count,
                  min_val, max_val, mean_val, p50, p75, p90, p95, p99, std_dev
           FROM perf_metrics WHERE run_id = ? ORDER BY scenario, metric_name`,
        )
          .bind(runId)
          .all();

        return json({ run, metrics });
      }

      // GET /api/scenarios — distinct scenario + metric combos
      if (pathname === "/api/scenarios" && request.method === "GET") {
        const { results } = await env.DB.prepare(
          `SELECT DISTINCT scenario, metric_name, unit
           FROM perf_metrics ORDER BY scenario, metric_name`,
        ).all();
        return json(results);
      }

      // GET /api/trend — time-series for a scenario+metric combo
      if (pathname === "/api/trend" && request.method === "GET") {
        const scenario = searchParams.get("scenario");
        const metric = searchParams.get("metric");
        const branch = searchParams.get("branch");
        const from = searchParams.get("from");
        const to = searchParams.get("to");
        const limit = Math.min(
          parseInt(searchParams.get("limit") ?? "100"),
          500,
        );

        if (!scenario || !metric) {
          return json({ error: "scenario and metric are required" }, 400);
        }

        const conditions: string[] = ["m.scenario = ?", "m.metric_name = ?"];
        const params: (string | number)[] = [scenario, metric];

        if (branch) {
          conditions.push("r.branch = ?");
          params.push(branch);
        }
        if (from) {
          conditions.push("r.timestamp >= ?");
          params.push(from);
        }
        if (to) {
          conditions.push("r.timestamp <= ?");
          params.push(to);
        }

        const where = conditions.length
          ? `WHERE ${conditions.join(" AND ")}`
          : "";
        const { results } = await env.DB.prepare(
          `SELECT r.run_id, r.timestamp, r.branch, r.commit_sha,
                  m.mean_val, m.p50, m.p75, m.p90, m.p95, m.p99, m.min_val, m.max_val, m.std_dev, m.unit
           FROM perf_metrics m
           JOIN perf_runs r ON r.run_id = m.run_id
           ${where}
           ORDER BY r.timestamp ASC LIMIT ?`,
        )
          .bind(...params, limit)
          .all();

        return json(results);
      }

      // GET /api/summary — overall counts + latest run
      if (pathname === "/api/summary" && request.method === "GET") {
        const [latest, counts] = await Promise.all([
          env.DB.prepare(
            "SELECT * FROM perf_runs ORDER BY timestamp DESC LIMIT 1",
          ).first(),
          env.DB.prepare(
            `SELECT COUNT(*) as total_runs,
                    SUM(CASE WHEN passed = total THEN 1 ELSE 0 END) as perfect_runs,
                    AVG(duration_ms) as avg_duration_ms,
                    COUNT(DISTINCT branch) as branch_count
             FROM perf_runs`,
          ).first(),
        ]);

        return json({ latest, counts });
      }

      // GET /api/filters — distinct branch + trigger values for dropdowns
      if (pathname === "/api/filters" && request.method === "GET") {
        const [branches, triggers] = await Promise.all([
          env.DB.prepare(
            "SELECT DISTINCT branch FROM perf_runs WHERE branch IS NOT NULL ORDER BY branch",
          ).all(),
          env.DB.prepare(
            "SELECT DISTINCT trigger FROM perf_runs WHERE trigger IS NOT NULL ORDER BY trigger",
          ).all(),
        ]);
        return json({
          branches: branches.results.map((r) => r.branch),
          triggers: triggers.results.map((r) => r.trigger),
        });
      }

      // GET /api/analysis — run summary with regression/improvement analysis
      if (pathname === "/api/analysis" && request.method === "GET") {
        const runId = searchParams.get("run_id") ?? undefined;
        const summary = await buildRunSummary(env, runId);
        if (!summary)
          return json(
            { error: runId ? `Run ${runId} not found` : "No runs found" },
            404,
          );
        return json(summary);
      }

      // POST /api/notify — analyse latest (or given) run and post to Google Chat
      if (pathname === "/api/notify" && request.method === "POST") {
        const authHeader = request.headers.get("Authorization");
        const token = authHeader?.startsWith("Bearer ")
          ? authHeader.slice(7)
          : null;
        if (!env.NOTIFY_SECRET || !token || token !== env.NOTIFY_SECRET) {
          return json({ error: "Unauthorized" }, 401);
        }

        if (!env.GOOGLE_CHAT_WEBHOOK_URL) {
          return json(
            { error: "GOOGLE_CHAT_WEBHOOK_URL secret is not configured" },
            503,
          );
        }

        let runId: string | undefined;
        try {
          const body = (await request.json()) as { run_id?: string };
          runId = body.run_id;
        } catch {
          // body is optional — falls back to latest run
        }

        const summary = await buildRunSummary(env, runId);
        if (!summary) {
          return json(
            { error: runId ? `Run ${runId} not found` : "No runs found" },
            404,
          );
        }

        if (summary.run.branch !== "main") {
          return json({
            skipped: true,
            reason: `Webhook suppressed for non-main branch "${summary.run.branch ?? "unknown"}"`,
          });
        }

        const message = buildGoogleChatMessage(summary, env.DASHBOARD_URL);
        const gchatResp = await fetch(env.GOOGLE_CHAT_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(message),
        });

        if (!gchatResp.ok) {
          const errText = await gchatResp.text();
          return json(
            {
              error: `Google Chat webhook failed: ${gchatResp.status} ${errText}`,
            },
            502,
          );
        }

        return json({
          ok: true,
          run_id: summary.run.run_id,
          failures: summary.failures.length,
          short_term_regressions: summary.shortTermRegressions.length,
          short_term_improvements: summary.shortTermImprovements.length,
          long_term_regressions: summary.longTermRegressions.length,
          long_term_improvements: summary.longTermImprovements.length,
        });
      }

      return notFound();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal error";
      return json({ error: message }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
