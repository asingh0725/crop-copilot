export interface RetrievalQueryInput {
  description?: string | null;
  labData?: Record<string, unknown> | null;
  crop?: string | null;
  location?: string | null;
  growthStage?: string | null;
  type?: string | null;
}

export interface RetrievalPlan {
  query: string;
  topics: string[];
  sourceTitleHints: string[];
  crop?: string | null;
  region?: string | null;
}

const MAX_SIGNALS = 6;

export function buildRetrievalPlan(input: RetrievalQueryInput): RetrievalPlan {
  const parts: string[] = [];
  const topics = new Set<string>();
  const sourceTitleHints = new Set<string>();

  if (input.description) {
    parts.push(input.description);
  }

  if (input.crop) {
    parts.push(`Crop: ${input.crop}`);
  }

  if (input.location) {
    parts.push(`Location: ${input.location}`);
  }

  if (input.growthStage) {
    parts.push(`Growth stage: ${input.growthStage}`);
  }

  if (input.labData && typeof input.labData === "object") {
    const labData = input.labData as Record<string, unknown>;

    if (typeof labData.crop === "string") {
      parts.push(`Crop: ${labData.crop}`);
    }
    if (typeof labData.symptoms === "string") {
      parts.push(`Symptoms: ${labData.symptoms}`);
    }
    if (typeof labData.growthStage === "string") {
      parts.push(`Growth stage: ${labData.growthStage}`);
    }

    const signals = inferSoilSignals(labData);
    if (signals.length > 0) {
      parts.push(`Soil signals: ${signals.join(", ")}`);
    }
  }

  const textForDetection = [
    input.description,
    typeof input.labData === "object" ? (input.labData as any)?.symptoms : null,
  ]
    .filter(Boolean)
    .join(" ");

  const { topics: detectedTopics, sourceHints, extraTerms } =
    detectDiseaseHints(textForDetection, input.crop ?? null);

  detectedTopics.forEach((topic) => topics.add(topic));
  sourceHints.forEach((hint) => sourceTitleHints.add(hint));

  if (extraTerms.length > 0) {
    parts.push(`Disease focus: ${extraTerms.join(", ")}`);
  }

  const visualCues = extractVisualCues(textForDetection);
  if (visualCues.length > 0) {
    parts.push(`Visual cues: ${visualCues.join(", ")}`);
  }

  return {
    query: parts.filter(Boolean).join(". "),
    topics: Array.from(topics),
    sourceTitleHints: Array.from(sourceTitleHints),
    crop: input.crop ?? null,
    region: input.location ?? null,
  };
}

export function buildRetrievalQuery(input: RetrievalQueryInput): string {
  return buildRetrievalPlan(input).query;
}

type DiseaseHintResult = {
  topics: string[];
  sourceHints: string[];
  extraTerms: string[];
};

type DiseaseRule = {
  name: string;
  crops?: string[];
  patterns: RegExp[];
  topics: string[];
  sourceTitleHints: string[];
  extraTerms: string[];
};

const DISEASE_RULES: DiseaseRule[] = [
  {
    name: "tomato_bacterial_spot",
    crops: ["tomato"],
    patterns: [/bacterial spot/],
    topics: ["bacterial spot", "tomato bacterial disease"],
    sourceTitleHints: ["Bacterial diseases of tomato"],
    extraTerms: ["xanthomonas", "bacterial spot"],
  },
  {
    name: "tomato_bacterial_speck",
    crops: ["tomato"],
    patterns: [/bacterial speck/, /\bspeck\b/],
    topics: ["bacterial speck", "tomato bacterial disease"],
    sourceTitleHints: ["Bacterial diseases of tomato"],
    extraTerms: ["pseudomonas syringae", "bacterial speck"],
  },
  {
    name: "tomato_bacterial_canker",
    crops: ["tomato"],
    patterns: [/bacterial canker/, /bird'?s[- ]eye/],
    topics: ["bacterial canker", "tomato bacterial disease"],
    sourceTitleHints: ["Bacterial diseases of tomato"],
    extraTerms: ["clavibacter michiganensis", "bacterial canker"],
  },
  {
    name: "tomato_late_blight",
    crops: ["tomato"],
    patterns: [/late blight/],
    topics: ["late blight"],
    sourceTitleHints: ["tomato", "late blight"],
    extraTerms: ["phytophthora infestans", "late blight"],
  },
  {
    name: "grape_black_rot",
    crops: ["grape", "grapes"],
    patterns: [/black rot/],
    topics: ["black rot"],
    sourceTitleHints: ["Grape", "black rot", "Grape Pest Management"],
    extraTerms: ["guignardia bidwellii", "black rot"],
  },
  {
    name: "grape_esca",
    crops: ["grape", "grapes"],
    patterns: [/esca/, /black measles/, /tiger[- ]stripe/],
    topics: ["esca", "trunk disease"],
    sourceTitleHints: ["Grape", "trunk disease", "Grape Pest Management"],
    extraTerms: ["esca", "black measles", "trunk disease"],
  },
  {
    name: "grape_leaf_blight",
    crops: ["grape", "grapes"],
    patterns: [/leaf blight/, /isariopsis/],
    topics: ["leaf blight", "isariopsis leaf spot"],
    sourceTitleHints: ["Grape", "leaf blight", "Grape Pest Management"],
    extraTerms: ["isariopsis leaf spot", "leaf blight"],
  },
  {
    name: "soybean_frogeye",
    crops: ["soybean", "soybeans"],
    patterns: [/frogeye/, /cercospora sojina/],
    topics: ["frogeye leaf spot"],
    sourceTitleHints: ["Frogeye Leaf Spot", "foliar diseases of soybeans"],
    extraTerms: ["cercospora sojina", "frogeye leaf spot"],
  },
  {
    name: "soybean_phytophthora",
    crops: ["soybean", "soybeans"],
    patterns: [/phytophthora/, /root rot/],
    topics: ["phytophthora root rot"],
    sourceTitleHints: ["Phytophthora", "soybean pest management"],
    extraTerms: ["phytophthora sojae", "phytophthora root rot"],
  },
];

const VISUAL_CUE_RULES: Array<{ pattern: RegExp; cue: string }> = [
  { pattern: /water[- ]soaked/, cue: "water-soaked lesions" },
  { pattern: /yellow halo/, cue: "yellow halos" },
  { pattern: /halo/, cue: "yellow halos" },
  { pattern: /powdery/, cue: "powdery growth" },
  { pattern: /interveinal/, cue: "interveinal chlorosis" },
  { pattern: /tiger[- ]stripe/, cue: "tiger stripe pattern" },
  { pattern: /pustule/, cue: "pustules" },
  { pattern: /lesion/, cue: "leaf lesions" },
  { pattern: /spot/, cue: "leaf spots" },
  { pattern: /blight/, cue: "blight" },
  { pattern: /marginal scorch|scorch/, cue: "marginal scorch" },
  { pattern: /bird'?s[- ]eye/, cue: "bird's-eye lesions" },
  { pattern: /chlorosis/, cue: "chlorosis" },
];

function extractVisualCues(text: string): string[] {
  if (!text) return [];
  const lc = text.toLowerCase();
  const cues = new Set<string>();
  for (const rule of VISUAL_CUE_RULES) {
    if (rule.pattern.test(lc)) cues.add(rule.cue);
  }
  return Array.from(cues);
}

function detectDiseaseHints(text: string, crop: string | null): DiseaseHintResult {
  if (!text) return { topics: [], sourceHints: [], extraTerms: [] };
  const lc = text.toLowerCase();
  const cropLc = crop?.toLowerCase() ?? null;

  const topics = new Set<string>();
  const sourceHints = new Set<string>();
  const extraTerms = new Set<string>();

  for (const rule of DISEASE_RULES) {
    if (rule.crops && cropLc && !rule.crops.includes(cropLc)) {
      continue;
    }
    if (!rule.patterns.some((pattern) => pattern.test(lc))) {
      continue;
    }
    rule.topics.forEach((topic) => topics.add(topic));
    rule.sourceTitleHints.forEach((hint) => sourceHints.add(hint));
    rule.extraTerms.forEach((term) => extraTerms.add(term));
  }

  return {
    topics: Array.from(topics),
    sourceHints: Array.from(sourceHints),
    extraTerms: Array.from(extraTerms),
  };
}

function inferSoilSignals(labData: Record<string, unknown>): string[] {
  const signals: string[] = [];

  const getNumber = (value: unknown): number | null => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };

  const addSignal = (label: string) => {
    if (signals.length < MAX_SIGNALS && !signals.includes(label)) {
      signals.push(label);
    }
  };

  const ph = getNumber(labData.soilPh ?? labData.ph);
  if (ph !== null) {
    if (ph < 5.5) addSignal("acidic soil (low pH)");
    else if (ph > 7.8) addSignal("alkaline soil (high pH)");
  }

  const organicMatter = getNumber(labData.organicMatter);
  if (organicMatter !== null) {
    if (organicMatter < 2) addSignal("low organic matter");
    else if (organicMatter > 5) addSignal("high organic matter");
  }

  addLowHighSignal(getNumber(labData.nitrogen), 15, 60, "nitrogen", addSignal);
  addLowHighSignal(
    getNumber(labData.phosphorus),
    15,
    60,
    "phosphorus",
    addSignal
  );
  addLowHighSignal(
    getNumber(labData.potassium),
    120,
    250,
    "potassium",
    addSignal
  );
  addLowHighSignal(
    getNumber(labData.calcium),
    500,
    2000,
    "calcium",
    addSignal
  );
  addLowHighSignal(
    getNumber(labData.magnesium),
    60,
    200,
    "magnesium",
    addSignal
  );
  addLowHighSignal(getNumber(labData.sulfur), 10, 30, "sulfur", addSignal);
  addLowHighSignal(getNumber(labData.zinc), 1, 5, "zinc", addSignal);
  addLowHighSignal(
    getNumber(labData.manganese),
    5,
    30,
    "manganese",
    addSignal
  );
  addLowHighSignal(getNumber(labData.iron), 4, 20, "iron", addSignal);
  addLowHighSignal(getNumber(labData.copper), 0.5, 3, "copper", addSignal);
  addLowHighSignal(getNumber(labData.boron), 0.5, 2, "boron", addSignal);

  const cec = getNumber(labData.cec);
  if (cec !== null) {
    if (cec < 8) addSignal("low CEC");
    else if (cec > 20) addSignal("high CEC");
  }

  const baseSat = getNumber(labData.baseSaturation);
  if (baseSat !== null) {
    if (baseSat < 60) addSignal("low base saturation");
    else if (baseSat > 85) addSignal("high base saturation");
  }

  return signals;
}

function addLowHighSignal(
  value: number | null,
  low: number,
  high: number,
  label: string,
  addSignal: (label: string) => void
) {
  if (value === null) return;
  if (value < low) addSignal(`low ${label}`);
  else if (value > high) addSignal(`high ${label}`);
}
