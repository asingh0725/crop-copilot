import { readFileSync, writeFileSync } from "node:fs";
import { loadEnvConfig } from "@next/env";
import { prisma } from "@/lib/prisma";

type GapUrlEntry = {
  url: string;
  title?: string;
  crops?: string[];
  topics?: string[];
};

type GapSourceGroup = {
  institution?: string;
  baseUrl?: string;
  urls: GapUrlEntry[];
};

type GapFile = {
  sources: Record<string, GapSourceGroup>;
};

function normalizeList(values?: string[]) {
  if (!values) return [];
  return Array.from(
    new Set(
      values
        .map((value) => value.trim().toLowerCase())
        .filter((value) => value.length > 0)
    )
  );
}

function inferRegion(url: string | undefined) {
  if (!url) return undefined;
  const lc = url.toLowerCase();
  if (lc.includes("ontario.ca")) return "Ontario";
  if (lc.includes("gov.bc.ca")) return "British Columbia";
  if (lc.includes("agriculture.canada.ca")) return "Canada";
  if (lc.includes("ucanr.edu")) return "California";
  if (lc.includes("umn.edu")) return "Minnesota";
  if (lc.includes("iastate.edu")) return "Iowa";
  if (lc.includes("ksu.edu")) return "Kansas";
  if (lc.includes("manitobapulse.ca")) return "Manitoba";
  if (lc.includes("soybeanresearchinfo.com")) return "US Midwest";
  if (lc.includes("crop-protection-network")) return "US Midwest";
  return "US";
}

function deriveTopicsFromTitle(title?: string): string[] {
  if (!title) return [];
  const lc = title.toLowerCase();
  const topics: string[] = [];
  if (lc.includes("bacterial spot")) topics.push("bacterial spot");
  if (lc.includes("bacterial speck")) topics.push("bacterial speck");
  if (lc.includes("bacterial canker")) topics.push("bacterial canker");
  if (lc.includes("frogeye")) topics.push("frogeye leaf spot");
  if (lc.includes("phytophthora")) topics.push("phytophthora root rot");
  if (lc.includes("black rot")) topics.push("black rot");
  if (lc.includes("leaf blight")) topics.push("leaf blight");
  if (lc.includes("esca")) topics.push("esca");
  if (lc.includes("nutrient deficiency") || lc.includes("nutrientdeficiency")) {
    topics.push("nutrient deficiency");
  }
  if (lc.includes("ipm")) topics.push("ipm");
  return topics;
}

function normalizeUrl(value: string) {
  try {
    const parsed = new URL(value);
    const pathname = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.origin}${pathname}`;
  } catch {
    return value.replace(/[#?].*$/, "").replace(/\/+$/, "");
  }
}

function urlVariants(value: string) {
  const variants = new Set<string>();
  variants.add(value);
  const normalized = normalizeUrl(value);
  variants.add(normalized);
  variants.add(normalized.replace(/\/$/, ""));
  variants.add(normalized.replace(/\/pdf$/, ""));
  try {
    const parsed = new URL(value);
    const file = parsed.pathname.split("/").pop();
    if (file) variants.add(file);
  } catch {
    // ignore
  }
  return Array.from(variants).filter((v) => v.length > 5);
}

const URL_ALIAS_MAP: Record<string, string[]> = {
  "https://ipm.ucanr.edu/agriculture/grape/botryosphaeria-dieback": [
    "https://ipm.ucanr.edu/PDF/PMG/grape_trunk_disease_view.pdf",
  ],
  "https://ipm.ucanr.edu/agriculture/grape/cutworms": [
    "https://ipm.ucanr.edu/PMG/C302/grape-spurmonitor.pdf",
  ],
  "https://ipm.ucanr.edu/agriculture/grape/leafhoppers": [
    "https://ipm.ucanr.edu/PMG/C302/grape-leafhoprmite.pdf",
  ],
  "https://ipm.ucanr.edu/agriculture/grape/mealybugs-pseudococcus": [
    "https://ipm.ucanr.edu/PMG/C302/grape-leafhoprmite.pdf",
  ],
  "https://ipm.ucanr.edu/agriculture/grape/omnivorous-leafroller": [
    "https://ipm.ucanr.edu/PMG/C302/grape-catmon.pdf",
  ],
  "https://ipm.ucanr.edu/agriculture/grape/pheromone-traps": [
    "https://ipm.ucanr.edu/PMG/C302/grape-insectdegree-days.pdf",
  ],
  "https://ipm.ucanr.edu/agriculture/grape/sharpshooters": [
    "https://ipm.ucanr.edu/PMG/C302/grape-stickytrap.pdf",
  ],
  "https://ipm.ucanr.edu/agriculture/grape/webspinning-spider-mites": [
    "https://ipm.ucanr.edu/PMG/C302/grape-spurmonitor.pdf",
  ],
};

async function findSourceForEntry(entry: GapUrlEntry, groupKey: string) {
  if (entry.url) {
    const direct = await prisma.source.findFirst({
      where: { url: entry.url },
      select: { id: true, metadata: true, title: true, url: true },
    });
    if (direct) return direct;
  }

  if (entry.title) {
    const byTitle = await prisma.source.findFirst({
      where: { title: { contains: entry.title, mode: "insensitive" } },
      select: { id: true, metadata: true, title: true, url: true },
    });
    if (byTitle) return byTitle;
  }

  if (entry.url) {
    const variants = urlVariants(entry.url);
    const aliasUrls = URL_ALIAS_MAP[entry.url] || [];
    aliasUrls.forEach((alias) => variants.push(alias));
    for (const variant of variants) {
      if (variant.length < 12) continue;
      const byUrl = await prisma.source.findFirst({
        where: { url: { contains: variant, mode: "insensitive" } },
        select: { id: true, metadata: true, title: true, url: true },
      });
      if (byUrl) return byUrl;
    }
  }

  if (entry.url) {
    try {
      const parsed = new URL(entry.url);
      const domain = parsed.hostname.replace(/^www\./, "");
      const candidates = await prisma.source.findMany({
        where: { url: { contains: domain, mode: "insensitive" } },
        select: { id: true, metadata: true, title: true, url: true },
        take: 5,
      });
      if (candidates.length === 1) return candidates[0];
    } catch {
      // ignore
    }
  }

  if (entry.title) {
    const tokens = entry.title
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 5);
    if (tokens.length > 0) {
      const term = tokens[0];
      const byToken = await prisma.source.findFirst({
        where: { title: { contains: term, mode: "insensitive" } },
        select: { id: true, metadata: true, title: true, url: true },
      });
      if (byToken) return byToken;
    }
  }

  return null;
}

async function main() {
  loadEnvConfig(process.cwd());
  const gapRaw = readFileSync(
    "ingestion/sources/gap-urls.json",
    "utf-8"
  );
  const gapFile = JSON.parse(gapRaw) as GapFile;
  const entries: Array<GapUrlEntry & { groupKey: string }> = [];

  Object.entries(gapFile.sources).forEach(([groupKey, group]) => {
    group.urls.forEach((entry) => {
      entries.push({ ...entry, groupKey });
    });
  });

  let updatedSources = 0;
  let missingSources = 0;
  const missing: Array<GapUrlEntry & { groupKey: string }> = [];

  for (const entry of entries) {
    const source = await findSourceForEntry(entry, entry.groupKey);

    if (!source) {
      missingSources += 1;
      missing.push(entry);
      continue;
    }

    const existing = (source.metadata || {}) as Record<string, any>;
    const crops = normalizeList(entry.crops);
    const topics = normalizeList([
      ...(entry.topics || []),
      ...deriveTopicsFromTitle(entry.title || source.title || ""),
    ]);
    const region = existing.region ?? inferRegion(entry.url || source.url || "");

    const aliasUrls = entry.url ? [entry.url, ...(URL_ALIAS_MAP[entry.url] || [])] : [];
    const merged = {
      ...existing,
      crops: normalizeList([...(existing.crops || []), ...crops]),
      topics: normalizeList([...(existing.topics || []), ...topics]),
      region,
      sourceGroup: existing.sourceGroup ?? entry.groupKey,
      aliases: normalizeList([...(existing.aliases || []), ...aliasUrls]),
    };

    await prisma.source.update({
      where: { id: source.id },
      data: { metadata: merged },
    });

    const metaJson = JSON.stringify(merged);
    await prisma.$executeRaw`
      UPDATE "TextChunk"
      SET metadata = COALESCE(metadata, '{}'::jsonb) || ${metaJson}::jsonb
      WHERE "sourceId" = ${source.id}
    `;

    await prisma.$executeRaw`
      UPDATE "ImageChunk"
      SET metadata = COALESCE(metadata, '{}'::jsonb) || ${metaJson}::jsonb
      WHERE "sourceId" = ${source.id}
    `;

    updatedSources += 1;
  }

  console.log(
    `Tagged sources: ${updatedSources}. Missing sources: ${missingSources}.`
  );

  if (missing.length > 0) {
    const outputPath = "data/testing/gap-source-missing.json";
    writeFileSync(outputPath, `${JSON.stringify(missing, null, 2)}\n`, "utf-8");
    console.log(`Missing list saved to ${outputPath}`);
  }
}

main().catch((error) => {
  console.error("Tagging failed:", error);
  process.exit(1);
});
