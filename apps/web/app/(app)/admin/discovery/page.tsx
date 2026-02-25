import { createClient } from "@/lib/supabase/server";
import { createApiClient } from "@/lib/api-client";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

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

  if (!user) {
    redirect("/login");
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const client = createApiClient(session?.access_token ?? "");

  const [statusResult] = await Promise.allSettled([
    client.get<DiscoveryStatusResponse>(
      "/api/v1/admin/discovery/status?pageSize=200"
    ),
  ]);

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
  const rows = data?.rows ?? [];

  // How many combinations are left ÷ batch-size-per-minute (10 per 2 min)
  const runsRemaining = Math.ceil((stats.total - stats.completed) / 10);

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
        <h1 className="text-2xl font-bold tracking-tight">Pipeline Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">
          End-to-end status: source discovery → ingestion → ML training
        </p>
      </div>

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

      {/* ══ Phase 3: ML Model Training ═══════════════════════════════════════ */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Phase 3
          </span>
          <h2 className="text-lg font-semibold">ML Model Training</h2>
          <Badge variant="outline" className="text-xs ml-auto">
            LightGBM LambdaRank · nightly 02:00 UTC
          </Badge>
        </div>

        {latestModel ? (
          <Card>
            <CardContent className="pt-5 pb-4">
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
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground text-sm">
              No model trained yet. The nightly retraining job requires at least 50 feedback
              samples.
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
