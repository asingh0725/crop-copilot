"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Play, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getBrowserApiBase } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type PipelineKey = "discovery" | "compliance";
type StepKey =
  | "discover_sources"
  | "orchestrate_ingestion"
  | "process_ingestion_inline"
  | "ingest_source_url"
  | "force_reingest_all"
  | "seed_demo_data";

interface ExecutionSummary {
  pipeline: PipelineKey;
  step: StepKey;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  queueConfigured: boolean;
  inlineProcessing: boolean;
  orchestratedMessages: number;
  queuedSources: number;
  inlineProcessedMessages: number;
  inlineFailedMessages: number;
  notes: string[];
}

interface RunStepResponse {
  success: boolean;
  execution: ExecutionSummary;
}

function describeStep(step: StepKey): string {
  if (step === "discover_sources") return "Source discovery";
  if (step === "orchestrate_ingestion") return "Ingestion orchestration";
  if (step === "ingest_source_url") return "URL ingestion";
  if (step === "force_reingest_all") return "Force full re-ingestion";
  if (step === "seed_demo_data") return "Seed local demo app data";
  return "Inline ingestion processing";
}

interface RunStepOptions {
  sourceUrl?: string;
  maxSources?: number;
  maxBatches?: number;
  forceInline?: boolean;
}

type ManualControlsMode = "both" | "discovery" | "compliance";

export function PipelineManualControls({
  mode = "both",
  enableComplianceUrlIngestion = false,
}: {
  mode?: ManualControlsMode;
  enableComplianceUrlIngestion?: boolean;
}) {
  const router = useRouter();
  const [maxSources, setMaxSources] = useState("25");
  const [maxBatches, setMaxBatches] = useState("1");
  const [complianceSourceUrl, setComplianceSourceUrl] = useState("");
  const [runningKey, setRunningKey] = useState<string | null>(null);
  const [lastExecution, setLastExecution] = useState<ExecutionSummary | null>(null);

  const parsedMaxSources = useMemo(() => {
    const value = Number.parseInt(maxSources, 10);
    return Number.isFinite(value) && value > 0 ? Math.min(value, 250) : 25;
  }, [maxSources]);

  const parsedMaxBatches = useMemo(() => {
    const value = Number.parseInt(maxBatches, 10);
    return Number.isFinite(value) && value > 0 ? Math.min(value, 25) : 1;
  }, [maxBatches]);

  const showDiscoveryControls = mode === "both" || mode === "discovery";
  const showComplianceControls = mode === "both" || mode === "compliance";

  const withSession = useCallback(async <T,>(path: string, init: RequestInit): Promise<T> => {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token ?? "";
    const base = getBrowserApiBase();
    const targets = base ? [`${base}${path}`, path] : [path];
    let lastFetchError: Error | null = null;

    for (const target of targets) {
      try {
        const response = await fetch(target, {
          ...init,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            ...(init.headers ?? {}),
          },
          cache: "no-store",
        });

        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          const message =
            typeof (body as { error?: { message?: string } }).error?.message === "string"
              ? (body as { error: { message: string } }).error.message
              : `Request failed (${response.status})`;
          throw new Error(message);
        }

        return body as T;
      } catch (error) {
        // Retry once via same-origin proxy if direct gateway fetch fails.
        lastFetchError = error as Error;
        const isLastTarget = target === targets[targets.length - 1];
        if (isLastTarget) {
          throw lastFetchError;
        }
      }
    }

    throw lastFetchError ?? new Error("Request failed");
  }, []);

  const executeStep = useCallback(
    async (pipeline: PipelineKey, step: StepKey, options?: RunStepOptions): Promise<RunStepResponse> => {
      const response = await withSession<RunStepResponse>("/api/v1/admin/pipeline/run", {
        method: "POST",
        body: JSON.stringify({
          pipeline,
          step,
          maxSources: options?.maxSources ?? parsedMaxSources,
          maxBatches: options?.maxBatches ?? parsedMaxBatches,
          ...(options?.sourceUrl ? { sourceUrl: options.sourceUrl } : {}),
          ...(typeof options?.forceInline === "boolean" ? { forceInline: options.forceInline } : {}),
        }),
      });

      setLastExecution(response.execution);
      router.refresh();
      return response;
    },
    [parsedMaxBatches, parsedMaxSources, router, withSession]
  );

  const runStep = useCallback(
    async (pipeline: PipelineKey, step: StepKey, options?: RunStepOptions) => {
      const key = `${pipeline}:${step}`;
      setRunningKey(key);
      try {
        const response = await executeStep(pipeline, step, options);
        toast.success(
          `${pipeline} ${describeStep(step).toLowerCase()} finished (${(
            response.execution.durationMs / 1000
          ).toFixed(1)}s).`
        );
      } catch (error) {
        const errorMessage = (error as Error).message || "Failed to run pipeline step.";
        console.error("Failed to run pipeline step", {
          pipeline,
          step,
          error: errorMessage,
        });
        toast.error(errorMessage);
      } finally {
        setRunningKey(null);
      }
    },
    [executeStep]
  );

  const ingestComplianceSourceUrl = useCallback(async () => {
    const trimmedUrl = complianceSourceUrl.trim();
    if (!trimmedUrl) {
      toast.error("Enter a source URL.");
      return;
    }

    try {
      const parsed = new URL(trimmedUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        toast.error("URL must start with http:// or https://");
        return;
      }
    } catch {
      toast.error("Enter a valid URL.");
      return;
    }

    setRunningKey("source-url-ingest");
    try {
      const primary = await executeStep("compliance", "ingest_source_url", {
        sourceUrl: trimmedUrl,
        maxSources: 1,
        forceInline: true,
      });
      toast.success(
        `Compliance URL ingested (${(primary.execution.durationMs / 1000).toFixed(1)}s).`
      );
    } catch (error) {
      const message = (error as Error).message || "Failed to ingest source URL.";
      const isLegacyRuntimeError =
        message.includes("Invalid option") && message.includes("discover_sources");

      console.error("Failed to ingest source URL via pipeline", {
        url: trimmedUrl,
        error: message,
      });

      if (isLegacyRuntimeError) {
        toast.error(
          "Your API runtime does not support ingest_source_url yet. Deploy/restart the API backend."
        );
      } else {
        toast.error(message);
      }
    } finally {
      setRunningKey(null);
    }
  }, [complianceSourceUrl, executeStep]);

  const bootstrapLocal = useCallback(async () => {
    setRunningKey("bootstrap");
    try {
      if (showDiscoveryControls) {
        await runStep("discovery", "discover_sources");
        await runStep("discovery", "process_ingestion_inline");
      }
      if (showComplianceControls) {
        await runStep("compliance", "discover_sources");
        await runStep("compliance", "process_ingestion_inline");
      }
      if (showDiscoveryControls) {
        await runStep("discovery", "seed_demo_data");
      }
      toast.success("Local bootstrap sequence completed.");
    } finally {
      setRunningKey(null);
    }
  }, [runStep, showComplianceControls, showDiscoveryControls]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Manual Pipeline Controls</CardTitle>
        <CardDescription>
          Run pipeline steps manually. Use inline processing for local environments without active SQS workers.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="maxSources">Max Sources</Label>
            <Input
              id="maxSources"
              value={maxSources}
              onChange={(event) => setMaxSources(event.target.value)}
              placeholder="25"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="maxBatches">Max Discovery Batches</Label>
            <Input
              id="maxBatches"
              value={maxBatches}
              onChange={(event) => setMaxBatches(event.target.value)}
              placeholder="1"
            />
          </div>
        </div>

        <div className={`grid gap-4 ${showDiscoveryControls && showComplianceControls ? "lg:grid-cols-2" : "lg:grid-cols-1"}`}>
          {showDiscoveryControls && (
            <div className="space-y-2 rounded-lg border p-3">
              <p className="text-sm font-semibold">Discovery pipeline</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void runStep("discovery", "discover_sources")}
                  disabled={runningKey !== null}
                >
                  <Play className="h-3.5 w-3.5 mr-1" />
                  {runningKey === "discovery:discover_sources" ? "Running..." : "Run Source Discovery"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void runStep("discovery", "orchestrate_ingestion")}
                  disabled={runningKey !== null}
                >
                  <Play className="h-3.5 w-3.5 mr-1" />
                  {runningKey === "discovery:orchestrate_ingestion" ? "Running..." : "Run Ingestion Orchestrator"}
                </Button>
                <Button
                  size="sm"
                  onClick={() => void runStep("discovery", "process_ingestion_inline")}
                  disabled={runningKey !== null}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                  {runningKey === "discovery:process_ingestion_inline" ? "Running..." : "Process Inline (Local)"}
                </Button>
              </div>
            </div>
          )}

          {showComplianceControls && (
            <div className="space-y-2 rounded-lg border p-3">
              <p className="text-sm font-semibold">Compliance pipeline</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void runStep("compliance", "discover_sources")}
                  disabled={runningKey !== null}
                >
                  <Play className="h-3.5 w-3.5 mr-1" />
                  {runningKey === "compliance:discover_sources" ? "Running..." : "Run Source Discovery"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void runStep("compliance", "orchestrate_ingestion")}
                  disabled={runningKey !== null}
                >
                  <Play className="h-3.5 w-3.5 mr-1" />
                  {runningKey === "compliance:orchestrate_ingestion" ? "Running..." : "Run Ingestion Orchestrator"}
                </Button>
                <Button
                  size="sm"
                  onClick={() => void runStep("compliance", "process_ingestion_inline")}
                  disabled={runningKey !== null}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                  {runningKey === "compliance:process_ingestion_inline" ? "Running..." : "Process Inline (Local)"}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => void runStep("compliance", "force_reingest_all")}
                  disabled={runningKey !== null}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                  {runningKey === "compliance:force_reingest_all" ? "Running..." : "Force Re-ingest All Sources"}
                </Button>
              </div>
            </div>
          )}
        </div>

        {enableComplianceUrlIngestion && (
          <form
            className="rounded-lg border p-3 space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              void ingestComplianceSourceUrl();
            }}
          >
            <p className="text-sm font-semibold">Ingest Compliance Source URL</p>
            <div className="flex flex-col gap-2 md:flex-row">
              <Input
                value={complianceSourceUrl}
                onChange={(event) => setComplianceSourceUrl(event.target.value)}
                placeholder="https://example.gov/label.pdf"
                autoComplete="off"
              />
              <Button
                type="submit"
                disabled={runningKey !== null}
                className="md:w-auto"
              >
                {runningKey === "source-url-ingest" ? "Registering..." : "Ingest URL"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Runs URL-targeted compliance ingestion through the API runtime.
            </p>
          </form>
        )}

        <div className="rounded-lg border border-dashed p-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            Fresh local copy: run one-click bootstrap for the currently visible pipeline controls.
          </div>
          <Button onClick={() => void bootstrapLocal()} disabled={runningKey !== null}>
            {runningKey === "bootstrap" ? "Bootstrapping..." : "Bootstrap Local Data"}
          </Button>
        </div>

        {showDiscoveryControls && (
          <div className="rounded-lg border border-dashed p-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              Seed sample recommendations/products for your current account if local tables are empty.
            </div>
            <Button
              variant="outline"
              onClick={() => void runStep("discovery", "seed_demo_data")}
              disabled={runningKey !== null}
            >
              {runningKey === "discovery:seed_demo_data" ? "Seeding..." : "Seed Demo App Data"}
            </Button>
          </div>
        )}

        {lastExecution && (
          <div className="rounded-lg border p-3 space-y-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{lastExecution.pipeline}</Badge>
              <Badge variant="outline">{describeStep(lastExecution.step)}</Badge>
              <span className="text-muted-foreground">
                {(lastExecution.durationMs / 1000).toFixed(1)}s
              </span>
            </div>
            <div className="grid gap-1 text-xs text-muted-foreground md:grid-cols-2">
              <span>Queue configured: {lastExecution.queueConfigured ? "yes" : "no"}</span>
              <span>Inline processing: {lastExecution.inlineProcessing ? "yes" : "no"}</span>
              <span>Orchestrated messages: {lastExecution.orchestratedMessages}</span>
              <span>Queued sources: {lastExecution.queuedSources}</span>
              <span>Inline processed messages: {lastExecution.inlineProcessedMessages}</span>
              <span>Inline failed messages: {lastExecution.inlineFailedMessages}</span>
            </div>
            {lastExecution.notes.length > 0 && (
              <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-1">
                {lastExecution.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
