import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { BaselineRecord, TestScenario } from "./types";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [k, ...rest] = arg.replace(/^--/, "").split("=");
    return [k, rest.join("=") || "true"];
  })
);

const inputPath = resolve(
  process.cwd(),
  args.get("input") || "data/testing/baseline-mock-100.json"
);
const outputPath = resolve(
  process.cwd(),
  args.get("out") || "data/testing/retest-20.json"
);

function main() {
  const baseline = JSON.parse(
    readFileSync(inputPath, "utf-8")
  ) as BaselineRecord[];

  const sorted = [...baseline].sort((a, b) => {
    const scoreA = a.feedback.overallRating + a.feedback.accuracyRating;
    const scoreB = b.feedback.overallRating + b.feedback.accuracyRating;
    return scoreA - scoreB;
  });

  const lowPerformers = sorted.slice(0, 10).map((r) => r.scenario);
  const highPerformers = sorted.slice(-10).map((r) => r.scenario);

  const retestSet: TestScenario[] = [...lowPerformers, ...highPerformers];
  writeFileSync(outputPath, `${JSON.stringify(retestSet, null, 2)}\n`, "utf-8");

  console.log(`Prepared retest set with ${retestSet.length} scenarios.`);
  console.log(`- Low-performing scenarios: ${lowPerformers.length}`);
  console.log(`- High-performing scenarios: ${highPerformers.length}`);
  console.log(`Saved retest set to ${outputPath}`);
}

main();
