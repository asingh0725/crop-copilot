import { createClient } from "@/lib/supabase/server";
import { createApiClient } from "@/lib/api-client";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

// ── Types ────────────────────────────────────────────────────────────────────

interface Analytics {
  users: number;
  inputs: number;
  recommendations: number;
  avgConfidence: number | null;
  feedback: number;
  helpfulFeedback: number;
  evaluations: number;
  avgEvalScore: number | null;
}

interface ErrorSource {
  id: string;
  title: string | null;
  url: string;
  errorMessage: string | null;
  updatedAt: string;
}

interface AdminStatusResponse {
  stats: { total: number; pending: number; running: number; completed: number; error: number };
  progress: { pct: number; sourcesTotal: number };
  ingestion: {
    totalSources: number;
    totalChunks: number;
    pending: number;
    active: number;
    completed: number;
    error: number;
  };
  latestModel: {
    modelType: string;
    status: string;
    trainedAt: string;
    ndcgScore: number | null;
    feedbackCount: number;
  } | null;
  analytics: Analytics;
  errors: { sources: { count: number; sample: ErrorSource[] } };
}

interface HealthResponse {
  status: string;
  service: string;
  timestamp: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, decimals = 0): string {
  if (n == null) return "—";
  return decimals > 0 ? n.toFixed(decimals) : n.toLocaleString();
}

function pct(n: number, total: number): string {
  if (!total) return "0%";
  return `${Math.round((n / total) * 100)}%`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function StatCard({
  label,
  value,
  sub,
  color = "text-foreground",
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <Card className="text-center py-2">
      <CardHeader className="pb-1 pt-3 px-3">
        <CardTitle className={`text-2xl font-bold ${color}`}>{value}</CardTitle>
      </CardHeader>
      <CardContent className="pb-3 px-3 space-y-0.5">
        <p className="text-xs text-muted-foreground">{label}</p>
        {sub && <p className="text-xs text-muted-foreground/70">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  if (!adminEmails.includes(user.email ?? "")) redirect("/dashboard");

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const client = createApiClient(session?.access_token ?? "");

  // Fetch admin status + health check in parallel
  const gatewayBase =
    process.env.API_GATEWAY_URL ?? process.env.NEXT_PUBLIC_API_GATEWAY_URL ?? "";

  const [statusResult, healthResult] = await Promise.allSettled([
    client.get<AdminStatusResponse>("/api/v1/admin/discovery/status?pageSize=1"),
    (async () => {
      const start = Date.now();
      const res = await fetch(`${gatewayBase}/api/v1/health`, {
        signal: AbortSignal.timeout(5_000),
        cache: "no-store",
      });
      const latencyMs = Date.now() - start;
      const body = (await res.json()) as HealthResponse;
      return { ok: res.ok, latencyMs, body };
    })(),
  ]);

  const data = statusResult.status === "fulfilled" ? statusResult.value : null;
  const health = healthResult.status === "fulfilled" ? healthResult.value : null;
  const healthOk = health?.ok ?? false;

  const analytics: Analytics = data?.analytics ?? {
    users: 0,
    inputs: 0,
    recommendations: 0,
    avgConfidence: null,
    feedback: 0,
    helpfulFeedback: 0,
    evaluations: 0,
    avgEvalScore: null,
  };

  const ingestion = data?.ingestion ?? {
    totalSources: 0,
    totalChunks: 0,
    pending: 0,
    active: 0,
    completed: 0,
    error: 0,
  };
  const discoveryStats = data?.stats ?? {
    total: 0,
    pending: 0,
    running: 0,
    completed: 0,
    error: 0,
  };
  const errorSources = data?.errors?.sources ?? { count: 0, sample: [] };
  const helpfulRate =
    analytics.feedback > 0
      ? Math.round((analytics.helpfulFeedback / analytics.feedback) * 100)
      : null;

  return (
    <div className="container max-w-6xl py-6 px-4 sm:px-6 lg:px-8 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Admin</h1>
          <p className="text-muted-foreground text-sm mt-1">
            App health, analytics, and pipeline status
          </p>
        </div>
        <p className="text-xs text-muted-foreground pt-1">
          Loaded {new Date().toLocaleTimeString("en-US", { timeZoneName: "short" })}
        </p>
      </div>

      {/* ══ API Health ═══════════════════════════════════════════════════════ */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">API Health</h2>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              {/* Status indicator */}
              <div className="flex items-center gap-3">
                <span
                  className={`inline-block w-3 h-3 rounded-full ${
                    healthOk ? "bg-green-500" : "bg-red-500"
                  }`}
                />
                <span className="font-medium">
                  {healthOk ? "Operational" : health === null ? "Unreachable" : "Degraded"}
                </span>
                <Badge variant={healthOk ? "default" : "destructive"} className="text-xs">
                  {healthOk ? "OK" : "DOWN"}
                </Badge>
              </div>

              {/* Latency */}
              {health && (
                <div className="text-sm text-muted-foreground sm:ml-auto flex gap-6">
                  <span>
                    Latency:{" "}
                    <span
                      className={`font-medium ${
                        health.latencyMs < 500
                          ? "text-green-600"
                          : health.latencyMs < 1500
                          ? "text-yellow-600"
                          : "text-destructive"
                      }`}
                    >
                      {health.latencyMs} ms
                    </span>
                  </span>
                  <span>
                    Service:{" "}
                    <span className="font-medium font-mono text-xs">{health.body.service}</span>
                  </span>
                  <span>
                    Checked:{" "}
                    <span className="font-medium">{timeAgo(health.body.timestamp)}</span>
                  </span>
                </div>
              )}

              {!health && (
                <p className="text-sm text-muted-foreground sm:ml-auto">
                  Could not reach{" "}
                  <span className="font-mono text-xs">{gatewayBase}/api/v1/health</span>
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ══ App Analytics ════════════════════════════════════════════════════ */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">App Analytics</h2>

        {/* User + activity counts */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Users" value={fmt(analytics.users)} />
          <StatCard label="Diagnoses" value={fmt(analytics.inputs)} />
          <StatCard
            label="Recommendations"
            value={fmt(analytics.recommendations)}
            sub={
              analytics.avgConfidence != null
                ? `avg ${Math.round(analytics.avgConfidence * 100)}% confidence`
                : undefined
            }
          />
          <StatCard
            label="Feedback"
            value={fmt(analytics.feedback)}
            sub={helpfulRate != null ? `${helpfulRate}% helpful` : undefined}
          />
        </div>

        {/* Quality metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card>
            <CardContent className="pt-4 pb-4 px-4">
              <p className="text-xs text-muted-foreground mb-1">Avg Recommendation Confidence</p>
              {analytics.avgConfidence != null ? (
                <>
                  <p className="text-xl font-bold">
                    {Math.round(analytics.avgConfidence * 100)}%
                  </p>
                  <Progress
                    value={analytics.avgConfidence * 100}
                    className="h-1.5 mt-2"
                  />
                </>
              ) : (
                <p className="text-xl font-bold text-muted-foreground">—</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-4 px-4">
              <p className="text-xs text-muted-foreground mb-1">Helpful Rate</p>
              {helpfulRate != null ? (
                <>
                  <p className="text-xl font-bold">{helpfulRate}%</p>
                  <Progress value={helpfulRate} className="h-1.5 mt-2" />
                  <p className="text-xs text-muted-foreground mt-1">
                    {fmt(analytics.helpfulFeedback)} of {fmt(analytics.feedback)} responses
                  </p>
                </>
              ) : (
                <p className="text-xl font-bold text-muted-foreground">—</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-4 px-4">
              <p className="text-xs text-muted-foreground mb-1">LLM-Judge Evaluations</p>
              <p className="text-xl font-bold">{fmt(analytics.evaluations)}</p>
              {analytics.avgEvalScore != null && (
                <>
                  <Progress value={(analytics.avgEvalScore / 5) * 100} className="h-1.5 mt-2" />
                  <p className="text-xs text-muted-foreground mt-1">
                    avg score {fmt(analytics.avgEvalScore, 2)} / 5
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ══ Error Overview ═══════════════════════════════════════════════════ */}
      <section className="space-y-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Errors</h2>
          {errorSources.count > 0 && (
            <Badge variant="destructive" className="text-xs">
              {errorSources.count} source{errorSources.count !== 1 ? "s" : ""} failed
            </Badge>
          )}
        </div>

        {errorSources.count === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              No source errors — all scraped content is healthy.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="px-0 pb-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">
                        Source
                      </th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground hidden md:table-cell">
                        Error
                      </th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">
                        Last tried
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {errorSources.sample.map((src, i) => (
                      <tr
                        key={src.id}
                        className={`border-b last:border-0 ${i % 2 === 0 ? "" : "bg-muted/20"}`}
                      >
                        <td className="px-4 py-2 max-w-xs">
                          <p className="font-medium truncate">{src.title ?? "Untitled"}</p>
                          <p className="text-xs text-muted-foreground truncate">{src.url}</p>
                        </td>
                        <td className="px-4 py-2 text-xs text-destructive hidden md:table-cell max-w-sm">
                          <span className="line-clamp-2">{src.errorMessage ?? "Unknown error"}</span>
                        </td>
                        <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">
                          {timeAgo(src.updatedAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {errorSources.count > errorSources.sample.length && (
                <p className="text-xs text-muted-foreground px-4 py-3 border-t">
                  Showing {errorSources.sample.length} of {errorSources.count} errored sources.
                  Errors are retried automatically on the next ingestion run.
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </section>

      {/* ══ Pipeline Summary ═════════════════════════════════════════════════ */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Automated Pipeline</h2>
          <Link
            href="/admin/discovery"
            className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4"
          >
            View full pipeline →
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Phase 1 */}
          <Card>
            <CardContent className="pt-4 pb-4 px-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Phase 1
                </p>
                <Badge variant="outline" className="text-xs">
                  every 2 min
                </Badge>
              </div>
              <p className="font-medium text-sm">Source Discovery</p>
              <Progress value={data?.progress.pct ?? 0} className="h-1.5" />
              <p className="text-xs text-muted-foreground">
                {discoveryStats.completed} / {discoveryStats.total} combinations ·{" "}
                {data?.progress.pct ?? 0}% done
              </p>
              {discoveryStats.error > 0 && (
                <p className="text-xs text-destructive">{discoveryStats.error} errors (auto-retry)</p>
              )}
            </CardContent>
          </Card>

          {/* Phase 2 */}
          <Card>
            <CardContent className="pt-4 pb-4 px-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Phase 2
                </p>
                <Badge variant="outline" className="text-xs">
                  12:00 PM PST
                </Badge>
              </div>
              <p className="font-medium text-sm">Content Ingestion</p>
              <Progress
                value={
                  ingestion.totalSources > 0
                    ? (ingestion.completed / ingestion.totalSources) * 100
                    : 0
                }
                className="h-1.5"
              />
              <p className="text-xs text-muted-foreground">
                {fmt(ingestion.completed)} ready · {fmt(ingestion.totalChunks)} chunks
              </p>
              {ingestion.error > 0 && (
                <p className="text-xs text-destructive">{ingestion.error} errors</p>
              )}
            </CardContent>
          </Card>

          {/* Phase 3 */}
          <Card>
            <CardContent className="pt-4 pb-4 px-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Phase 3
                </p>
                <Badge variant="outline" className="text-xs">
                  nightly 02:00 UTC
                </Badge>
              </div>
              <p className="font-medium text-sm">ML Training</p>
              {data?.latestModel ? (
                <>
                  <Badge
                    variant={
                      data.latestModel.status === "deployed"
                        ? "default"
                        : data.latestModel.status === "training"
                        ? "outline"
                        : "secondary"
                    }
                    className="text-xs"
                  >
                    {data.latestModel.status}
                  </Badge>
                  <p className="text-xs text-muted-foreground">
                    {data.latestModel.modelType} ·{" "}
                    {data.latestModel.ndcgScore != null
                      ? `NDCG ${data.latestModel.ndcgScore.toFixed(3)}`
                      : "no score yet"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {timeAgo(data.latestModel.trainedAt)} · {fmt(data.latestModel.feedbackCount)} samples
                  </p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No model yet — needs 50+ feedback samples.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
