import { prisma } from "@/lib/prisma";

interface AuditCandidate {
  id: string;
  similarity: number;
  sourceId: string;
}

export async function logRetrievalAudit(params: {
  inputId: string;
  recommendationId: string;
  plan: { query: string; topics: string[]; sourceTitleHints: string[] };
  requiredSourceIds: string[];
  textCandidates: AuditCandidate[];
  imageCandidates: AuditCandidate[];
  assembledChunkIds: string[];
  citedChunkIds: string[];
}): Promise<void> {
  try {
    const allCandidates = [
      ...params.textCandidates.map((c) => ({ ...c, type: "text" as const })),
      ...params.imageCandidates.map((c) => ({ ...c, type: "image" as const })),
    ];

    const citedSet = new Set(params.citedChunkIds);
    const assembledSet = new Set(params.assembledChunkIds);

    const candidateChunks = allCandidates.map((c) => ({
      id: c.id,
      sourceId: c.sourceId,
      similarity: c.similarity,
      type: c.type,
      assembled: assembledSet.has(c.id),
      cited: citedSet.has(c.id),
    }));

    const usedChunks = candidateChunks.filter((c) => c.cited);

    const missedChunks = candidateChunks.filter(
      (c) => !c.cited && c.similarity > 0.4
    );

    await prisma.retrievalAudit.create({
      data: {
        inputId: params.inputId,
        recommendationId: params.recommendationId,
        query: params.plan.query,
        topics: params.plan.topics,
        sourceHints: params.plan.sourceTitleHints,
        requiredSourceIds: params.requiredSourceIds,
        candidateChunks,
        usedChunks,
        missedChunks,
      },
    });
  } catch (error) {
    // Fire-and-forget: never block the response
    console.error("Failed to log retrieval audit:", error);
  }
}
