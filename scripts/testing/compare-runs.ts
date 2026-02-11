import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { BaselineRecord } from "./types";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [k, ...rest] = arg.replace(/^--/, "").split("=");
    return [k, rest.join("=") || "true"];
  })
);

const baselinePath = resolve(
  process.cwd(),
  args.get("baseline") || "data/testing/baseline-mock-100.json"
);
const postPath = resolve(
  process.cwd(),
  args.get("post") || "data/testing/post-update-mock-20.json"
);

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function metrics(rows: BaselineRecord[]) {
  return {
    avgOverall: mean(rows.map((r) => r.feedback.overallRating)),
    avgAccuracy: mean(rows.map((r) => r.feedback.accuracyRating)),
    helpfulRate:
      rows.filter((r) => r.feedback.helpful).length / Math.max(rows.length, 1),
    issueRate:
      rows.filter((r) => r.feedback.issueTags.length > 0).length /
      Math.max(rows.length, 1),
  };
}

function fmt(n: number): string {
  return n.toFixed(2);
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function main() {
  const baseline = JSON.parse(
    readFileSync(baselinePath, "utf-8")
  ) as BaselineRecord[];
  const post = JSON.parse(readFileSync(postPath, "utf-8")) as BaselineRecord[];

  const b = metrics(baseline);
  const p = metrics(post);

  console.log("Metric comparison (baseline -> post-update):");
  console.log(
    `- Avg Overall Rating: ${fmt(b.avgOverall)} -> ${fmt(p.avgOverall)} (Δ ${fmt(p.avgOverall - b.avgOverall)})`
  );
  console.log(
    `- Avg Accuracy Rating: ${fmt(b.avgAccuracy)} -> ${fmt(p.avgAccuracy)} (Δ ${fmt(p.avgAccuracy - b.avgAccuracy)})`
  );
  console.log(
    `- Helpful Rate: ${pct(b.helpfulRate)} -> ${pct(p.helpfulRate)} (Δ ${pct(p.helpfulRate - b.helpfulRate)})`
  );
  console.log(
    `- Issue Rate: ${pct(b.issueRate)} -> ${pct(p.issueRate)} (Δ ${pct(p.issueRate - b.issueRate)})`
  );
}

main();
