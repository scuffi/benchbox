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

interface AIInsight {
  label: string;
  insight: string;
}

interface AIInsights {
  verdict: "action_required" | "worth_watching" | "clean";
  headline: string;
  topIssues: AIInsight[];
  justification: string;
}

async function generateAIInsights(
  env: Env,
  summary: RunSummary,
): Promise<AIInsights | null> {
  if (!env.AI) return null;

  const {
    failures,
    shortTermRegressions,
    shortTermImprovements,
    longTermRegressions,
    longTermImprovements,
    run,
    historyRunCount,
  } = summary;

  const prevRun = await env.DB.prepare(
    `SELECT run_id, commit_sha, sdk_version FROM perf_runs
     WHERE branch = ? AND run_id != ? AND timestamp < ?
     ORDER BY timestamp DESC LIMIT 1`,
  )
    .bind(run.branch ?? "", run.run_id, run.timestamp)
    .first<{
      run_id: string;
      commit_sha: string | null;
      sdk_version: string | null;
    }>();

  const previousValues = new Map<string, number>();
  if (prevRun) {
    const { results } = await env.DB.prepare(
      `SELECT scenario, metric_name, mean_val
       FROM perf_metrics WHERE run_id = ?`,
    )
      .bind(prevRun.run_id)
      .all<PerfMetric>();
    for (const metric of results) {
      if (metric.mean_val == null) continue;
      previousValues.set(
        `${metric.scenario}||${metric.metric_name}`,
        metric.mean_val,
      );
    }
  }

  const longTermRegSet = new Set(
    longTermRegressions.map((r) => `${r.scenario}||${r.metric_name}`),
  );
  const longTermImpSet = new Set(
    longTermImprovements.map((r) => `${r.scenario}||${r.metric_name}`),
  );
  const shortTermRegSet = new Set(
    shortTermRegressions.map((r) => `${r.scenario}||${r.metric_name}`),
  );

  const data = {
    branch: run.branch ?? "unknown",
    commit: run.commit_sha?.slice(0, 7) ?? "unknown",
    sdk_version: run.sdk_version ?? null,
    prev_commit: prevRun?.commit_sha?.slice(0, 7) ?? null,
    prev_sdk_version: prevRun?.sdk_version ?? null,
    commit_changed: prevRun ? prevRun.commit_sha !== run.commit_sha : null,
    sdk_changed: prevRun ? prevRun.sdk_version !== run.sdk_version : null,
    history_runs: historyRunCount,
    direct_failures: failures.slice(0, 3).map((f) => ({
      scenario: f.scenario,
      metric: f.metric_name,
      unit: f.unit,
      historical_baseline_mean: f.historicalMean.toFixed(2),
      previous_run_mean:
        previousValues.get(`${f.scenario}||${f.metric_name}`)?.toFixed(2) ??
        null,
      current: f.current.toFixed(2),
      baseline_pct_change: `${(f.pctChange * 100).toFixed(1)}%`,
      samples: f.sampleCount,
    })),
    short_term_regressions: shortTermRegressions.slice(0, 5).map((r) => ({
      scenario: r.scenario,
      metric: r.metric_name,
      unit: r.unit,
      historical_baseline_mean: r.historicalMean.toFixed(2),
      previous_run_mean:
        previousValues.get(`${r.scenario}||${r.metric_name}`)?.toFixed(2) ??
        null,
      current: r.current.toFixed(2),
      baseline_pct_change: `${(r.pctChange * 100).toFixed(1)}%`,
      z: r.zScore.toFixed(2),
      samples: r.sampleCount,
      alsoLongTermTrend: longTermRegSet.has(`${r.scenario}||${r.metric_name}`),
      revertingImprovement: longTermImpSet.has(
        `${r.scenario}||${r.metric_name}`,
      ),
    })),
    short_term_improvements: shortTermImprovements.length,
    long_term_regressions: longTermRegressions.slice(0, 3).map((r) => ({
      scenario: r.scenario,
      metric: r.metric_name,
      slope: `${(r.slopePctPerRun * 100).toFixed(2)}%/run`,
      samples: r.sampleCount,
      alsoShortTermSpike: shortTermRegSet.has(
        `${r.scenario}||${r.metric_name}`,
      ),
    })),
    long_term_improvements: longTermImprovements.length,
  };

  const systemPrompt = `You are a performance engineering analyst reviewing benchmark CI results. Respond ONLY with valid JSON matching this exact schema — no markdown, no extra text:
{"verdict":"action_required"|"worth_watching"|"clean","headline":"<≤90 chars summary>","topIssues":[{"label":"<exact: scenario / metric_name>","insight":"<≤130 chars HTML: use <b> around key numbers/metrics>"}],"justification":"<≤500 chars HTML analysis using <b> for numbers and <br> for paragraph breaks>"}
Analysis rules:
- commit_changed=false AND sdk_changed=false: strong flakiness indicator — lower verdict tier, mention in justification
- commit_changed=true OR sdk_changed=true: changes present, regression more likely genuine
- sdk_changed=true: note the SDK version change (prev→current) when relevant
- alsoLongTermTrend=true: metric is both spiking and on a sustained upward trend — highest credibility signal
- alsoShortTermSpike=true on a long-term trend: gradual regression now accelerating
- Borderline z-score (2.0–2.5) + no long-term trend + commit_changed=false: very likely noise — omit from topIssues
- Low samples (<5): limited history, be conservative
- verdict=action_required: direct failures OR (z>2.5 AND changes present) OR alsoLongTermTrend
- verdict=worth_watching: genuine trends, or z>2.5 with unchanged commit/sdk
- verdict=clean: borderline signals only, or all regressions look like noise
- insight: state what the data shows using exact current, previous_run_mean, historical_baseline_mean, baseline_pct_change, z values wrapped in <b>; no actions or fixes
- historical_baseline_mean is the average of prior runs, not the immediately previous run; never describe it as "previous"
- justification: write 2–3 short analytical sentences explaining the overall assessment reasoning; use <b> for key numbers; use <br> to separate distinct points
- label: must be exactly "scenario / metric_name" using the exact values from the data
- topIssues: empty when clean or all noise; max 3 credible signals`;

  const userPrompt = `Benchmark run data: ${JSON.stringify(data)}`;

  try {
    const result = await env.AI.run(
      "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      {
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        max_tokens: 800,
        temperature: 0.1,
      },
    );

    let text: string | undefined;
    if (typeof result === "string") {
      text = result;
    } else if (result && typeof result === "object" && "response" in result) {
      text = (result as { response: string }).response;
    }

    if (!text) return null;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as Partial<AIInsights>;
    if (!parsed.verdict || !parsed.headline) return null;
    return {
      verdict: parsed.verdict,
      headline: parsed.headline,
      topIssues: Array.isArray(parsed.topIssues)
        ? parsed.topIssues.slice(0, 3)
        : [],
      justification: parsed.justification ?? "",
    };
  } catch {
    return null;
  }
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

function buildGoogleChatMessage(
  summary: RunSummary,
  dashboardUrl: string,
  insights: AIInsights | null = null,
): object {
  const { run } = summary;

  const sha = run.commit_sha ? run.commit_sha.slice(0, 7) : "unknown";
  const baseUrl = dashboardUrl.replace(/\/$/, "");
  const header = {
    title: "BenchBox",
    subtitle: `${run.branch ?? "unknown"} · ${sha}${run.sdk_version ? ` · SDK ${run.sdk_version}` : ""}`,
    imageUrl: `${baseUrl}/favicon.png`,
    imageType: "CIRCLE",
  };

  const widgets: object[] = [];

  if (insights) {
    const verdictColor =
      insights.verdict === "action_required"
        ? "#b31412"
        : insights.verdict === "worth_watching"
          ? "#c26401"
          : "#137333";
    const verdictIcon =
      insights.verdict === "action_required"
        ? "🔴"
        : insights.verdict === "worth_watching"
          ? "🟡"
          : "🟢";
    const verdictLabel =
      insights.verdict === "action_required"
        ? "ACTION REQUIRED"
        : insights.verdict === "worth_watching"
          ? "WORTH A LOOK"
          : "ALL CLEAR";

    widgets.push({
      textParagraph: {
        text: `<font color="${verdictColor}"><b>${verdictIcon} ${verdictLabel}</b></font><br><font color="#444746">${insights.headline}</font>`,
      },
    });

    if (insights.topIssues.length > 0) {
      widgets.push({ divider: {} });
      for (const issue of insights.topIssues) {
        widgets.push({
          decoratedText: {
            startIcon: { materialIcon: { name: "monitoring" } },
            topLabel: issue.label,
            text: issue.insight,
          },
        });
      }
    }
  }

  const sections: object[] = [{ widgets }];

  if (insights?.justification) {
    sections.push({
      header: "Analysis",
      collapsible: true,
      uncollapsibleWidgetsCount: 0,
      widgets: [
        {
          textParagraph: {
            text: insights.justification,
          },
        },
      ],
    });
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

        const insights = await generateAIInsights(env, summary);
        const message = buildGoogleChatMessage(
          summary,
          env.DASHBOARD_URL,
          insights,
        );
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
