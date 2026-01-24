import fs from "fs";

const data = JSON.parse(
  fs.readFileSync("ingestion/sources/phase1-urls.json", "utf-8")
);

// Extract diverse URLs for test
const testUrls: any = {
  phase: 1,
  description: "Test subset for pipeline validation",
  totalUrls: 10,
  estimatedChunks: 250,
  sources: {},
};

// Helper to find URLs by criteria
function findUrls(
  sourceKey: string,
  crop: string,
  type: "pdf" | "html",
  limit: number,
  topicFilter?: string
) {
  const source = data.sources[sourceKey];
  if (!source) return [];

  return source.urls
    .filter(
      (u: any) =>
        u.crops.includes(crop) &&
        u.type === type &&
        (!topicFilter || u.topics.some((t: string) => t.includes(topicFilter)))
    )
    .slice(0, limit);
}

// Collect URLs for test subset
const selectedUrls = {
  // 4 corn URLs (2 PDF, 2 HTML) from Iowa State
  cornPdfs: findUrls("iowa_state", "corn", "pdf", 2),
  cornHtmls: findUrls("iowa_state", "corn", "html", 2),

  // 3 soybean URLs (2 PDF, 1 HTML) - try different sources
  soyPdfs: [] as any[],
  soyHtmls: [] as any[],

  // 3 wheat URLs (2 PDF, 1 HTML)
  wheatPdfs: [] as any[],
  wheatHtmls: [] as any[],
};

// Search for soybeans and wheat across all sources
Object.entries(data.sources).forEach(([key, source]: [string, any]) => {
  // Soybeans
  if (selectedUrls.soyPdfs.length < 2) {
    const pdfs = source.urls.filter(
      (u: any) => u.crops.includes("soybeans") && u.type === "pdf"
    );
    selectedUrls.soyPdfs.push(
      ...pdfs.slice(0, 2 - selectedUrls.soyPdfs.length)
    );
  }

  if (selectedUrls.soyHtmls.length < 1) {
    const htmls = source.urls.filter(
      (u: any) => u.crops.includes("soybeans") && u.type === "html"
    );
    selectedUrls.soyHtmls.push(
      ...htmls.slice(0, 1 - selectedUrls.soyHtmls.length)
    );
  }

  // Wheat
  if (selectedUrls.wheatPdfs.length < 2) {
    const pdfs = source.urls.filter(
      (u: any) => u.crops.includes("wheat") && u.type === "pdf"
    );
    selectedUrls.wheatPdfs.push(
      ...pdfs.slice(0, 2 - selectedUrls.wheatPdfs.length)
    );
  }

  if (selectedUrls.wheatHtmls.length < 1) {
    const htmls = source.urls.filter(
      (u: any) => u.crops.includes("wheat") && u.type === "html"
    );
    selectedUrls.wheatHtmls.push(
      ...htmls.slice(0, 1 - selectedUrls.wheatHtmls.length)
    );
  }
});

// Combine all selected URLs
const allSelected = [
  ...selectedUrls.cornPdfs,
  ...selectedUrls.cornHtmls,
  ...selectedUrls.soyPdfs,
  ...selectedUrls.soyHtmls,
  ...selectedUrls.wheatPdfs,
  ...selectedUrls.wheatHtmls,
];

console.log("\n📊 Test URL Selection:");
console.log(`  Corn PDFs: ${selectedUrls.cornPdfs.length}`);
console.log(`  Corn HTMLs: ${selectedUrls.cornHtmls.length}`);
console.log(`  Soybean PDFs: ${selectedUrls.soyPdfs.length}`);
console.log(`  Soybean HTMLs: ${selectedUrls.soyHtmls.length}`);
console.log(`  Wheat PDFs: ${selectedUrls.wheatPdfs.length}`);
console.log(`  Wheat HTMLs: ${selectedUrls.wheatHtmls.length}`);
console.log(`  Total: ${allSelected.length}\n`);

// Group by source
const bySource: Record<string, any> = {};

allSelected.forEach((url) => {
  // Determine source from URL
  let sourceKey = "unknown";
  let institution = "Unknown";

  Object.entries(data.sources).forEach(([key, source]: [string, any]) => {
    if (source.urls.some((u: any) => u.url === url.url)) {
      sourceKey = key;
      institution = source.institution;
    }
  });

  if (!bySource[sourceKey]) {
    bySource[sourceKey] = {
      institution,
      baseUrl: data.sources[sourceKey]?.baseUrl || "",
      priority: data.sources[sourceKey]?.priority || "high",
      urlCount: 0,
      urls: [],
    };
  }

  bySource[sourceKey].urls.push(url);
  bySource[sourceKey].urlCount++;
});

testUrls.sources = bySource;
testUrls.totalUrls = allSelected.length;

// Save test-urls.json
fs.writeFileSync(
  "ingestion/sources/test-urls.json",
  JSON.stringify(testUrls, null, 2)
);

console.log("✅ Created ingestion/sources/test-urls.json");
console.log("\n📋 Sources included:");
Object.entries(bySource).forEach(([key, source]: [string, any]) => {
  console.log(`  ${source.institution}: ${source.urlCount} URLs`);
});
