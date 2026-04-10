const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const { pathname, searchParams } = url;

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

      return notFound();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal error";
      return json({ error: message }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
