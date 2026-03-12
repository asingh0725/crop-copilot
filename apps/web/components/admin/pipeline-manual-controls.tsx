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
type StepKey = "discover_sources" | "orchestrate_ingestion" | "process_ingestion_inline";

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
  return "Inline ingestion processing";
}

export function PipelineManualControls() {
  const router = useRouter();
  const [maxSources, setMaxSources] = useState("25");
  const [maxBatches, setMaxBatches] = useState("1");
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

  const withSession = useCallback(async <T,>(path: string, init: RequestInit): Promise<T> => {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token ?? "";
    const base = getBrowserApiBase();

    const response = await fetch(`${base}${path}`, {
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
  }, []);

  const runStep = useCallback(
    async (pipeline: PipelineKey, step: StepKey) => {
      const key = `${pipeline}:${step}`;
      setRunningKey(key);
      try {
        const response = await withSession<RunStepResponse>("/api/v1/admin/pipeline/run", {
          method: "POST",
          body: JSON.stringify({
            pipeline,
            step,
            maxSources: parsedMaxSources,
            maxBatches: parsedMaxBatches,
          }),
        });

        setLastExecution(response.execution);
        toast.success(
          `${pipeline} ${describeStep(step).toLowerCase()} finished (${(
            response.execution.durationMs / 1000
          ).toFixed(1)}s).`
        );
        router.refresh();
      } catch (error) {
        console.error("Failed to run pipeline step", {
          pipeline,
          step,
          error: (error as Error).message,
        });
        toast.error((error as Error).message || "Failed to run pipeline step.");
      } finally {
        setRunningKey(null);
      }
    },
    [parsedMaxBatches, parsedMaxSources, router, withSession]
  );

  const bootstrapLocal = useCallback(async () => {
    setRunningKey("bootstrap");
    try {
      await runStep("discovery", "discover_sources");
      await runStep("discovery", "process_ingestion_inline");
      await runStep("compliance", "discover_sources");
      await runStep("compliance", "process_ingestion_inline");
      toast.success("Local bootstrap sequence completed.");
    } finally {
      setRunningKey(null);
    }
  }, [runStep]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Manual Pipeline Controls</CardTitle>
        <CardDescription>
          Run discovery/compliance steps manually. Use inline processing for local environments without active SQS workers.
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

        <div className="grid gap-4 lg:grid-cols-2">
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
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-dashed p-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            Fresh local copy: run one-click bootstrap to populate discovery and compliance data quickly.
          </div>
          <Button onClick={() => void bootstrapLocal()} disabled={runningKey !== null}>
            {runningKey === "bootstrap" ? "Bootstrapping..." : "Bootstrap Local Data"}
          </Button>
        </div>

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
