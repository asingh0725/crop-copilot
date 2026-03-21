"use client";

import { useState } from "react";
import { Lock, CheckCircle2, AlertTriangle, XCircle, Leaf, TrendingDown, Wind, FileText, Info, Zap, BarChart3, MapPin, Calendar, Eye, Download, Sun, Cloud, CloudRain, CloudLightning } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import Link from "next/link";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RiskDecision = "clear_signal" | "potential_conflict" | "needs_manual_verification" | null;
export type PremiumStatus = "not_available" | "queued" | "processing" | "ready" | "failed";

interface ComplianceCheck {
  id: string;
  title: string;
  result: RiskDecision;
  message: string;
}

interface CostItem {
  productName: string;
  productType: string;
  estimatedCostPerAcreUsd: number | null;
  estimatedFieldCostUsd: number | null;
  priceSource: "live" | "estimated" | null;
}

interface SwapOption {
  fromProductName: string;
  toProductName: string;
  estimatedSavingsPerAcreUsd: number;
  estimatedSavingsWholeFieldUsd: number;
}

interface CostAnalysis {
  perAcreTotalUsd: number | null;
  wholeFieldTotalUsd: number | null;
  pricingCoverageRatio?: number;
  acreage?: number | null;
  items?: CostItem[];
  swapOptions?: SwapOption[];
}

interface SprayWindow {
  startsAt: string;
  endsAt: string;
  score: number;
  summary: string;
  source: string;
}

interface Report {
  html?: string;
  htmlUrl?: string;
  pdfUrl?: string;
  generatedAt?: string;
}

export interface PremiumInsightPanelProps {
  status: PremiumStatus;
  riskReview: RiskDecision;
  checks: ComplianceCheck[];
  costAnalysis: CostAnalysis | null;
  sprayWindows: SprayWindow[];
  report: Report | null;
  advisoryNotice?: string | null;
  failureReason?: string | null;
  recommendationId?: string;
  // Input context for connecting planning fields to output
  inputContext?: {
    fieldAcreage?: number | null;
    fieldLatitude?: number | null;
    fieldLongitude?: number | null;
    plannedApplicationDate?: string | null;
    location?: string | null;
  };
}

// Re-export CostAnalysis so page.tsx can use the exact type without an `as any`
export type { CostAnalysis, ComplianceCheck, SprayWindow, Report };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function riskLabel(d: RiskDecision): string {
  switch (d) {
    case "clear_signal":               return "Clear Signal";
    case "potential_conflict":         return "Potential Conflict";
    case "needs_manual_verification":  return "Needs Verification";
    default:                           return "N/A";
  }
}

function riskColor(d: RiskDecision): string {
  switch (d) {
    case "clear_signal":              return "text-emerald-700 bg-emerald-50 border-emerald-200";
    case "potential_conflict":        return "text-amber-700 bg-amber-50 border-amber-200";
    case "needs_manual_verification": return "text-orange-700 bg-orange-50 border-orange-200";
    default:                          return "text-gray-600 bg-gray-50 border-gray-200";
  }
}

function riskIcon(d: RiskDecision) {
  switch (d) {
    case "clear_signal":              return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
    case "potential_conflict":        return <AlertTriangle className="h-4 w-4 text-amber-600" />;
    case "needs_manual_verification": return <XCircle className="h-4 w-4 text-orange-600" />;
    default:                          return <Info className="h-4 w-4 text-gray-400" />;
  }
}

function formatUsd(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function formatDateRange(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const sameDay = s.toDateString() === e.toDateString();
  const dateOpts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" };
  const timeOpts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  if (sameDay) {
    const startTime = s.toLocaleTimeString("en-US", timeOpts);
    const endTime = e.toLocaleTimeString("en-US", timeOpts);
    return `${s.toLocaleDateString("en-US", dateOpts)} · ${startTime} – ${endTime}`;
  }
  return `${s.toLocaleString("en-US", { ...dateOpts, ...timeOpts })} – ${e.toLocaleString("en-US", { ...dateOpts, ...timeOpts })}`;
}

function sprayScoreColor(score: number): string {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 60) return "bg-amber-400";
  return "bg-red-400";
}

function sprayWeatherIcon(score: number, summary: string) {
  const lower = summary.toLowerCase();
  if (lower.includes("thunder") || lower.includes("lightning") || lower.includes("storm")) {
    return <CloudLightning className="h-5 w-5 text-red-500" />;
  }
  if (lower.includes("rain") || lower.includes("shower") || lower.includes("drizzle") || score < 45) {
    return <CloudRain className="h-5 w-5 text-blue-500" />;
  }
  if (score >= 80 && !lower.includes("cloud")) {
    return <Sun className="h-5 w-5 text-amber-500" />;
  }
  return <Cloud className="h-5 w-5 text-slate-400" />;
}

function formatProductType(type: string): string {
  return type
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AdvisoryBanner({ notice }: { notice: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      <span>{notice}</span>
    </div>
  );
}

function RiskBadge({ decision, label }: { decision: RiskDecision; label: string }) {
  return (
    <div className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide", riskColor(decision))}>
      {riskIcon(decision)}
      {label}
    </div>
  );
}

function PriceSourceBadge({ source }: { source: "live" | "estimated" | null | undefined }) {
  if (!source) return null;
  if (source === "live") {
    return (
      <span title="Price sourced from live retail search" className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
        <Zap className="h-2.5 w-2.5" /> Live
      </span>
    );
  }
  return (
    <span title="Price is a benchmark estimate, not a live retail quote" className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
      <BarChart3 className="h-2.5 w-2.5" /> Est.
    </span>
  );
}

function InputContextBadge({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
      {icon}
      {label}
    </span>
  );
}

// ─── State: Not Available (Paywall) ───────────────────────────────────────────

function PaywallCard() {
  const features = [
    { icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />, text: "Application risk review across 7 advisory checks" },
    { icon: <BarChart3 className="h-4 w-4 text-blue-500" />,       text: "Per-acre & whole-field cost analysis with swap suggestions" },
    { icon: <Wind className="h-4 w-4 text-sky-500" />,             text: "Spray window forecasts based on your field location" },
    { icon: <FileText className="h-4 w-4 text-violet-500" />,      text: "One-tap application prep packet (HTML/PDF)" },
  ];

  return (
    <div className="relative overflow-hidden rounded-xl border border-dashed border-gray-300 bg-gradient-to-br from-gray-50 to-white p-5">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100">
          <Lock className="h-4 w-4 text-gray-500" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">Grower Pro required</p>
          <p className="text-xs text-gray-500">Upgrade to unlock premium analysis on this recommendation</p>
        </div>
      </div>
      <ul className="mb-4 space-y-2">
        {features.map((f, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
            <span className="mt-0.5 shrink-0">{f.icon}</span>
            {f.text}
          </li>
        ))}
      </ul>
      <Link
        href="/settings/billing"
        className="inline-flex items-center gap-1.5 rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-800"
      >
        Upgrade to Grower Pro
      </Link>
    </div>
  );
}

// ─── State: Processing ────────────────────────────────────────────────────────

function ProcessingCard({ status }: { status: "queued" | "processing" }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-blue-100 bg-blue-50 p-4">
      <div className="mt-0.5 h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600" />
      <div>
        <p className="text-sm font-semibold text-blue-900">
          {status === "queued" ? "Premium analysis queued" : "Premium analysis running…"}
        </p>
        <p className="mt-0.5 text-xs text-blue-700">
          Risk review, cost analysis, and spray windows are being generated. This page will update automatically when ready.
        </p>
      </div>
    </div>
  );
}

// ─── State: Failed ────────────────────────────────────────────────────────────

function FailedCard({ reason }: { reason: string | null | undefined }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
      <div>
        <p className="text-sm font-semibold text-red-900">Premium analysis failed</p>
        <p className="mt-0.5 text-xs text-red-700">{reason ?? "Unknown error. The team has been notified."}</p>
      </div>
    </div>
  );
}

// ─── State: Ready ─────────────────────────────────────────────────────────────

function RiskReviewSection({ riskReview, checks }: { riskReview: RiskDecision; checks: ComplianceCheck[] }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">Application Risk Review</h3>
        <RiskBadge decision={riskReview} label={riskLabel(riskReview)} />
      </div>

      {checks.length > 0 && (
        <div className="space-y-1.5">
          {checks.map((check) => (
            <div
              key={check.id}
              className={cn(
                "flex items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors",
                check.result === "clear_signal"
                  ? "border-emerald-100 bg-emerald-50/50"
                  : check.result === "potential_conflict"
                    ? "border-amber-100 bg-amber-50/50"
                    : "border-orange-100 bg-orange-50/50"
              )}
            >
              <span className="mt-0.5 shrink-0">{riskIcon(check.result)}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <span className="text-xs font-semibold text-gray-800">{check.title}</span>
                  <RiskBadge decision={check.result} label={riskLabel(check.result)} />
                </div>
                <p className="mt-1 text-xs leading-relaxed text-gray-600">{check.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CostSection({
  costAnalysis,
  inputContext,
}: {
  costAnalysis: CostAnalysis;
  inputContext?: PremiumInsightPanelProps["inputContext"];
}) {
  const hasAcreage = (costAnalysis.acreage ?? inputContext?.fieldAcreage) != null;
  const acreage = costAnalysis.acreage ?? inputContext?.fieldAcreage;
  const anyEstimated = costAnalysis.items?.some((i) => i.priceSource === "estimated");
  const coverageRatio = costAnalysis.pricingCoverageRatio ?? null;
  const coveragePct = coverageRatio != null ? Math.round(coverageRatio * 100) : null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
          <Leaf className="h-4 w-4 text-emerald-600" />
          Cost Analysis
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {hasAcreage && (
            <InputContextBadge
              icon={<MapPin className="h-2.5 w-2.5" />}
              label={`${acreage?.toLocaleString()} acres`}
            />
          )}
          {coveragePct != null && coveragePct < 100 && (
            <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
              {coveragePct}% priced
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Per Acre</p>
          <p className="mt-1 text-xl font-bold text-gray-900">{formatUsd(costAnalysis.perAcreTotalUsd)}</p>
        </div>
        {hasAcreage && (
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
              Whole Field{acreage ? ` (${acreage.toLocaleString()} ac)` : ""}
            </p>
            <p className="mt-1 text-xl font-bold text-gray-900">{formatUsd(costAnalysis.wholeFieldTotalUsd)}</p>
          </div>
        )}
      </div>

      {/* Per-product breakdown */}
      {costAnalysis.items && costAnalysis.items.length > 0 && (
        <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
          {costAnalysis.items.map((item, i) => (
            <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
              <div className="min-w-0">
                <span className="font-medium text-gray-800 line-clamp-1">{item.productName}</span>
                <div className="mt-0.5 flex items-center gap-1">
                  <span className="text-[10px] text-gray-400">{formatProductType(item.productType)}</span>
                  <PriceSourceBadge source={item.priceSource} />
                </div>
              </div>
              <div className="ml-3 shrink-0 text-right">
                <span className="text-sm font-semibold text-gray-900">
                  {formatUsd(item.estimatedCostPerAcreUsd)}<span className="text-[10px] font-normal text-gray-400">/ac</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Swap suggestions */}
      {costAnalysis.swapOptions && costAnalysis.swapOptions.length > 0 && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <p className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-emerald-800">
            <TrendingDown className="h-3.5 w-3.5" /> Cost Swap Suggestions
          </p>
          {costAnalysis.swapOptions.map((swap, i) => (
            <p key={i} className="text-xs text-emerald-700">
              Switch <strong>{swap.fromProductName}</strong> → <strong>{swap.toProductName}</strong> and save{" "}
              <strong>{formatUsd(swap.estimatedSavingsPerAcreUsd)}/ac</strong>
              {hasAcreage && swap.estimatedSavingsWholeFieldUsd > 0
                ? ` (${formatUsd(swap.estimatedSavingsWholeFieldUsd)} total)`
                : ""}
            </p>
          ))}
        </div>
      )}

      {anyEstimated && (
        <p className="flex items-center gap-1 text-[11px] text-gray-400">
          <BarChart3 className="h-3 w-3" />
          Some prices use live retailer data; others use benchmark estimates when live quotes are unavailable.
        </p>
      )}
    </div>
  );
}

function SprayWindowSection({
  windows,
  inputContext,
}: {
  windows: SprayWindow[];
  inputContext?: PremiumInsightPanelProps["inputContext"];
}) {
  const hasGps =
    inputContext?.fieldLatitude != null && inputContext?.fieldLongitude != null;
  const hasDate = inputContext?.plannedApplicationDate != null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
          <Wind className="h-4 w-4 text-sky-600" />
          Spray Windows
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {hasGps && (
            <InputContextBadge
              icon={<MapPin className="h-2.5 w-2.5" />}
              label="GPS location"
            />
          )}
          {hasDate && (
            <InputContextBadge
              icon={<Calendar className="h-2.5 w-2.5" />}
              label={new Date(inputContext!.plannedApplicationDate!).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            />
          )}
        </div>
      </div>

      <div className="space-y-2">
        {windows.slice(0, 3).map((w, i) => (
          <div key={i} className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5 shadow-sm">
            <div className="mt-0.5 shrink-0">
              {sprayWeatherIcon(w.score, w.summary)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-gray-800">
                  {formatDateRange(w.startsAt, w.endsAt)}
                </p>
                <div className="flex items-center gap-1.5 shrink-0">
                  <div className="flex h-1.5 w-16 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={cn("h-full rounded-full transition-all", sprayScoreColor(w.score))}
                      style={{ width: `${w.score}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-semibold text-gray-500">{w.score}</span>
                </div>
              </div>
              <p className="mt-0.5 text-xs text-gray-600">{w.summary}</p>
            </div>
          </div>
        ))}
      </div>

      {!hasGps && (
        <p className="text-[11px] text-gray-400">
          Add GPS coordinates when submitting for location-specific windows.
        </p>
      )}
    </div>
  );
}

function formatGeneratedAt(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ReportSection({
  report,
  recommendationId,
}: {
  report: Report;
  recommendationId?: string;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [downloading, setDownloading] = useState<"pdf" | "html" | null>(null);

  const hasHtml = !!report.html;

  // Re-fetch a fresh presigned URL before opening — S3 presigned URLs expire after ~1 hour.
  const handleDownload = async (type: "pdf" | "html") => {
    const fallbackUrl = type === "pdf" ? report.pdfUrl : report.htmlUrl;
    if (!fallbackUrl) return;

    if (!recommendationId) {
      window.open(fallbackUrl, "_blank", "noopener,noreferrer");
      return;
    }

    setDownloading(type);
    try {
      const res = await fetch(`/api/v1/recommendations/${recommendationId}`);
      if (res.ok) {
        const data = await res.json();
        const freshUrl =
          type === "pdf"
            ? data.premium?.report?.pdfUrl
            : data.premium?.report?.htmlUrl;
        window.open(freshUrl ?? fallbackUrl, "_blank", "noopener,noreferrer");
      } else {
        window.open(fallbackUrl, "_blank", "noopener,noreferrer");
      }
    } catch {
      window.open(fallbackUrl, "_blank", "noopener,noreferrer");
    } finally {
      setDownloading(null);
    }
  };

  const openPreview = () => {
    setIframeLoaded(false);
    setPreviewOpen(true);
  };

  return (
    <>
      <div className="rounded-lg border border-gray-200 bg-white p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-violet-500" />
            <p className="text-sm font-semibold text-gray-800">Application Prep Packet</p>
          </div>
          <div className="flex gap-2">
            {hasHtml && (
              <button
                onClick={openPreview}
                className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 transition-colors hover:bg-violet-100"
              >
                <Eye className="h-3 w-3" /> Preview
              </button>
            )}
            {report.pdfUrl && (
              <button
                onClick={() => handleDownload("pdf")}
                disabled={downloading === "pdf"}
                className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-60"
              >
                {downloading === "pdf" ? (
                  <span className="h-3 w-3 animate-spin rounded-full border border-gray-400 border-t-gray-700" />
                ) : (
                  <Download className="h-3 w-3" />
                )}{" "}
                PDF
              </button>
            )}
            {report.htmlUrl && (
              <button
                onClick={() => handleDownload("html")}
                disabled={downloading === "html"}
                className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-60"
              >
                {downloading === "html" ? (
                  <span className="h-3 w-3 animate-spin rounded-full border border-gray-400 border-t-gray-700" />
                ) : (
                  <Download className="h-3 w-3" />
                )}{" "}
                HTML
              </button>
            )}
          </div>
        </div>
        {report.generatedAt && (
          <p className="mt-1 text-xs text-gray-500">
            Generated {formatGeneratedAt(report.generatedAt)}
          </p>
        )}
      </div>

      {hasHtml && (
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="max-w-4xl h-[85vh] flex flex-col p-0 gap-0">
            <DialogHeader className="flex-none px-6 py-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-violet-500" />
                <DialogTitle>Application Prep Packet</DialogTitle>
                {report.generatedAt && (
                  <span className="ml-auto text-xs text-gray-400">
                    {formatGeneratedAt(report.generatedAt)}
                  </span>
                )}
              </div>
            </DialogHeader>
            <div className="relative flex-1 min-h-0">
              {!iframeLoaded && (
                <div className="absolute inset-0 flex items-center justify-center bg-white rounded-b-lg">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-violet-500" />
                </div>
              )}
              <iframe
                srcDoc={report.html}
                title="Application Prep Packet"
                className="h-full w-full border-0 rounded-b-lg"
                sandbox=""
                onLoad={() => setIframeLoaded(true)}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function PremiumInsightPanel({
  status,
  riskReview,
  checks,
  costAnalysis,
  sprayWindows,
  report,
  advisoryNotice,
  failureReason,
  recommendationId,
  inputContext,
}: PremiumInsightPanelProps) {
  return (
    <Card className="print:shadow-none print:border-gray-300">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-amber-500" />
          <h2 className="text-xl font-semibold">Premium Insights</h2>
          {status === "ready" && (
            <span className="ml-auto text-[10px] font-medium uppercase tracking-wide text-gray-400">
              Grower Pro
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {status === "not_available" && <PaywallCard />}
        {(status === "queued" || status === "processing") && <ProcessingCard status={status} />}
        {status === "failed" && <FailedCard reason={failureReason} />}

        {status === "ready" && (
          <>
            {/* Advisory notice at the TOP — most important disclaimer */}
            <AdvisoryBanner
              notice={
                advisoryNotice ??
                "Advisory use only. These checks are decision-support heuristics, not regulatory compliance determinations. Always verify label instructions and local regulations before application."
              }
            />

            {/* Risk review */}
            <RiskReviewSection riskReview={riskReview} checks={checks} />

            <hr className="border-gray-100" />

            {/* Cost analysis */}
            {costAnalysis && (
              <CostSection costAnalysis={costAnalysis} inputContext={inputContext} />
            )}

            {/* Spray windows */}
            {sprayWindows.length > 0 && (
              <>
                <hr className="border-gray-100" />
                <SprayWindowSection windows={sprayWindows} inputContext={inputContext} />
              </>
            )}

            {/* Report */}
            {report && (
              <>
                <hr className="border-gray-100" />
                <ReportSection report={report} recommendationId={recommendationId} />
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
