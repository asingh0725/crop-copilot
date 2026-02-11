import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateAdminAuth } from "@/lib/admin/auth";

export async function GET(request: NextRequest) {
  const authError = validateAdminAuth(request);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const crop = searchParams.get("crop");
    const region = searchParams.get("region");
    const conditionType = searchParams.get("conditionType");
    const minDate = searchParams.get("minDate");
    const maxDate = searchParams.get("maxDate");

    // Build date filter
    const dateFilter: any = {};
    if (minDate) dateFilter.gte = new Date(minDate);
    if (maxDate) dateFilter.lte = new Date(maxDate);

    // Build scenario filter for crop/region/conditionType
    const scenarioFilter: any = {};
    if (crop) scenarioFilter.crop = crop;
    if (region) scenarioFilter.location = region;
    if (conditionType) scenarioFilter.expectedConditionType = conditionType;

    const hasScenarioFilter = Object.keys(scenarioFilter).length > 0;

    // Fetch all evaluations with filters
    const evaluations = await prisma.evaluation.findMany({
      where: {
        ...(Object.keys(dateFilter).length > 0
          ? { createdAt: dateFilter }
          : {}),
        ...(hasScenarioFilter
          ? { scenario: { ...scenarioFilter } }
          : {}),
      },
      include: {
        scenario: {
          select: {
            crop: true,
            location: true,
            expectedConditionType: true,
          },
        },
        recommendation: {
          select: {
            id: true,
            input: {
              select: { crop: true, location: true },
            },
          },
        },
      },
    });

    if (evaluations.length === 0) {
      return NextResponse.json({
        total: 0,
        aggregates: null,
        byCrop: {},
        byRegion: {},
        mostMissedSources: [],
        issueFrequency: {},
      });
    }

    // Compute overall aggregates
    const avg = (values: number[]): number =>
      values.length === 0
        ? 0
        : Number(
            (values.reduce((s, v) => s + v, 0) / values.length).toFixed(2)
          );

    const aggregates = {
      overall: avg(evaluations.map((e) => e.overall)),
      accuracy: avg(evaluations.map((e) => e.accuracy)),
      helpfulness: avg(evaluations.map((e) => e.helpfulness)),
      faithfulness: avg(evaluations.map((e) => e.faithfulness)),
      actionability: avg(evaluations.map((e) => e.actionability)),
      completeness: avg(evaluations.map((e) => e.completeness)),
      retrievalRelevance: avg(evaluations.map((e) => e.retrievalRelevance)),
    };

    // Group by crop
    const byCrop: Record<string, { count: number; avgAccuracy: number; avgHelpfulness: number }> = {};
    for (const e of evaluations) {
      const cropKey =
        e.scenario?.crop ||
        e.recommendation?.input?.crop ||
        "unknown";
      if (!byCrop[cropKey]) {
        byCrop[cropKey] = { count: 0, avgAccuracy: 0, avgHelpfulness: 0 };
      }
      byCrop[cropKey].count += 1;
      byCrop[cropKey].avgAccuracy += e.accuracy;
      byCrop[cropKey].avgHelpfulness += e.helpfulness;
    }
    for (const key of Object.keys(byCrop)) {
      byCrop[key].avgAccuracy = Number(
        (byCrop[key].avgAccuracy / byCrop[key].count).toFixed(2)
      );
      byCrop[key].avgHelpfulness = Number(
        (byCrop[key].avgHelpfulness / byCrop[key].count).toFixed(2)
      );
    }

    // Group by region
    const byRegion: Record<string, { count: number; avgAccuracy: number; avgHelpfulness: number }> = {};
    for (const e of evaluations) {
      const regionKey =
        e.scenario?.location ||
        e.recommendation?.input?.location ||
        "unknown";
      if (!byRegion[regionKey]) {
        byRegion[regionKey] = { count: 0, avgAccuracy: 0, avgHelpfulness: 0 };
      }
      byRegion[regionKey].count += 1;
      byRegion[regionKey].avgAccuracy += e.accuracy;
      byRegion[regionKey].avgHelpfulness += e.helpfulness;
    }
    for (const key of Object.keys(byRegion)) {
      byRegion[key].avgAccuracy = Number(
        (byRegion[key].avgAccuracy / byRegion[key].count).toFixed(2)
      );
      byRegion[key].avgHelpfulness = Number(
        (byRegion[key].avgHelpfulness / byRegion[key].count).toFixed(2)
      );
    }

    // Aggregate most-missed sources from RetrievalAudit
    const audits = await prisma.retrievalAudit.findMany({
      where: {
        ...(Object.keys(dateFilter).length > 0
          ? { createdAt: dateFilter }
          : {}),
      },
      select: { missedChunks: true },
    });

    const missedSourceCounts: Record<string, number> = {};
    for (const audit of audits) {
      const missed = audit.missedChunks as Array<{
        id: string;
        sourceId: string;
      }>;
      if (!Array.isArray(missed)) continue;
      for (const chunk of missed) {
        if (chunk.sourceId) {
          missedSourceCounts[chunk.sourceId] =
            (missedSourceCounts[chunk.sourceId] || 0) + 1;
        }
      }
    }

    const mostMissedSources = Object.entries(missedSourceCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([sourceId, count]) => ({ sourceId, count }));

    // Issue frequency
    const issueFrequency: Record<string, number> = {};
    for (const e of evaluations) {
      const issues = e.issues as string[] | null;
      if (!Array.isArray(issues)) continue;
      for (const issue of issues) {
        issueFrequency[issue] = (issueFrequency[issue] || 0) + 1;
      }
    }

    return NextResponse.json({
      total: evaluations.length,
      aggregates,
      byCrop,
      byRegion,
      mostMissedSources,
      issueFrequency,
    });
  } catch (error) {
    console.error("Eval summary error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
