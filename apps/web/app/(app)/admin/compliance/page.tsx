import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ComplianceAutoRefresh } from "@/components/admin/compliance-auto-refresh";
import { PipelineManualControls } from "@/components/admin/pipeline-manual-controls";

interface ComplianceStatusResponse {
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
    } | null;
    errors: {
      count: number;
      sample: Array<{
        id: string;
        title: string;
        url: string;
        state: string | null;
        crop: string | null;
        errorMessage: string | null;
        updatedAt: string;
      }>;
    };
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
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatAgo(iso: string | null): string {
  if (!iso) return "—";
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = Math.max(0, now - then);
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatDuration(startedAt: string, endedAt: string | null): string {
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return "—";
  }

  const mins = Math.round((end - start) / 60_000);
  if (mins < 1) return "<1m";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

function runStatusBadge(status: string): { label: string; variant: "default" | "outline" | "destructive" | "secondary" } {
  if (status === "completed") return { label: "completed", variant: "default" };
  if (status === "running") return { label: "running", variant: "outline" };
  if (status === "failed") return { label: "failed", variant: "destructive" };
  return { label: status, variant: "secondary" };
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

export default async function ComplianceDashboardPage() {
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

  const gatewayBase = (
    process.env.API_GATEWAY_URL ??
    process.env.NEXT_PUBLIC_API_GATEWAY_URL ??
    ""
  ).replace(/\/+$/, "");

  const [statusResult] = await Promise.allSettled([
    fetchGatewayJson<ComplianceStatusResponse>({
      baseUrl: gatewayBase,
      path: "/api/v1/admin/discovery/status?pageSize=200",
      accessToken: session?.access_token ?? "",
    }),
  ]);

  const statusError =
    statusResult.status === "rejected"
      ? statusResult.reason instanceof Error
        ? statusResult.reason.message
        : "Failed to load compliance status"
      : null;

  const compliance = statusResult.status === "fulfilled"
    ? statusResult.value.compliance
    : undefined;

  const model = compliance ?? {
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
    errors: { count: 0, sample: [] },
    recentRuns: [],
    discoveryRows: [],
    sourceRows: [],
  };

  const runningNow =
    model.discovery.running > 0 ||
    model.ingestion.running > 0 ||
    model.recentRuns.some((run) => run.status === "running");

  const latestFailure = model.errors.sample[0] ?? null;
  const discoveryErrors = model.discoveryRows.filter((row) => row.status === "error");
  const sourceErrors = model.sourceRows.filter((row) => row.status === "error");

  return (
    <div className="container max-w-7xl py-6 px-4 sm:px-6 lg:px-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/admin"
            className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4 mb-2 inline-block"
          >
            ← Admin
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Compliance Pipeline Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Explicit run status, failure location, and retry visibility.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={model.available ? "default" : "secondary"}>
            {model.available ? "active" : "not initialized"}
          </Badge>
          <Badge variant={runningNow ? "outline" : "secondary"}>
            {runningNow ? "retry/runs in progress" : "idle"}
          </Badge>
          <Badge variant={model.errors.count > 0 ? "destructive" : "default"}>
            {model.errors.count} source errors
          </Badge>
        </div>
      </div>

      {statusError && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="pt-5">
            <p className="text-sm text-destructive font-medium">Compliance status API unavailable</p>
            <p className="text-xs text-muted-foreground mt-1">
              {statusError}. Set `API_GATEWAY_URL` / `NEXT_PUBLIC_API_GATEWAY_URL`, then run Manual Pipeline Controls to bootstrap local data.
            </p>
          </CardContent>
        </Card>
      )}

      <ComplianceAutoRefresh intervalMs={30_000} />

      <PipelineManualControls />

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <Card className="text-center py-2">
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="text-2xl font-bold">{model.coverage.totalCells}</CardTitle>
          </CardHeader>
          <CardContent className="pb-3 px-3 text-xs text-muted-foreground">Coverage cells</CardContent>
        </Card>
        <Card className="text-center py-2">
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="text-2xl font-bold text-green-600">{model.coverage.coveredCells}</CardTitle>
          </CardHeader>
          <CardContent className="pb-3 px-3 text-xs text-muted-foreground">Covered cells</CardContent>
        </Card>
        <Card className="text-center py-2">
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="text-2xl font-bold">{model.discovery.progressPct}%</CardTitle>
          </CardHeader>
          <CardContent className="pb-3 px-3 text-xs text-muted-foreground">Discovery complete</CardContent>
        </Card>
        <Card className="text-center py-2">
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="text-2xl font-bold text-green-600">{model.ingestion.indexed}</CardTitle>
          </CardHeader>
          <CardContent className="pb-3 px-3 text-xs text-muted-foreground">Indexed sources</CardContent>
        </Card>
        <Card className="text-center py-2">
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="text-2xl font-bold text-blue-600">{model.ingestion.running}</CardTitle>
          </CardHeader>
          <CardContent className="pb-3 px-3 text-xs text-muted-foreground">Sources running</CardContent>
        </Card>
        <Card className="text-center py-2">
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="text-2xl font-bold text-muted-foreground">{model.ingestion.pending}</CardTitle>
          </CardHeader>
          <CardContent className="pb-3 px-3 text-xs text-muted-foreground">Sources pending</CardContent>
        </Card>
        <Card className="text-center py-2">
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="text-2xl font-bold">{model.ingestion.totalChunks}</CardTitle>
          </CardHeader>
          <CardContent className="pb-3 px-3 text-xs text-muted-foreground">Chunks</CardContent>
        </Card>
        <Card className="text-center py-2">
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="text-2xl font-bold">{model.ingestion.totalFacts}</CardTitle>
          </CardHeader>
          <CardContent className="pb-3 px-3 text-xs text-muted-foreground">Facts extracted</CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Current Execution State</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Run activity:</span>
              <Badge variant={runningNow ? "outline" : "secondary"}>
                {runningNow ? "Active now" : "No active run"}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <span>Discovery running: {model.discovery.running}</span>
              <span>Discovery pending: {model.discovery.pending}</span>
              <span>Source running: {model.ingestion.running}</span>
              <span>Source pending: {model.ingestion.pending}</span>
            </div>
            <Progress
              value={
                model.ingestion.totalSources > 0
                  ? (model.ingestion.indexed / model.ingestion.totalSources) * 100
                  : 0
              }
              className="h-2"
            />
            <p className="text-xs text-muted-foreground">
              {model.ingestion.indexed}/{model.ingestion.totalSources} sources indexed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Latest Failure Detail</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {latestFailure ? (
              <>
                <div className="flex items-center gap-2">
                  <Badge variant="destructive">failed</Badge>
                  <span className="text-muted-foreground">{formatAgo(latestFailure.updatedAt)}</span>
                </div>
                <p className="font-medium">{latestFailure.title || "Untitled source"}</p>
                <p className="text-xs text-muted-foreground break-all">{latestFailure.url}</p>
                <p className="text-xs text-muted-foreground">
                  {[latestFailure.state, latestFailure.crop].filter(Boolean).join(" · ") || "—"}
                </p>
                <p className="text-xs text-destructive">
                  {latestFailure.errorMessage || "Unknown parser/ingestion error"}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No source failure sampled from recent data.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recent Runs</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {model.recentRuns.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No runs recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Trigger</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Started</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Duration</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground">Processed</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground">Errors</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground">Facts</th>
                  </tr>
                </thead>
                <tbody>
                  {model.recentRuns.map((run, index) => {
                    const badge = runStatusBadge(run.status);
                    return (
                      <tr
                        key={run.id}
                        className={`border-b last:border-0 ${index % 2 === 0 ? "" : "bg-muted/20"}`}
                      >
                        <td className="px-4 py-2">
                          <Badge variant={badge.variant} className="text-xs">
                            {badge.label}
                          </Badge>
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">{run.trigger}</td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">{formatDate(run.startedAt)}</td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">{formatDuration(run.startedAt, run.endedAt)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{run.sourcesProcessed}/{run.sourcesQueued}</td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          <span className={run.errors > 0 ? "text-destructive font-medium" : ""}>{run.errors}</span>
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">{run.factsExtracted}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Failed Sources (Where It Failed)</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {sourceErrors.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No failed sources right now.</p>
            ) : (
              <div className="max-h-[26rem] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/60 backdrop-blur">
                    <tr className="border-b">
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Source</th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Location</th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Failure</th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sourceErrors.map((row, index) => (
                      <tr key={row.id} className={`border-b last:border-0 ${index % 2 === 0 ? "" : "bg-muted/20"}`}>
                        <td className="px-4 py-2 max-w-xs">
                          <p className="font-medium truncate">{row.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{row.url}</p>
                        </td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">
                          {[row.state, row.crop].filter(Boolean).join(" · ") || "—"}
                        </td>
                        <td className="px-4 py-2 text-xs text-destructive max-w-sm">
                          <span className="line-clamp-2">{row.errorMessage || "Unknown error"}</span>
                        </td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">{formatDate(row.updatedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Discovery Cells Needing Attention</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {discoveryErrors.length === 0 && model.discovery.pending === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No errored or pending cells.</p>
            ) : (
              <div className="max-h-[26rem] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/60 backdrop-blur">
                    <tr className="border-b">
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">State</th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Crop</th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Status</th>
                      <th className="text-right px-4 py-2 font-medium text-muted-foreground">URLs</th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Last Run</th>
                    </tr>
                  </thead>
                  <tbody>
                    {model.discoveryRows
                      .filter((row) => row.status === "error" || row.status === "pending" || row.status === "running")
                      .map((row, index) => {
                        const badge =
                          row.status === "error"
                            ? { label: "error", variant: "destructive" as const }
                            : row.status === "running"
                            ? { label: "running", variant: "outline" as const }
                            : { label: "pending", variant: "secondary" as const };

                        return (
                          <tr key={row.id} className={`border-b last:border-0 ${index % 2 === 0 ? "" : "bg-muted/20"}`}>
                            <td className="px-4 py-2 text-muted-foreground">{row.state}</td>
                            <td className="px-4 py-2 font-medium capitalize">{row.crop}</td>
                            <td className="px-4 py-2">
                              <Badge variant={badge.variant} className="text-xs">{badge.label}</Badge>
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums">{row.sourcesFound}</td>
                            <td className="px-4 py-2 text-xs text-muted-foreground">{formatDate(row.lastDiscoveredAt)}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
