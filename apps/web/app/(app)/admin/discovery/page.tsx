import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { PipelineManualControls } from "@/components/admin/pipeline-manual-controls";

interface DiscoveryRow {
  id: string;
  crop: string;
  region: string;
  status: "pending" | "running" | "completed" | "error";
  sourcesFound: number;
  lastDiscoveredAt: string | null;
  createdAt: string;
}

interface IngestionStats {
  totalSources: number;
  totalChunks: number;
  pending: number;
  active: number;
  completed: number;
  error: number;
}

interface LatestModel {
  id: string;
  modelType: string;
  status: string;
  trainedAt: string;
  feedbackCount: number;
  ndcgScore: number | null;
  s3Uri: string | null;
}

interface ObservabilityEvent {
  id: string;
  pipeline: string;
  stage: string;
  severity: "info" | "warn" | "error";
  message: string;
  runId: string | null;
  sourceId: string | null;
  recommendationId?: string | null;
  userId?: string | null;
  url?: string | null;
  createdAt: string;
}

interface DiscoveryStatusResponse {
  stats: {
    total: number;
    pending: number;
    running: number;
    completed: number;
    error: number;
  };
  progress: {
    pct: number;
    sourcesTotal: number;
  };
  ingestion: IngestionStats;
  latestPremiumModel: LatestModel | null;
  observability: {
    available: boolean;
    counts24h: {
      info: number;
      warn: number;
      error: number;
    };
    counts24hByPipeline: Record<
      string,
      {
        info: number;
        warn: number;
        error: number;
      }
    >;
    recentEvents: ObservabilityEvent[];
  };
  latestModel: LatestModel | null;
  rows: DiscoveryRow[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

const DISCOVERY_STATUS_BADGE: Record<
  DiscoveryRow["status"],
  { label: string; variant: "secondary" | "outline" | "default" | "destructive" }
> = {
  pending: { label: "Pending", variant: "secondary" },
  running: { label: "Running", variant: "outline" },
  completed: { label: "Completed", variant: "default" },
  error: { label: "Error", variant: "destructive" },
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function fetchGatewayJson<T>(params: {
  baseUrl: string;
  path: string;
  accessToken: string;
  timeoutMs?: number;
}): Promise<T> {
  const { baseUrl, path, accessToken, timeoutMs = 8_000 } = params;
  if (!baseUrl) {
    throw new Error("API base URL is not configured");
  }

  const response = await fetch(`${baseUrl}${path}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      Accept: "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Gateway request failed (${response.status})`);
  }

  return (await response.json()) as T;
}

function StatCard({
  label,
  value,
  color = "text-foreground",
}: {
  label: string;
  value: number | string;
  color?: string;
}) {
  return (
    <Card className="text-center py-2">
      <CardHeader className="pb-1 pt-3 px-3">
        <CardTitle className={`text-2xl font-bold ${color}`}>{value}</CardTitle>
      </CardHeader>
      <CardContent className="pb-3 px-3">
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

export default async function DiscoveryStatusPage() {
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
  const accessToken = session?.access_token ?? "";
  const gatewayBase = (
    process.env.API_GATEWAY_URL ??
    process.env.NEXT_PUBLIC_API_GATEWAY_URL ??
    ""
  ).replace(/\/+$/, "");

  const [statusResult] = await Promise.allSettled([
    fetchGatewayJson<DiscoveryStatusResponse>({
      baseUrl: gatewayBase,
      path: "/api/v1/admin/discovery/status?pageSize=200",
      accessToken,
    }),
  ]);

  const statusError =
    statusResult.status === "rejected"
      ? statusResult.reason instanceof Error
        ? statusResult.reason.message
        : "Failed to load discovery status"
      : null;

  const data =
    statusResult.status === "fulfilled" ? statusResult.value : null;

  const stats = data?.stats ?? {
    total: 0,
    pending: 0,
    running: 0,
    completed: 0,
    error: 0,
  };
  const progress = data?.progress ?? { pct: 0, sourcesTotal: 0 };
  const ingestion = data?.ingestion ?? {
    totalSources: 0,
    totalChunks: 0,
    pending: 0,
    active: 0,
    completed: 0,
    error: 0,
  };
  const latestModel = data?.latestModel ?? null;
  const latestPremiumModel = data?.latestPremiumModel ?? null;
  const observability = data?.observability ?? {
    available: false,
    counts24h: {
      info: 0,
      warn: 0,
      error: 0,
    },
    counts24hByPipeline: {},
    recentEvents: [] as ObservabilityEvent[],
  };
  const rows = data?.rows ?? [];

  // How many combinations are left ÷ batch-size-per-minute (10 per 2 min)
  const runsRemaining = Math.ceil((stats.total - stats.completed) / 10);
  const scopedEvents = observability.recentEvents.filter(
    (event) => event.pipeline === "discovery" || event.pipeline === "learning"
  );
  const discoveryCounts = observability.counts24hByPipeline.discovery ?? {
    info: 0,
    warn: 0,
    error: 0,
  };
  const learningCounts = observability.counts24hByPipeline.learning ?? {
    info: 0,
    warn: 0,
    error: 0,
  };
  const scopedCounts = {
    info: discoveryCounts.info + learningCounts.info,
    warn: discoveryCounts.warn + learningCounts.warn,
    error: discoveryCounts.error + learningCounts.error,
  };

  return (
    <div className="container max-w-6xl py-6 px-4 sm:px-6 lg:px-8 space-y-8">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div>
        <Link
          href="/admin"
          className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4 mb-3 inline-block"
        >
          ← Admin
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Discovery Pipeline Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Discovery-only status: source discovery → ingestion → model training
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Compliance pipeline has its own dedicated dashboard at{" "}
          <Link
            href="/admin/compliance"
            className="underline underline-offset-4 hover:text-foreground"
          >
            /admin/compliance
          </Link>
          .
        </p>
      </div>

      {statusError && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="pt-5">
            <p className="text-sm text-destructive font-medium">Discovery status API unavailable</p>
            <p className="text-xs text-muted-foreground mt-1">
              {statusError}. Set `API_GATEWAY_URL` / `NEXT_PUBLIC_API_GATEWAY_URL`, then run Manual Pipeline Controls to bootstrap local data.
            </p>
          </CardContent>
        </Card>
      )}

      <PipelineManualControls mode="discovery" />

      {/* ══ Phase 1: Source Discovery ════════════════════════════════════════ */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Phase 1
          </span>
          <h2 className="text-lg font-semibold">Source Discovery</h2>
          <Badge variant="outline" className="text-xs ml-auto">
            Gemini 2.5 Flash · every 2 min
          </Badge>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard label="Total" value={stats.total} />
          <StatCard label="Pending" value={stats.pending} color="text-muted-foreground" />
          <StatCard label="Running" value={stats.running} color="text-blue-600" />
          <StatCard label="Completed" value={stats.completed} color="text-green-600" />
          <StatCard label="Error" value={stats.error} color="text-destructive" />
        </div>

        {/* Progress bar */}
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between mb-2 text-sm">
              <span className="font-medium">{progress.pct}% complete</span>
              <span className="text-muted-foreground">
                {progress.sourcesTotal.toLocaleString()} URLs collected
              </span>
            </div>
            <Progress value={progress.pct} className="h-2" />
            <p className="text-xs text-muted-foreground mt-2">
              {stats.completed} of {stats.total} combinations processed
              {stats.error > 0 && ` · ${stats.error} failed (will retry)`}
              {stats.total > stats.completed &&
                ` · ~${runsRemaining} runs remaining at current pace`}
            </p>
          </CardContent>
        </Card>
      </section>

      {/* ══ Phase 2: Content Ingestion ═══════════════════════════════════════ */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Phase 2
          </span>
          <h2 className="text-lg font-semibold">Content Ingestion</h2>
          <Badge variant="outline" className="text-xs ml-auto">
            Scrape → Chunk → Embed · daily 12:00 PM PST
          </Badge>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard
            label="Total Sources"
            value={ingestion.totalSources.toLocaleString()}
          />
          <StatCard
            label="Chunks"
            value={ingestion.totalChunks.toLocaleString()}
            color="text-green-600"
          />
          <StatCard
            label="Pending"
            value={ingestion.pending}
            color="text-muted-foreground"
          />
          <StatCard
            label="Active"
            value={ingestion.active}
            color="text-blue-600"
          />
          <StatCard
            label="Ingested"
            value={ingestion.completed}
            color="text-green-600"
          />
          <StatCard
            label="Error"
            value={ingestion.error}
            color="text-destructive"
          />
        </div>

        {ingestion.totalSources > 0 && (
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center justify-between mb-2 text-sm">
                <span className="font-medium">
                  {ingestion.totalSources > 0
                    ? Math.round((ingestion.completed / ingestion.totalSources) * 100)
                    : 0}
                  % ingested
                </span>
                <span className="text-muted-foreground">
                  {ingestion.totalChunks.toLocaleString()} chunks embedded
                </span>
              </div>
              <Progress
                value={
                  ingestion.totalSources > 0
                    ? (ingestion.completed / ingestion.totalSources) * 100
                    : 0
                }
                className="h-2"
              />
            </CardContent>
          </Card>
        )}
      </section>

      {/* ══ Observability & Separation ═══════════════════════════════════════ */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Ops
          </span>
          <h2 className="text-lg font-semibold">Observability</h2>
          <Link
            href="/admin/compliance"
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 ml-auto"
          >
            Open Compliance Dashboard →
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Events (24h)"
            value={scopedCounts.info + scopedCounts.warn + scopedCounts.error}
          />
          <StatCard label="Errors (24h)" value={scopedCounts.error} color="text-destructive" />
          <StatCard label="Warnings (24h)" value={scopedCounts.warn} color="text-yellow-600" />
          <StatCard label="Info (24h)" value={scopedCounts.info} color="text-blue-600" />
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recent Pipeline Events</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
          {scopedEvents.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">
              No observability events recorded yet.
            </p>
          ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">When</th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Pipeline</th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Stage</th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Severity</th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scopedEvents.slice(0, 40).map((row, index) => {
                      const severityVariant =
                        row.severity === "error"
                          ? "destructive"
                          : row.severity === "warn"
                            ? "outline"
                            : "secondary";
                      return (
                        <tr
                          key={row.id}
                          className={`border-b last:border-0 ${index % 2 === 0 ? "" : "bg-muted/20"}`}
                        >
                          <td className="px-4 py-2 text-xs text-muted-foreground">
                            {formatDate(row.createdAt)}
                          </td>
                          <td className="px-4 py-2 font-medium">{row.pipeline}</td>
                          <td className="px-4 py-2 text-xs text-muted-foreground">{row.stage}</td>
                          <td className="px-4 py-2">
                            <Badge variant={severityVariant} className="text-xs">
                              {row.severity}
                            </Badge>
                          </td>
                          <td className="px-4 py-2 text-xs">
                            <p className="line-clamp-2">{row.message}</p>
                            {row.url && (
                              <p className="text-muted-foreground truncate mt-0.5">{row.url}</p>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ══ Phase 3: ML Model Training ═══════════════════════════════════════ */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Phase 3
          </span>
          <h2 className="text-lg font-semibold">ML Model Training</h2>
          <Badge variant="outline" className="text-xs ml-auto">
            LambdaRank + Premium Quality · scheduled + feedback-triggered
          </Badge>
        </div>

        {latestModel ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Retrieval Model</CardTitle>
              </CardHeader>
              <CardContent className="pt-1 pb-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Status</p>
                    <Badge
                      variant={
                        latestModel.status === "deployed"
                          ? "default"
                          : latestModel.status === "training"
                            ? "outline"
                            : "secondary"
                      }
                    >
                      {latestModel.status}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Model type</p>
                    <p className="font-medium">{latestModel.modelType}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Trained at</p>
                    <p className="font-medium">{formatDate(latestModel.trainedAt)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">NDCG score</p>
                    <p className="font-medium">
                      {latestModel.ndcgScore != null
                        ? latestModel.ndcgScore.toFixed(4)
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Feedback samples</p>
                    <p className="font-medium">{latestModel.feedbackCount.toLocaleString()}</p>
                  </div>
                  {latestModel.s3Uri && (
                    <div className="col-span-2 sm:col-span-3">
                      <p className="text-xs text-muted-foreground mb-1">S3 artifact</p>
                      <p className="font-mono text-xs text-muted-foreground truncate">
                        {latestModel.s3Uri}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Premium Model</CardTitle>
              </CardHeader>
              <CardContent className="pt-1 pb-4">
                <div>
                  {latestPremiumModel ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Status</p>
                        <Badge
                          variant={
                            latestPremiumModel.status === "deployed"
                              ? "default"
                              : latestPremiumModel.status === "training"
                                ? "outline"
                                : "secondary"
                          }
                        >
                          {latestPremiumModel.status}
                        </Badge>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Model type</p>
                        <p className="font-medium">{latestPremiumModel.modelType}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Trained at</p>
                        <p className="font-medium">{formatDate(latestPremiumModel.trainedAt)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Feedback samples</p>
                        <p className="font-medium">
                          {latestPremiumModel.feedbackCount.toLocaleString()}
                        </p>
                      </div>
                      {latestPremiumModel.s3Uri && (
                        <div className="col-span-2 sm:col-span-4">
                          <p className="text-xs text-muted-foreground mb-1">S3 artifact</p>
                          <p className="font-mono text-xs text-muted-foreground truncate">
                            {latestPremiumModel.s3Uri}
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No premium model training run yet. Premium training is triggered by feedback on
                      recommendations with premium insights.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground text-sm">
              No retrieval model trained yet. Feedback-triggered retraining starts once thresholds
              are met.
            </CardContent>
          </Card>
        )}
      </section>

      {/* ══ Combinations table ═══════════════════════════════════════════════ */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Crop × Region Combinations</h2>
          {data?.pagination && (
            <span className="text-sm text-muted-foreground ml-auto">
              {data.pagination.total} total
            </span>
          )}
        </div>

        <Card>
          <CardContent className="px-0 pb-0">
            {rows.length === 0 ? (
              <p className="text-center text-muted-foreground py-12 text-sm">
                {statusResult.status === "rejected"
                  ? "Could not load discovery data — API Gateway may not be configured."
                  : "No combinations found."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">
                        Crop
                      </th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">
                        Region
                      </th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">
                        Status
                      </th>
                      <th className="text-right px-4 py-2 font-medium text-muted-foreground">
                        Sources
                      </th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">
                        Last Run
                      </th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground hidden lg:table-cell">
                        Created
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => {
                      const badge = DISCOVERY_STATUS_BADGE[row.status];
                      return (
                        <tr
                          key={row.id}
                          className={`border-b last:border-0 ${
                            i % 2 === 0 ? "" : "bg-muted/20"
                          }`}
                        >
                          <td className="px-4 py-2 font-medium capitalize">{row.crop}</td>
                          <td className="px-4 py-2 text-muted-foreground">{row.region}</td>
                          <td className="px-4 py-2">
                            <Badge variant={badge.variant} className="text-xs">
                              {badge.label}
                            </Badge>
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">
                            {row.sourcesFound > 0 ? (
                              <span className="text-green-600 font-medium">
                                {row.sourcesFound}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-muted-foreground text-xs">
                            {formatDate(row.lastDiscoveredAt)}
                          </td>
                          <td className="px-4 py-2 text-muted-foreground text-xs hidden lg:table-cell">
                            {formatDate(row.createdAt)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
