/**
 * Auto-generates TestScenarios from existing recommendations.
 *
 * Uses each recommendation's own diagnosis as the baseline expected values,
 * then derives mustInclude/shouldAvoid from agronomic best practices
 * based on the conditionType.
 *
 * Usage:
 *   pnpm eval:seed                     # Seed all recommendations without scenarios
 *   pnpm eval:seed -- --limit=50       # Seed first 50
 *   pnpm eval:seed -- --dry-run        # Preview without writing to DB
 */

import { loadEnvConfig } from "@next/env";
import { prisma } from "@/lib/prisma";

loadEnvConfig(process.cwd());

// --- CLI Args ---
const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [k, ...rest] = arg.replace(/^--/, "").split("=");
    return [k, rest.join("=") || "true"];
  })
);

const limit = Number(args.get("limit") || 0);
const dryRun = args.get("dry-run") === "true";
const reseed = args.get("reseed") === "true";

// --- Agronomic best-practice rules by conditionType ---
// These define what a good recommendation SHOULD include and SHOULD avoid

const MUST_INCLUDE_BY_TYPE: Record<string, string[]> = {
  deficiency: [
    "soil or tissue",
    "rate",
    "timing",
  ],
  disease: [
    "diagnosis or differential",
    "fungicide or treatment",
    "resistance or rotation",
  ],
  pest: [
    "scout or monitor or threshold",
    "rotation or alternate",
    "timing",
  ],
  environmental: [
    "stress or damage",
    "recovery or mitigat",
  ],
  unknown: [
    "diagnos or test or confirm",
    "further or additional",
  ],
};

const SHOULD_AVOID_BY_TYPE: Record<string, string[]> = {
  deficiency: [
    "claiming certainty without test data",
    "single excessive application",
  ],
  disease: [
    "single chemistry overreliance",
    "high confidence without differential",
  ],
  pest: [
    "spray without threshold",
    "ignoring beneficial insects",
  ],
  environmental: [
    "overstating recovery certainty",
    "ignoring weather context",
  ],
  unknown: [
    "definitive diagnosis without evidence",
    "aggressive treatment without confirmation",
  ],
};

// --- Derive mustInclude from recommendation content ---
function deriveMustInclude(
  diagnosis: any,
  recommendations: any[],
  conditionType: string
): string[] {
  const items: string[] = [];

  // Base items from conditionType
  const baseItems = MUST_INCLUDE_BY_TYPE[conditionType] || MUST_INCLUDE_BY_TYPE.unknown;
  items.push(...baseItems);

  // Check if recommendation has timing info — if it does, it should always have it
  const hasTiming = recommendations.some(
    (r: any) => r.timing && r.timing.length > 0
  );
  if (hasTiming) {
    items.push("timing window");
  }

  // Check if recommendation cites sources — good practice
  const hasCitations = recommendations.some(
    (r: any) => r.citations && r.citations.length > 0
  );
  // These are already checked structurally by the scorer,
  // so we don't need them as text-matching mustInclude items

  return Array.from(new Set(items));
}

function deriveShouldAvoid(conditionType: string): string[] {
  return SHOULD_AVOID_BY_TYPE[conditionType] || SHOULD_AVOID_BY_TYPE.unknown;
}

// --- Main ---
async function main() {
  if (reseed) {
    // Delete all auto-seeded scenarios (those with inputId set) and their evaluations
    const existing = await prisma.testScenario.findMany({
      where: { inputId: { not: null } },
      select: { id: true },
    });
    if (existing.length > 0) {
      await prisma.evaluation.deleteMany({
        where: { scenarioId: { in: existing.map((s) => s.id) } },
      });
      await prisma.testScenario.deleteMany({
        where: { inputId: { not: null } },
      });
      console.log(`Deleted ${existing.length} existing auto-seeded scenarios and their evaluations`);
    }
  }

  // Find recommendations that don't already have a linked TestScenario
  const existingScenarioInputIds = await prisma.testScenario.findMany({
    select: { inputId: true },
    where: { inputId: { not: null } },
  });
  const existingInputIds = new Set(
    existingScenarioInputIds.map((s) => s.inputId).filter(Boolean)
  );

  let recommendations = await prisma.recommendation.findMany({
    include: { input: true },
    orderBy: { createdAt: "asc" as const },
  });

  // Filter out those that already have scenarios
  recommendations = recommendations.filter(
    (r) => r.input && !existingInputIds.has(r.input.id)
  );

  if (limit > 0) {
    recommendations = recommendations.slice(0, limit);
  }

  console.log(
    `Found ${recommendations.length} recommendations without scenarios${dryRun ? " (dry run)" : ""}`
  );

  let created = 0;
  let skipped = 0;
  const typeCounts: Record<string, number> = {};

  for (const rec of recommendations) {
    const diagnosis = rec.diagnosis as any;
    if (!diagnosis?.diagnosis?.condition || !diagnosis?.diagnosis?.conditionType) {
      skipped++;
      continue;
    }

    const input = rec.input!;
    const conditionType = diagnosis.diagnosis.conditionType;
    const recActions = diagnosis.recommendations || [];

    const scenario = {
      inputId: input.id,
      scenarioType: input.type === "LAB_REPORT" ? "LAB_REPORT" : "PHOTO",
      expectedDiagnosis: diagnosis.diagnosis.condition,
      expectedConditionType: conditionType,
      mustInclude: deriveMustInclude(diagnosis.diagnosis, recActions, conditionType),
      shouldAvoid: deriveShouldAvoid(conditionType),
      symptoms: input.description || diagnosis.diagnosis.reasoning?.slice(0, 200) || "See input",
      crop: input.crop || (input.labData as any)?.crop || "unknown",
      location: input.location || "unknown",
      season: input.season || undefined,
      sourceFocus: [] as string[],
    };

    typeCounts[conditionType] = (typeCounts[conditionType] || 0) + 1;

    if (dryRun) {
      if (created < 5) {
        console.log(`\n  Sample scenario #${created + 1}:`);
        console.log(`    Crop: ${scenario.crop}`);
        console.log(`    Location: ${scenario.location}`);
        console.log(`    Diagnosis: ${scenario.expectedDiagnosis}`);
        console.log(`    Type: ${scenario.expectedConditionType}`);
        console.log(`    Must include: ${scenario.mustInclude.join(", ")}`);
        console.log(`    Should avoid: ${scenario.shouldAvoid.join(", ")}`);
      }
    } else {
      await prisma.testScenario.create({ data: scenario });
    }

    created++;
  }

  console.log(`\n${dryRun ? "Would create" : "Created"}: ${created} scenarios`);
  console.log(`Skipped (no diagnosis data): ${skipped}`);
  console.log(`By condition type:`, typeCounts);
}

main()
  .catch((error) => {
    console.error("Seed scenarios failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
