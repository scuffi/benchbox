import {
  mean as ssMean,
  sampleStandardDeviation,
  zScore as ssZScore,
  linearRegression,
} from "simple-statistics";
import { Think } from "@cloudflare/think";
import { createWorkersAI } from "workers-ai-provider";
import { tool, generateText, stepCountIs } from "ai";
import { z } from "zod";

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

interface InvestigationSignal {
  scenario: string;
  metric: string;
  unit: string | null;
  historical_baseline_mean: string;
  previous_run_mean: string | null;
  current: string;
  baseline_pct_change: string;
  z: string;
  slope: string;
}

interface InvestigationRequest {
  currentRun: {
    runId: string;
    commit: string | null;
    sdkVersion: string | null;
  };
  previousRun: {
    runId: string | null;
    commit: string | null;
    sdkVersion: string | null;
  };
  commit_changed: boolean;
  sdk_version_changed: boolean;
  signals: InvestigationSignal[];
}

interface SDKInvestigation {
  verdict: "genuine" | "flaky" | "inconclusive";
  confidence: "low" | "medium" | "high";
  summary: string;
  evidence: string[];
  changedFiles: string[];
}

function isSandboxSDKPath(value: string): boolean {
  if (!value.includes("/")) return false;
  if (/^path\d*$/i.test(value)) return false;
  if (!/^[a-zA-Z0-9._/-]+$/.test(value)) return false;
  // Exclude CI, config, and documentation files — only source/test code is relevant
  if (/^\.(github|agents|changeset)\//i.test(value)) return false;
  if (/\.(yml|yaml|md|json|lock|toml)$/i.test(value)) return false;
  if (/^(Dockerfile|docker-compose|DOCKER)/i.test(value.split("/").pop() ?? ""))
    return false;
  return true;
}

function sandboxSDKFileUrl(commit: string, path: string): string {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `https://github.com/cloudflare/sandbox-sdk/blob/${commit}/${encodedPath}`;
}

export class SandboxSDKInvestigator extends Think<Env> {
  maxSteps = 200;

  private githubHeaders() {
    return {
      Accept: "application/vnd.github+json",
      "User-Agent": "benchbox-sandbox-sdk-investigator",
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }

  private async githubJson<T>(path: string): Promise<T | null> {
    const response = await fetch(`https://api.github.com${path}`, {
      headers: this.githubHeaders(),
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  }

  private async sandboxSDKTree(commit: string) {
    const tree = await this.githubJson<{
      tree?: Array<{
        path: string;
        type: "blob" | "tree" | "commit";
        size?: number;
      }>;
    }>(`/repos/cloudflare/sandbox-sdk/git/trees/${commit}?recursive=1`);
    return tree?.tree ?? [];
  }

  getModel() {
    const gatewayId = this.env.AI_GATEWAY_ID;
    const provider = createWorkersAI({
      binding: this.env.AI,
      ...(gatewayId ? { gateway: { id: gatewayId } } : {}),
    });
    return provider("@cf/moonshotai/kimi-k2.6");
  }

  getSystemPrompt() {
    return `You are a Project Think diagnosis agent for Cloudflare's public sandbox-sdk repo.
Your job is to inspect recent sandbox-sdk code changes and benchmark signals, then produce a cautious diagnosis.
Do not fix code. Do not suggest patches. Do not overstate causality.
Use tools to inspect GitHub compare data, commit metadata, repo paths, targeted code references, and relevant files before answering.
Do not stop after one search. Build a small research plan, then investigate every benchmark signal or scenario group in the input.
At minimum, compare the commits, inspect both commit metadata entries, review changed files, search for code related to each affected scenario, and fetch targeted files when search results look relevant.
Keep researching until you have either a plausible evidence-backed hypothesis or you have exhausted changed files, scenario keyword searches, and related issue/PR searches.
IMPORTANT: A Dockerfile base image bump (e.g. FROM cloudflare/sandbox:0.10.x to 0.11.x) is just the SDK release version marker — it does NOT by itself cause benchmark regressions. If the only diff is a Dockerfile bump with no source code changes, call getHistoricalBenchmarkMetrics for each affected signal to check whether the metric is inherently noisy before concluding.
When no source code change clearly explains the regression, call getHistoricalBenchmarkMetrics to check variance. CV>0.10 = high variance = likely flaky.
Prefer targeted search tools over fetching large files. Keep the final diagnosis evidence-backed and compact.
Return ONLY valid JSON:
{"verdict":"genuine"|"flaky"|"inconclusive","confidence":"low"|"medium"|"high","summary":"<≤240 chars>","evidence":["<≤160 chars>"],"changedFiles":["<path>"]}
verdict=genuine: a specific source code change plausibly explains the regression
verdict=flaky: no meaningful source change correlates, OR getHistoricalBenchmarkMetrics shows high variance (CV>0.10)
verdict=inconclusive: changes present but causal link is unclear
For changedFiles, include only real repository paths observed in tool results. Never output placeholders.
In summary and evidence strings, use <b> tags around key values: file names, commit hashes, SDK versions, function names, and any numbers that matter.`;
  }

  getTools() {
    return {
      compareSandboxSDKCommits: tool({
        description:
          "Compare two commits in cloudflare/sandbox-sdk using the public GitHub API.",
        inputSchema: z.object({
          base: z.string(),
          head: z.string(),
        }),
        execute: async ({ base, head }) => {
          const response = await fetch(
            `https://api.github.com/repos/cloudflare/sandbox-sdk/compare/${base}...${head}`,
            {
              headers: {
                Accept: "application/vnd.github+json",
                "User-Agent": "benchbox-sandbox-sdk-investigator",
                "X-GitHub-Api-Version": "2022-11-28",
              },
            },
          );
          if (!response.ok) {
            return {
              ok: false,
              status: response.status,
              error: await response.text(),
            };
          }
          const data = (await response.json()) as {
            status: string;
            total_commits: number;
            files?: Array<{
              filename: string;
              status: string;
              additions: number;
              deletions: number;
              patch?: string;
            }>;
          };
          return {
            ok: true,
            status: data.status,
            total_commits: data.total_commits,
            files: (data.files ?? []).slice(0, 30).map((file) => ({
              filename: file.filename,
              status: file.status,
              additions: file.additions,
              deletions: file.deletions,
              // Include patch for source files so the agent can see what actually changed
              ...(file.patch &&
              /\.(ts|js|py|go|rs|sh)$/.test(file.filename) &&
              !/^\.(github|agents)\//i.test(file.filename)
                ? { patch: file.patch.slice(0, 400) }
                : {}),
            })),
          };
        },
      }),
      fetchSandboxSDKFile: tool({
        description:
          "Fetch a file from cloudflare/sandbox-sdk at a specific commit SHA.",
        inputSchema: z.object({
          commit: z.string(),
          path: z.string(),
        }),
        execute: async ({ commit, path }) => {
          const response = await fetch(
            `https://raw.githubusercontent.com/cloudflare/sandbox-sdk/${commit}/${path}`,
            {
              headers: {
                "User-Agent": "benchbox-sandbox-sdk-investigator",
              },
            },
          );
          if (!response.ok) {
            return { ok: false, status: response.status };
          }
          return {
            ok: true,
            path,
            content: (await response.text()).slice(0, 5000),
          };
        },
      }),
      getSandboxSDKCommit: tool({
        description:
          "Fetch commit metadata for a cloudflare/sandbox-sdk commit SHA.",
        inputSchema: z.object({
          commit: z.string(),
        }),
        execute: async ({ commit }) => {
          const data = await this.githubJson<{
            sha: string;
            commit?: {
              message?: string;
              author?: { date?: string };
            };
            files?: Array<{
              filename: string;
              status: string;
              additions: number;
              deletions: number;
              patch?: string;
            }>;
          }>(`/repos/cloudflare/sandbox-sdk/commits/${commit}`);
          if (!data) return { ok: false };
          return {
            ok: true,
            sha: data.sha,
            message: data.commit?.message ?? "",
            date: data.commit?.author?.date ?? null,
            files: (data.files ?? []).slice(0, 15).map((file) => ({
              filename: file.filename,
              status: file.status,
              additions: file.additions,
              deletions: file.deletions,
              patch: file.patch?.slice(0, 500) ?? "",
            })),
          };
        },
      }),
      listSandboxSDKPaths: tool({
        description:
          "List file paths in cloudflare/sandbox-sdk at a commit, optionally filtered by prefix or extension.",
        inputSchema: z.object({
          commit: z.string(),
          prefix: z.string().optional(),
          extension: z.string().optional(),
          maxResults: z.coerce.number().int().min(1).max(200).optional(),
        }),
        execute: async ({ commit, prefix, extension, maxResults = 100 }) => {
          const normalizedExtension = extension?.replace(/^\./, "");
          const paths = (await this.sandboxSDKTree(commit))
            .filter((entry) => entry.type === "blob")
            .map((entry) => entry.path)
            .filter((path) => !prefix || path.startsWith(prefix))
            .filter(
              (path) =>
                !normalizedExtension ||
                path.endsWith(`.${normalizedExtension}`),
            )
            .slice(0, maxResults);
          return { ok: true, paths };
        },
      }),
      searchSandboxSDKPaths: tool({
        description:
          "Search file paths in cloudflare/sandbox-sdk for scenario/code keywords.",
        inputSchema: z.object({
          commit: z.string(),
          query: z.string(),
          maxResults: z.coerce.number().int().min(1).max(100).optional(),
        }),
        execute: async ({ commit, query, maxResults = 50 }) => {
          const terms = query
            .toLowerCase()
            .split(/[^a-z0-9_/-]+/)
            .filter(Boolean);
          const matches = (await this.sandboxSDKTree(commit))
            .filter((entry) => entry.type === "blob")
            .map((entry) => entry.path)
            .filter((path) => {
              const lower = path.toLowerCase();
              return terms.every((term) => lower.includes(term));
            })
            .slice(0, maxResults);
          return { ok: true, matches };
        },
      }),
      searchSandboxSDKContent: tool({
        description:
          "Search text content in selected sandbox-sdk files. Use pathPrefix to keep the search targeted.",
        inputSchema: z.object({
          commit: z.string(),
          query: z.string(),
          pathPrefix: z.string().optional(),
          maxFiles: z.coerce.number().int().min(1).max(40).optional(),
        }),
        execute: async ({ commit, query, pathPrefix, maxFiles = 25 }) => {
          const textExtensions = new Set([
            "ts",
            "tsx",
            "js",
            "jsx",
            "json",
            "md",
            "toml",
            "yaml",
            "yml",
            "rs",
            "py",
            "sh",
          ]);
          const candidates = (await this.sandboxSDKTree(commit))
            .filter((entry) => entry.type === "blob")
            .filter((entry) => !pathPrefix || entry.path.startsWith(pathPrefix))
            .filter((entry) => (entry.size ?? 0) <= 80_000)
            .filter((entry) => {
              const extension = entry.path.split(".").pop()?.toLowerCase();
              return extension ? textExtensions.has(extension) : false;
            })
            .slice(0, maxFiles);

          const matches: Array<{ path: string; lines: string[] }> = [];
          for (const entry of candidates) {
            const response = await fetch(
              `https://raw.githubusercontent.com/cloudflare/sandbox-sdk/${commit}/${entry.path}`,
              {
                headers: { "User-Agent": "benchbox-sandbox-sdk-investigator" },
              },
            );
            if (!response.ok) continue;
            const lines = (await response.text()).split("\n");
            const found = lines
              .map((line, index) => ({ line, index }))
              .filter(({ line }) =>
                line.toLowerCase().includes(query.toLowerCase()),
              )
              .slice(0, 5)
              .map(({ line, index }) => `${index + 1}: ${line.slice(0, 240)}`);
            if (found.length > 0)
              matches.push({ path: entry.path, lines: found });
            if (matches.length >= 10) break;
          }
          return { ok: true, matches };
        },
      }),
      listSandboxSDKTags: tool({
        description:
          "List recent cloudflare/sandbox-sdk tags to correlate SDK versions with commits.",
        inputSchema: z.object({
          maxResults: z.coerce.number().int().min(1).max(50).optional(),
        }),
        execute: async ({ maxResults = 20 }) => {
          const tags = await this.githubJson<
            Array<{ name: string; commit: { sha: string } }>
          >(`/repos/cloudflare/sandbox-sdk/tags?per_page=${maxResults}`);
          return {
            ok: tags != null,
            tags:
              tags?.map((tag) => ({
                name: tag.name,
                commit: tag.commit.sha,
              })) ?? [],
          };
        },
      }),
      searchSandboxSDKIssuesAndPRs: tool({
        description:
          "Search public GitHub issues/PRs in cloudflare/sandbox-sdk for related regression or release context.",
        inputSchema: z.object({
          query: z.string(),
          maxResults: z.coerce.number().int().min(1).max(20).optional(),
        }),
        execute: async ({ query, maxResults = 10 }) => {
          const encoded = encodeURIComponent(
            `repo:cloudflare/sandbox-sdk ${query}`,
          );
          const data = await this.githubJson<{
            items?: Array<{
              title: string;
              html_url: string;
              state: string;
              pull_request?: unknown;
            }>;
          }>(`/search/issues?q=${encoded}&per_page=${maxResults}`);
          return {
            ok: data != null,
            results:
              data?.items?.map((item) => ({
                title: item.title,
                url: item.html_url,
                state: item.state,
                type: item.pull_request ? "pull_request" : "issue",
              })) ?? [],
          };
        },
      }),
      getHistoricalBenchmarkMetrics: tool({
        description:
          "Query BenchBox's D1 database for recent benchmark values of a specific scenario+metric. Use this to check whether a regression is consistent across runs (genuine) or a one-time spike (flaky). Also returns a coefficient of variation (CV): CV>0.10 = high variance / likely flaky.",
        inputSchema: z.object({
          scenario: z.string(),
          metric: z.string(),
          limit: z.coerce.number().int().min(1).max(30).optional(),
        }),
        execute: async ({ scenario, metric, limit = 20 }) => {
          const { results } = await this.env.DB.prepare(
            `SELECT m.mean_val, r.run_id, r.commit_sha
             FROM perf_metrics m
             JOIN perf_runs r ON r.run_id = m.run_id
             WHERE m.scenario = ? AND m.metric_name = ?
             ORDER BY r.timestamp DESC
             LIMIT ?`,
          )
            .bind(scenario, metric, limit)
            .all<{
              mean_val: number;
              run_id: string;
              commit_sha: string | null;
            }>();
          if (!results.length) return { ok: false, message: "No data found" };
          const oldest_first = [...results].reverse();
          const vals = oldest_first.map((r) => r.mean_val);
          const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
          const variance =
            vals.map((v) => (v - mean) ** 2).reduce((a, b) => a + b, 0) /
            vals.length;
          const stddev = Math.sqrt(variance);
          const cv = stddev / mean;
          return {
            ok: true,
            scenario,
            metric,
            recentRuns: oldest_first.map((r) => ({
              run: r.run_id,
              commit: r.commit_sha?.slice(0, 7) ?? null,
              value: r.mean_val,
            })),
            stats: {
              mean: mean.toFixed(3),
              stddev: stddev.toFixed(3),
              cv: cv.toFixed(3),
              flakiness: cv > 0.15 ? "high" : cv > 0.05 ? "medium" : "low",
            },
          };
        },
      }),
    };
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/investigate" && request.method === "POST") {
      const input = (await request.json()) as InvestigationRequest;
      try {
        return json(await this.runInvestigation(input));
      } finally {
        // Delete any Think recovery alarm left from previous runs to prevent
        // stale-state errors on the next dev server restart.
        await this.ctx.storage.deleteAlarm().catch(() => {});
      }
    }
    return super.fetch(request);
  }

  private runInvestigation = async (
    input: InvestigationRequest,
  ): Promise<SDKInvestigation | null> => {
    if (!input.currentRun.commit || !input.previousRun.commit) {
      console.error("[investigator] null: missing commit sha");
      return null;
    }
    if (input.currentRun.commit === input.previousRun.commit) {
      console.error("[investigator] null: commits are identical");
      return null;
    }

    const gatewayId = this.env.AI_GATEWAY_ID;
    const provider = createWorkersAI({
      binding: this.env.AI,
      ...(gatewayId ? { gateway: { id: gatewayId } } : {}),
    });

    const parseDiagnosis = (t: string): Partial<SDKInvestigation> | null => {
      const match = t.match(/\{[\s\S]*\}/);
      if (!match) return null;
      try {
        const p = JSON.parse(match[0]) as Partial<SDKInvestigation>;
        if (p.confidence && p.summary) return p;
      } catch {
        /* ignore */
      }
      return null;
    };

    // Phase 1 — Research: tool-calling loop, up to 15 steps.
    const research = await generateText({
      model: provider("@cf/moonshotai/kimi-k2.5"),
      system: this.getSystemPrompt(),
      messages: [
        {
          role: "user",
          content: `Investigate this sandbox-sdk benchmark regression. Use tools to research — do NOT output text until you are done.\n\nContext:\n${JSON.stringify(input)}\n\nPlan:\n1. Compare the two commits.\n2. Fetch metadata for both.\n3. Identify changed files relevant to each signal.\n4. Search file paths and content for each affected scenario.\n5. Fetch targeted files when promising.\n6. Stop making tool calls when research is exhausted.`,
        },
      ],
      tools: this.getTools(),
      stopWhen: stepCountIs(12),
      maxRetries: 1,
    });

    for (const [i, step] of research.steps.entries()) {
      const calls = step.toolCalls
        .map((c) => `${c.toolName}(${JSON.stringify(c.input).slice(0, 80)})`)
        .join(", ");
      console.error(
        `[investigator] step ${i + 1}: finish=${step.finishReason} tools=[${calls}]`,
      );
    }
    console.error(
      `[investigator] research done: steps=${research.steps.length} finishReason=${research.finishReason}`,
    );

    // If the research phase itself produced a valid JSON answer, use it.
    const earlyParsed = [
      research.text,
      ...research.steps.map((s) => s.text).reverse(),
    ]
      .map(parseDiagnosis)
      .find(Boolean);
    if (earlyParsed) {
      console.error("[investigator] diagnosis found in research phase");
      return {
        verdict: earlyParsed.verdict ?? "inconclusive",
        confidence: earlyParsed.confidence!,
        summary: earlyParsed.summary!,
        evidence: Array.isArray(earlyParsed.evidence)
          ? earlyParsed.evidence.slice(0, 5)
          : [],
        changedFiles: Array.isArray(earlyParsed.changedFiles)
          ? earlyParsed.changedFiles.filter(isSandboxSDKPath).slice(0, 8)
          : [],
      };
    }

    // Phase 2 — Synthesis: no tools, compact notes, must produce JSON.
    // Prioritise the most informative tool results so truncation keeps signal not noise.
    type ToolResult = { toolName: string; output: unknown };
    const allResults: ToolResult[] = research.steps.flatMap(
      (step) => step.toolResults as ToolResult[],
    );

    const tier1: string[] = []; // commit messages + compare file lists
    const tier2: string[] = []; // fetched file contents
    const tier3: string[] = []; // search matches
    const tier4: string[] = []; // everything else

    for (const tr of allResults) {
      const out = tr.output as Record<string, unknown>;
      if (tr.toolName === "getSandboxSDKCommit" && out?.message) {
        type CommitFile = { filename: string; patch?: string };
        const commitFiles = (out.files as CommitFile[] | undefined) ?? [];
        const patchLines = commitFiles
          .filter((f) => f.patch)
          .map((f) => `  ${f.filename}:\n${f.patch}`)
          .join("\n");
        tier1.push(
          `Commit ${String(out.sha ?? "").slice(0, 7)}: "${String(out.message).split("\n")[0]}"\nFiles: ${commitFiles.map((f) => f.filename).join(", ")}${patchLines ? `\nPatches:\n${patchLines}` : ""}`,
        );
      } else if (tr.toolName === "compareSandboxSDKCommits" && out?.files) {
        type DiffFile = {
          filename: string;
          status: string;
          additions: number;
          deletions: number;
          patch?: string;
        };
        const diffFiles = out.files as DiffFile[];
        const summary = diffFiles
          .map(
            (f) =>
              `${f.status}: ${f.filename} (+${f.additions}/-${f.deletions})${f.patch ? `\n    ${f.patch.slice(0, 300)}` : ""}`,
          )
          .join("\n");
        tier1.push(`Compare diff:\n${summary}`);
      } else if (tr.toolName === "fetchSandboxSDKFile" && out?.content) {
        tier2.push(
          `File ${String(out.path)}: ${String(out.content).slice(0, 800)}`,
        );
      } else if (
        (tr.toolName === "searchSandboxSDKContent" ||
          tr.toolName === "searchSandboxSDKPaths") &&
        out?.ok
      ) {
        tier3.push(
          `[${tr.toolName}]: ${JSON.stringify(tr.output).slice(0, 250)}`,
        );
      } else {
        tier4.push(
          `[${tr.toolName}]: ${JSON.stringify(tr.output).slice(0, 200)}`,
        );
      }
    }

    const researchNotes = [...tier1, ...tier2, ...tier3, ...tier4]
      .join("\n")
      .slice(0, 7000);

    console.error(
      `[investigator] synthesizing from ${allResults.length} results (t1=${tier1.length} t2=${tier2.length} t3=${tier3.length}) ${researchNotes.length} chars`,
    );

    const affectedScenarios = [
      ...new Set(input.signals.map((s) => s.scenario)),
    ].join(", ");

    const synthesis = await generateText({
      model: provider("@cf/meta/llama-3.3-70b-instruct-fp8-fast"),
      system: `You are a performance engineering analyst. A benchmark regression was detected. Your job is to identify the CODE CHANGE that caused it based on research findings. Output ONLY valid JSON — no markdown fences, no explanation, no extra text.`,
      messages: [
        {
          role: "user",
          content: `A benchmark regression was detected in scenarios: ${affectedScenarios}.
Commit range: ${input.previousRun.commit?.slice(0, 7)} → ${input.currentRun.commit?.slice(0, 7)}
SDK version changed: ${input.sdk_version_changed} (${input.previousRun.sdkVersion} → ${input.currentRun.sdkVersion})

RESEARCH FINDINGS (from inspecting the repository and benchmark history):
${researchNotes}

Based ONLY on the research findings above:

- verdict: "genuine" if a specific source code change (not just a Dockerfile version bump) plausibly explains the regression; "flaky" if no source change correlates OR historical benchmark data shows high variance (CV>0.10) OR the regression looks like a one-time spike; "inconclusive" if changes exist but causal link is unclear
- summary: One sentence. If genuine: what code changed and why it causes the regression. If flaky: why the data looks like noise. Max 240 chars. No percentages.
- evidence: 2–4 specific observations from the findings. Not metric names. Use <b> tags around key values (file names, function names, commit hashes, SDK versions, numbers).
- changedFiles: Source/test files (*.ts *.js *.py) under packages/ bridge/ tests/ only. EXCLUDE Dockerfile* .github/ .agents/ *.yml *.md *.json entirely.
- confidence: "high" = clear conclusion; "medium" = plausible; "low" = unclear.

{"verdict":"genuine"|"flaky"|"inconclusive","confidence":"low"|"medium"|"high","summary":"...","evidence":["..."],"changedFiles":["packages/..."]}`,
        },
      ],
      maxRetries: 1,
    });

    console.error(
      `[investigator] synthesis: finishReason=${synthesis.finishReason} text=${synthesis.text.slice(0, 300)}`,
    );

    const parsed = parseDiagnosis(synthesis.text);
    if (!parsed) {
      console.error("[investigator] null: synthesis produced no valid JSON");
      return null;
    }

    return {
      verdict: parsed.verdict ?? "inconclusive",
      confidence: parsed.confidence!,
      summary: parsed.summary!,
      evidence: Array.isArray(parsed.evidence)
        ? parsed.evidence.slice(0, 5)
        : [],
      changedFiles: Array.isArray(parsed.changedFiles)
        ? parsed.changedFiles.filter(isSandboxSDKPath).slice(0, 5)
        : [],
    };
  };
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

async function buildInvestigationRequest(
  env: Env,
  summary: RunSummary,
  previousRunId?: string,
): Promise<InvestigationRequest | null> {
  const currentRun = summary.run;
  const prevRun = previousRunId
    ? await env.DB.prepare(
        "SELECT run_id, commit_sha, sdk_version FROM perf_runs WHERE run_id = ?",
      )
        .bind(previousRunId)
        .first<{
          run_id: string;
          commit_sha: string | null;
          sdk_version: string | null;
        }>()
    : await env.DB.prepare(
        `SELECT run_id, commit_sha, sdk_version FROM perf_runs
         WHERE branch = ? AND run_id != ? AND timestamp < ?
         ORDER BY timestamp DESC LIMIT 1`,
      )
        .bind(currentRun.branch ?? "", currentRun.run_id, currentRun.timestamp)
        .first<{
          run_id: string;
          commit_sha: string | null;
          sdk_version: string | null;
        }>();

  if (!currentRun.commit_sha || !prevRun?.commit_sha) return null;
  if (currentRun.commit_sha === prevRun.commit_sha) return null;

  const previousValues = new Map<string, number>();
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

  const signals = [
    ...summary.failures,
    ...summary.shortTermRegressions,
    ...summary.longTermRegressions,
  ]
    .slice(0, 5)
    .map((signal) => ({
      scenario: signal.scenario,
      metric: signal.metric_name,
      unit: signal.unit,
      historical_baseline_mean: signal.historicalMean.toFixed(2),
      previous_run_mean:
        previousValues
          .get(`${signal.scenario}||${signal.metric_name}`)
          ?.toFixed(2) ?? null,
      current: signal.current.toFixed(2),
      baseline_pct_change: `${(signal.pctChange * 100).toFixed(1)}%`,
      z: signal.zScore.toFixed(2),
      slope: `${(signal.slopePctPerRun * 100).toFixed(2)}%/run`,
    }));

  if (signals.length === 0) return null;

  return {
    currentRun: {
      runId: currentRun.run_id,
      commit: currentRun.commit_sha,
      sdkVersion: currentRun.sdk_version,
    },
    previousRun: {
      runId: prevRun.run_id,
      commit: prevRun.commit_sha,
      sdkVersion: prevRun.sdk_version,
    },
    commit_changed: currentRun.commit_sha !== prevRun.commit_sha,
    sdk_version_changed: currentRun.sdk_version !== prevRun.sdk_version,
    signals,
  };
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
  investigation: SDKInvestigation | null = null,
  investigationPending = false,
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

  const analysisWidgets: object[] = [];

  if (investigation) {
    const confidenceColor =
      investigation.confidence === "high"
        ? "#137333"
        : investigation.confidence === "medium"
          ? "#c26401"
          : "#444746";
    const evidenceText = investigation.evidence
      .map((item) => `• ${item}`)
      .join("<br>");
    const changedFilesText = investigation.changedFiles
      .filter(isSandboxSDKPath)
      .map((file) =>
        run.commit_sha
          ? `• <a href="${sandboxSDKFileUrl(run.commit_sha, file)}">${file}</a>`
          : `• <font color="#444746">${file}</font>`,
      )
      .join("<br>");

    const verdictLabel =
      investigation.verdict === "genuine"
        ? "⚠️ genuine regression"
        : investigation.verdict === "flaky"
          ? "🔀 likely flaky"
          : "❓ inconclusive";
    const verdictColor =
      investigation.verdict === "genuine"
        ? confidenceColor
        : investigation.verdict === "flaky"
          ? "#444746"
          : "#c26401";
    analysisWidgets.push({
      textParagraph: {
        text: `<b>SDK investigation</b> · <font color="${verdictColor}">${verdictLabel}</font> · ${investigation.confidence} confidence<br>${investigation.summary}`,
      },
    });
    if (evidenceText) {
      analysisWidgets.push({
        textParagraph: { text: `<b>Evidence</b><br>${evidenceText}` },
      });
    }
    if (changedFilesText) {
      analysisWidgets.push({
        textParagraph: { text: `<b>Relevant files</b><br>${changedFilesText}` },
      });
    }
  } else if (!investigationPending && insights?.justification) {
    analysisWidgets.push({
      textParagraph: { text: insights.justification },
    });
  }

  if (analysisWidgets.length > 0) {
    sections.push({
      header: "Analysis",
      collapsible: true,
      uncollapsibleWidgetsCount: 0,
      widgets: analysisWidgets,
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

function buildInvestigationFollowUpCard(
  summary: RunSummary,
  investigation: SDKInvestigation,
  dashboardUrl: string,
): object {
  const { run } = summary;
  const sha = run.commit_sha ? run.commit_sha.slice(0, 7) : "unknown";
  const baseUrl = dashboardUrl.replace(/\/$/, "");
  const confidenceColor =
    investigation.confidence === "high"
      ? "#137333"
      : investigation.confidence === "medium"
        ? "#c26401"
        : "#444746";
  const verdictLabel =
    investigation.verdict === "genuine"
      ? "\u26a0\ufe0f genuine regression"
      : investigation.verdict === "flaky"
        ? "\ud83d\udd00 likely flaky"
        : "\u2753 inconclusive";
  const verdictColor =
    investigation.verdict === "genuine"
      ? confidenceColor
      : investigation.verdict === "flaky"
        ? "#444746"
        : "#c26401";
  const widgets: object[] = [];
  widgets.push({
    textParagraph: {
      text: `<b>SDK investigation</b> \u00b7 <font color="${verdictColor}">${verdictLabel}</font> \u00b7 ${investigation.confidence} confidence<br>${investigation.summary}`,
    },
  });
  const evidenceText = investigation.evidence
    .map((e) => `\u2022 ${e}`)
    .join("<br>");
  if (evidenceText) {
    widgets.push({
      textParagraph: { text: `<b>Evidence</b><br>${evidenceText}` },
    });
  }
  const changedFilesText = investigation.changedFiles
    .filter(isSandboxSDKPath)
    .map((file) =>
      run.commit_sha
        ? `\u2022 <a href="${sandboxSDKFileUrl(run.commit_sha, file)}">${file}</a>`
        : `\u2022 <font color="#444746">${file}</font>`,
    )
    .join("<br>");
  if (changedFilesText) {
    widgets.push({
      textParagraph: { text: `<b>Relevant files</b><br>${changedFilesText}` },
    });
  }
  return {
    cardsV2: [
      {
        cardId: `benchbox-investigation-${run.run_id}`,
        card: {
          header: {
            title: "SDK Investigation",
            subtitle: `${sha}${run.sdk_version ? ` \u00b7 SDK ${run.sdk_version}` : ""}`,
            imageUrl: `${baseUrl}/favicon.png`,
            imageType: "CIRCLE",
          },
          sections: [{ widgets }],
        },
      },
    ],
  };
}

async function runBackgroundInvestigation(
  env: Env,
  summary: RunSummary,
  investigationRequest: InvestigationRequest,
  threadName: string | null,
): Promise<void> {
  let investigation: SDKInvestigation | null = null;
  try {
    const investigator = env.SandboxSDKInvestigator.get(
      env.SandboxSDKInvestigator.idFromName(summary.run.run_id),
    );
    const resp = await investigator.fetch(
      "https://sandbox-sdk-investigator/investigate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(investigationRequest),
      },
    );
    if (resp.ok) {
      investigation = (await resp.json()) as SDKInvestigation | null;
    } else {
      console.error(`[notify] investigation failed: ${resp.status}`);
    }
  } catch (err) {
    console.error("[notify] background investigation error:", err);
    return;
  }
  if (!investigation) return;

  const followUp = buildInvestigationFollowUpCard(
    summary,
    investigation,
    env.DASHBOARD_URL,
  );
  const webhookUrl = threadName
    ? `${env.GOOGLE_CHAT_WEBHOOK_URL}&messageReplyOption=REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD`
    : env.GOOGLE_CHAT_WEBHOOK_URL;
  const body = threadName
    ? { ...followUp, thread: { name: threadName } }
    : followUp;
  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch((e) => console.error("[notify] follow-up post failed:", e));
}

// ---------------------------------------------------------------------------

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
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
        let previousRunId: string | undefined;
        try {
          const body = (await request.json()) as {
            run_id?: string;
            previous_run_id?: string;
          };
          runId = body.run_id;
          previousRunId = body.previous_run_id;
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
        const investigationRequest = await buildInvestigationRequest(
          env,
          summary,
          previousRunId,
        );

        // Post initial card immediately — investigation runs in background.
        const message = buildGoogleChatMessage(
          summary,
          env.DASHBOARD_URL,
          insights,
          null,
          investigationRequest != null,
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

        // Extract thread name from GChat response for threaded follow-up.
        let threadName: string | null = null;
        try {
          const gchatBody = (await gchatResp.json()) as {
            thread?: { name?: string };
          };
          threadName = gchatBody.thread?.name ?? null;
        } catch {
          // non-critical
        }

        // Fire investigation in background — returns 200 immediately.
        if (investigationRequest) {
          ctx.waitUntil(
            runBackgroundInvestigation(
              env,
              summary,
              investigationRequest,
              threadName,
            ),
          );
        }

        return json({
          ok: true,
          run_id: summary.run.run_id,
          previous_run_id: investigationRequest?.previousRun.runId ?? null,
          failures: summary.failures.length,
          short_term_regressions: summary.shortTermRegressions.length,
          short_term_improvements: summary.shortTermImprovements.length,
          long_term_regressions: summary.longTermRegressions.length,
          long_term_improvements: summary.longTermImprovements.length,
          sdk_investigation: investigationRequest != null,
          sdk_investigation_error: null,
        });
      }

      return notFound();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal error";
      return json({ error: message }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
