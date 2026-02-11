import { prisma } from "@/lib/prisma";
import { getLearnedBoosts } from "@/lib/learning/feedback-signal";

export async function resolveSourceHints(
  hints: string[]
): Promise<{ requiredSourceIds: string[]; sourceBoosts: Record<string, number> }> {
  // Load learned boosts from user feedback (always, even without hints)
  const learnedBoosts = await getLearnedBoosts();

  if (!hints || hints.length === 0) {
    return {
      requiredSourceIds: [],
      sourceBoosts: learnedBoosts,
    };
  }

  const clauses = hints.map((hint) => ({
    OR: [
      { title: { contains: hint, mode: "insensitive" as const } },
      { url: { contains: hint, mode: "insensitive" as const } },
    ],
  }));

  const sources = await prisma.source.findMany({
    where: { OR: clauses },
    select: { id: true },
  });

  const requiredSourceIds = Array.from(
    new Set(sources.map((source) => source.id))
  );

  // Merge: static hint boosts + learned boosts (learned takes priority for conflicts)
  const sourceBoosts: Record<string, number> = { ...learnedBoosts };
  requiredSourceIds.forEach((id) => {
    sourceBoosts[id] = Math.min(0.25, (sourceBoosts[id] || 0) + 0.12);
  });

  return { requiredSourceIds, sourceBoosts };
}
