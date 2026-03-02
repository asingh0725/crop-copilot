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
  compliance?: {
    available: boolean;
    discovery: {
      total: number;
      pending: number;
      running: number;
      completed: number;
      error: number;
      sourcesTotal: number;
      progressPct: number;
    };
    ingestion: {
      totalSources: number;
      pending: number;
      running: number;
      indexed: number;
      error: number;
      totalChunks: number;
      totalFacts: number;
    };
    coverage: {
      totalCells: number;
      coveredCells: number;
      avgCoverageScore: number;
      staleCells: number;
    };
    latestRun: {
      status: string;
      trigger: string;
      startedAt: string;
      endedAt: string | null;
      sourcesQueued: number;
      sourcesProcessed: number;
      chunksCreated: number;
      factsExtracted: number;
      errors: number;
    } | null;
    recentRuns: Array<{
      id: string;
      status: string;
      trigger: string;
      startedAt: string;
      endedAt: string | null;
      sourcesQueued: number;
      sourcesProcessed: number;
      chunksCreated: number;
      factsExtracted: number;
      errors: number;
    }>;
    discoveryRows: Array<{
      id: string;
      state: string;
      crop: string;
      status: string;
      sourcesFound: number;
      lastDiscoveredAt: string | null;
      createdAt: string;
    }>;
    sourceRows: Array<{
      id: string;
      title: string;
      url: string;
      state: string | null;
      crop: string | null;
      status: string;
      chunksCount: number;
      factsCount: number;
      lastFetchedAt: string | null;
      lastIndexedAt: string | null;
      errorMessage: string | null;
      updatedAt: string;
    }>;
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

const COMPLIANCE_DISCOVERY_STATUS_BADGE: Record<
  "pending" | "running" | "completed" | "error",
  { label: string; variant: "secondary" | "outline" | "default" | "destructive" }
> = {
  pending: { label: "Pending", variant: "secondary" },
  running: { label: "Running", variant: "outline" },
  completed: { label: "Completed", variant: "default" },
  error: { label: "Error", variant: "destructive" },
};

const COMPLIANCE_SOURCE_STATUS_BADGE: Record<
  "pending" | "running" | "indexed" | "error",
  { label: string; variant: "secondary" | "outline" | "default" | "destructive" }
> = {
  pending: { label: "Pending", variant: "secondary" },
  running: { label: "Running", variant: "outline" },
  indexed: { label: "Indexed", variant: "default" },
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
  const rows = data?.rows ?? [];
  const compliance = data?.compliance ?? {
    available: false,
    discovery: {
      total: 0,
      pending: 0,
      running: 0,
      completed: 0,
      error: 0,
      sourcesTotal: 0,
      progressPct: 0,
    },
    ingestion: {
      totalSources: 0,
      pending: 0,
      running: 0,
      indexed: 0,
      error: 0,
      totalChunks: 0,
      totalFacts: 0,
    },
    coverage: {
      totalCells: 0,
      coveredCells: 0,
      avgCoverageScore: 0,
      staleCells: 0,
    },
    latestRun: null,
    recentRuns: [],
    discoveryRows: [],
    sourceRows: [],
  };
  const complianceDiscoveryRows = compliance.discoveryRows ?? [];
  const complianceSourceRows = compliance.sourceRows ?? [];
  const complianceRecentRuns = compliance.recentRuns ?? [];

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

      <PipelineManualControls />

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
            Phase 2B
          </span>
          <h2 className="text-lg font-semibold">Compliance Ingestion</h2>
          <Link
            href="/admin/compliance"
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 ml-auto mr-2"
          >
            detailed dashboard
          </Link>
          <Badge variant={compliance.available ? "default" : "secondary"} className="text-xs">
            {compliance.available ? "Active" : "Not initialized"}
          </Badge>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          <StatCard label="States × Crops" value={compliance.coverage.totalCells} />
          <StatCard label="Covered Cells" value={compliance.coverage.coveredCells} color="text-green-600" />
          <StatCard label="Discovery Done" value={`${compliance.discovery.progressPct}%`} />
          <StatCard label="Indexed Sources" value={compliance.ingestion.indexed} color="text-green-600" />
          <StatCard label="Pending" value={compliance.ingestion.pending} color="text-muted-foreground" />
          <StatCard label="Running" value={compliance.ingestion.running} color="text-blue-600" />
          <StatCard label="Chunks" value={compliance.ingestion.totalChunks} />
          <StatCard label="Facts" value={compliance.ingestion.totalFacts} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm">Compliance Discovery Queue</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 pb-4 space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {compliance.discovery.completed} / {compliance.discovery.total} completed
                </span>
                <span>{compliance.discovery.sourcesTotal} URLs discovered</span>
              </div>
              <Progress value={compliance.discovery.progressPct} className="h-2" />
              <div className="grid grid-cols-4 gap-2 text-xs text-muted-foreground">
                <span>pending {compliance.discovery.pending}</span>
                <span>running {compliance.discovery.running}</span>
                <span>done {compliance.discovery.completed}</span>
                <span className={compliance.discovery.error > 0 ? "text-destructive" : ""}>
                  error {compliance.discovery.error}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm">Compliance Source Processing</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 pb-4 space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {compliance.ingestion.indexed} / {compliance.ingestion.totalSources} indexed
                </span>
                <span>
                  {compliance.ingestion.totalChunks} chunks · {compliance.ingestion.totalFacts} facts
                </span>
              </div>
              <Progress
                value={
                  compliance.ingestion.totalSources > 0
                    ? (compliance.ingestion.indexed / compliance.ingestion.totalSources) * 100
                    : 0
                }
                className="h-2"
              />
              <div className="grid grid-cols-4 gap-2 text-xs text-muted-foreground">
                <span>pending {compliance.ingestion.pending}</span>
                <span>running {compliance.ingestion.running}</span>
                <span>indexed {compliance.ingestion.indexed}</span>
                <span className={compliance.ingestion.error > 0 ? "text-destructive" : ""}>
                  error {compliance.ingestion.error}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="pt-5 pb-4 space-y-2 text-sm">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-muted-foreground">
                Avg coverage score:{" "}
                <span className="font-medium text-foreground">
                  {compliance.coverage.avgCoverageScore.toFixed(2)}
                </span>
              </span>
              <span className="text-muted-foreground">
                Stale cells (&gt;72h):{" "}
                <span className={compliance.coverage.staleCells > 0 ? "font-medium text-yellow-600" : "font-medium text-foreground"}>
                  {compliance.coverage.staleCells}
                </span>
              </span>
            </div>
            {compliance.latestRun && (
              <div className="text-muted-foreground">
                Latest run: <span className="font-medium text-foreground">{compliance.latestRun.status}</span>{" "}
                ({compliance.latestRun.trigger}) · {compliance.latestRun.sourcesProcessed}/{compliance.latestRun.sourcesQueued} sources ·{" "}
                {compliance.latestRun.factsExtracted} facts extracted
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recent Compliance Runs</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {complianceRecentRuns.length === 0 ? (
              <p className="text-center text-muted-foreground py-10 text-sm">
                No compliance runs yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Status</th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Trigger</th>
                      <th className="text-right px-4 py-2 font-medium text-muted-foreground">Sources</th>
                      <th className="text-right px-4 py-2 font-medium text-muted-foreground">Chunks</th>
                      <th className="text-right px-4 py-2 font-medium text-muted-foreground">Facts</th>
                      <th className="text-right px-4 py-2 font-medium text-muted-foreground">Errors</th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Started</th>
                    </tr>
                  </thead>
                  <tbody>
                    {complianceRecentRuns.map((run, index) => {
                      const status =
                        run.status === "completed"
                          ? { label: "Completed", variant: "default" as const }
                          : run.status === "running"
                          ? { label: "Running", variant: "outline" as const }
                          : run.status === "failed"
                          ? { label: "Failed", variant: "destructive" as const }
                          : { label: run.status, variant: "secondary" as const };
                      return (
                        <tr
                          key={run.id}
                          className={`border-b last:border-0 ${index % 2 === 0 ? "" : "bg-muted/20"}`}
                        >
                          <td className="px-4 py-2">
                            <Badge variant={status.variant} className="text-xs">
                              {status.label}
                            </Badge>
                          </td>
                          <td className="px-4 py-2 text-muted-foreground capitalize">{run.trigger}</td>
                          <td className="px-4 py-2 text-right tabular-nums">
                            {run.sourcesProcessed}/{run.sourcesQueued}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">{run.chunksCreated}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{run.factsExtracted}</td>
                          <td className="px-4 py-2 text-right tabular-nums">
                            <span className={run.errors > 0 ? "text-destructive font-medium" : ""}>
                              {run.errors}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-xs text-muted-foreground">
                            {formatDate(run.startedAt)}
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

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Compliance Discovery Cells</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {complianceDiscoveryRows.length === 0 ? (
              <p className="text-center text-muted-foreground py-10 text-sm">
                No compliance discovery rows yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">State</th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Crop</th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Status</th>
                      <th className="text-right px-4 py-2 font-medium text-muted-foreground">URLs</th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Last Run</th>
                    </tr>
                  </thead>
                  <tbody>
                    {complianceDiscoveryRows.map((row, index) => {
                      const status =
                        COMPLIANCE_DISCOVERY_STATUS_BADGE[
                          (row.status as keyof typeof COMPLIANCE_DISCOVERY_STATUS_BADGE) ?? "pending"
                        ] ?? COMPLIANCE_DISCOVERY_STATUS_BADGE.pending;
                      return (
                        <tr
                          key={row.id}
                          className={`border-b last:border-0 ${index % 2 === 0 ? "" : "bg-muted/20"}`}
                        >
                          <td className="px-4 py-2 text-muted-foreground">{row.state}</td>
                          <td className="px-4 py-2 font-medium capitalize">{row.crop}</td>
                          <td className="px-4 py-2">
                            <Badge variant={status.variant} className="text-xs">
                              {status.label}
                            </Badge>
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">{row.sourcesFound}</td>
                          <td className="px-4 py-2 text-xs text-muted-foreground">
                            {formatDate(row.lastDiscoveredAt)}
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

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Compliance Sources</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {complianceSourceRows.length === 0 ? (
              <p className="text-center text-muted-foreground py-10 text-sm">
                No compliance sources yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Source</th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Status</th>
                      <th className="text-right px-4 py-2 font-medium text-muted-foreground">Chunks</th>
                      <th className="text-right px-4 py-2 font-medium text-muted-foreground">Facts</th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Last Indexed</th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground hidden xl:table-cell">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {complianceSourceRows.map((row, index) => {
                      const status =
                        COMPLIANCE_SOURCE_STATUS_BADGE[
                          (row.status as keyof typeof COMPLIANCE_SOURCE_STATUS_BADGE) ?? "pending"
                        ] ?? COMPLIANCE_SOURCE_STATUS_BADGE.pending;
                      return (
                        <tr
                          key={row.id}
                          className={`border-b last:border-0 ${index % 2 === 0 ? "" : "bg-muted/20"}`}
                        >
                          <td className="px-4 py-2 max-w-sm">
                            <p className="font-medium truncate">{row.title}</p>
                            <p className="text-xs text-muted-foreground truncate">{row.url}</p>
                            <p className="text-[11px] text-muted-foreground/80">
                              {[row.state, row.crop].filter(Boolean).join(" · ") || "—"}
                            </p>
                          </td>
                          <td className="px-4 py-2">
                            <Badge variant={status.variant} className="text-xs">
                              {status.label}
                            </Badge>
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">{row.chunksCount}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{row.factsCount}</td>
                          <td className="px-4 py-2 text-xs text-muted-foreground">
                            {formatDate(row.lastIndexedAt ?? row.lastFetchedAt)}
                          </td>
                          <td className="px-4 py-2 text-xs text-destructive hidden xl:table-cell max-w-xs">
                            <span className="line-clamp-2">{row.errorMessage ?? "—"}</span>
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
