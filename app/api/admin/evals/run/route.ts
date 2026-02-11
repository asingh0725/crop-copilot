import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { validateAdminAuth } from "@/lib/admin/auth";
import {
  scoreRecommendation,
  type RecommendationData,
  type AuditData,
} from "@/lib/eval/rule-scorer";
import { judgeFaithfulness } from "@/lib/eval/faithfulness-judge";

const runEvalSchema = z.object({
  recommendationId: z.string().min(1),
  skipLlm: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const authError = validateAdminAuth(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const validated = runEvalSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: "Invalid request", details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const { recommendationId, skipLlm } = validated.data;

    // Load recommendation with all related data
    const recommendation = await prisma.recommendation.findUnique({
      where: { id: recommendationId },
      include: {
        input: true,
        sources: {
          include: {
            textChunk: { include: { source: true } },
            imageChunk: { include: { source: true } },
          },
        },
        retrievalAudits: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!recommendation) {
      return NextResponse.json(
        { error: "Recommendation not found" },
        { status: 404 }
      );
    }

    // Find linked scenario (if any) via input
    const scenario = recommendation.input
      ? await prisma.testScenario.findFirst({
          where: { inputId: recommendation.input.id },
        })
      : null;

    // Build expected values from scenario
    const expected = scenario
      ? {
          diagnosis: scenario.expectedDiagnosis,
          conditionType: scenario.expectedConditionType,
          mustInclude: scenario.mustInclude,
          shouldAvoid: scenario.shouldAvoid,
        }
      : undefined;

    // Build audit data from retrieval audit
    const audit = recommendation.retrievalAudits[0];
    const auditData: AuditData | undefined = audit
      ? {
          candidateChunks: audit.candidateChunks as AuditData["candidateChunks"],
          usedChunks: audit.usedChunks as AuditData["usedChunks"],
          missedChunks: audit.missedChunks as AuditData["missedChunks"],
        }
      : undefined;

    // Run rule-based scoring
    const recData = recommendation.diagnosis as unknown as RecommendationData;
    const ruleScores = scoreRecommendation({
      recommendation: recData,
      expected,
      retrievalAudit: auditData,
    });

    // Run LLM faithfulness judge (unless skipped)
    let faithfulness = 3;
    let llmJudgeOutput: any = null;

    if (!skipLlm) {
      const chunks = recommendation.sources.map((s) => {
        const chunk = s.textChunk || s.imageChunk;
        const sourceDoc = s.textChunk?.source || s.imageChunk?.source;
        return {
          id: s.textChunkId || s.imageChunkId || "",
          content:
            s.textChunk?.content || s.imageChunk?.caption || "",
          sourceTitle: sourceDoc?.title || "Unknown",
        };
      });

      const judgeResult = await judgeFaithfulness({
        recommendation: recData,
        chunks,
      });

      faithfulness = judgeResult.faithfulness;
      llmJudgeOutput = {
        perAction: judgeResult.perAction,
        rawOutput: judgeResult.rawOutput,
      };
    }

    // Compute overall score
    const dimensions = [
      ruleScores.accuracy,
      ruleScores.helpfulness,
      faithfulness,
      ruleScores.actionability,
      ruleScores.completeness,
      ruleScores.retrievalRelevance,
    ];
    const overall = Math.round(
      dimensions.reduce((sum, d) => sum + d, 0) / dimensions.length
    );

    // Store evaluation
    const evaluation = await prisma.evaluation.create({
      data: {
        recommendationId,
        scenarioId: scenario?.id,
        overall,
        accuracy: ruleScores.accuracy,
        helpfulness: ruleScores.helpfulness,
        faithfulness,
        actionability: ruleScores.actionability,
        completeness: ruleScores.completeness,
        retrievalRelevance: ruleScores.retrievalRelevance,
        issues: ruleScores.issues,
        missingEvidence: ruleScores.missingEvidence,
        llmJudgeOutput,
      },
    });

    return NextResponse.json({
      evaluation,
      scores: {
        overall,
        accuracy: ruleScores.accuracy,
        helpfulness: ruleScores.helpfulness,
        faithfulness,
        actionability: ruleScores.actionability,
        completeness: ruleScores.completeness,
        retrievalRelevance: ruleScores.retrievalRelevance,
      },
      issues: ruleScores.issues,
      missingEvidence: ruleScores.missingEvidence,
    });
  } catch (error) {
    console.error("Run eval error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
