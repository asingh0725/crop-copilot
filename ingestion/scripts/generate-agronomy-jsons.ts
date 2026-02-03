#!/usr/bin/env tsx
import fs from "fs/promises";
import path from "path";
import { gunzipSync } from "zlib";
import { validateUrl } from "../processing/url-validator";
import type { AgronomyDomain, AgronomyFile, AgronomyProblem } from "../types/agronomy";

const OUTPUT_DIR = "ingestion/sources/agronomy";
const DEFAULT_TARGET_URLS = 50;
const DEFAULT_MAX_CANDIDATES = 400;
const DEFAULT_MAX_TOTAL_URLS = 6000;
const DEFAULT_CONCURRENCY = 12;

type RegionKey =
  | "US Pacific Northwest"
  | "US California"
  | "US Southwest"
  | "US Great Plains"
  | "US Midwest"
  | "US Southeast"
  | "US Northeast"
  | "CA Prairies"
  | "CA Ontario+Quebec"
  | "CA Atlantic"
  | "CA British Columbia"
  | "CA North";

const REGION_MAP: Record<RegionKey, { macro: string; states: string[]; provinces: string[]; authority: Array<"EPA" | "PMRA"> }> = {
  "US Pacific Northwest": {
    macro: "Pacific Northwest",
    states: ["Washington", "Oregon", "Idaho"],
    provinces: [],
    authority: ["EPA"],
  },
  "US California": {
    macro: "California",
    states: ["California"],
    provinces: [],
    authority: ["EPA"],
  },
  "US Southwest": {
    macro: "Southwest",
    states: ["Arizona", "New Mexico", "Nevada", "Utah"],
    provinces: [],
    authority: ["EPA"],
  },
  "US Great Plains": {
    macro: "Great Plains",
    states: ["Montana", "Wyoming", "Colorado", "North Dakota", "South Dakota", "Nebraska", "Kansas", "Oklahoma"],
    provinces: [],
    authority: ["EPA"],
  },
  "US Midwest": {
    macro: "Midwest",
    states: ["Minnesota", "Iowa", "Missouri", "Wisconsin", "Illinois", "Indiana", "Michigan", "Ohio"],
    provinces: [],
    authority: ["EPA"],
  },
  "US Southeast": {
    macro: "Southeast",
    states: ["Texas", "Arkansas", "Louisiana", "Mississippi", "Alabama", "Georgia", "Florida", "South Carolina", "North Carolina", "Tennessee", "Kentucky", "Virginia"],
    provinces: [],
    authority: ["EPA"],
  },
  "US Northeast": {
    macro: "Northeast",
    states: ["West Virginia", "Pennsylvania", "New York", "Vermont", "New Hampshire", "Maine", "Massachusetts", "Rhode Island", "Connecticut", "New Jersey", "Delaware", "Maryland"],
    provinces: [],
    authority: ["EPA"],
  },
  "CA Prairies": {
    macro: "Canadian Prairies",
    states: [],
    provinces: ["Alberta", "Saskatchewan", "Manitoba"],
    authority: ["PMRA"],
  },
  "CA Ontario+Quebec": {
    macro: "Ontario and Quebec",
    states: [],
    provinces: ["Ontario", "Quebec"],
    authority: ["PMRA"],
  },
  "CA Atlantic": {
    macro: "Atlantic Canada",
    states: [],
    provinces: ["New Brunswick", "Nova Scotia", "Prince Edward Island", "Newfoundland and Labrador"],
    authority: ["PMRA"],
  },
  "CA British Columbia": {
    macro: "British Columbia",
    states: [],
    provinces: ["British Columbia"],
    authority: ["PMRA"],
  },
  "CA North": {
    macro: "Northern Canada",
    states: [],
    provinces: ["Yukon", "Northwest Territories", "Nunavut"],
    authority: ["PMRA"],
  },
};

const CROP_GROUPS: Record<string, string[]> = {
  cereals: ["wheat", "corn", "rice", "barley", "oats", "sorghum"],
  legumes: ["soybeans", "peas", "beans", "lentils", "peanuts"],
  solanaceae: ["tomatoes", "potatoes", "peppers"],
  cole: ["cabbage", "broccoli", "cauliflower", "kale"],
  leafy: ["lettuce", "spinach"],
  cucurbits: ["cucumbers", "watermelon"],
  pome_stone: ["apples", "peaches", "cherries"],
  vine_smallfruit: ["grapes", "strawberries", "blueberries"],
  other_oil: ["sunflower", "canola"],
  other_fiber: ["cotton", "sugarcane", "alfalfa"],
};

const DOMAINS: AgronomyDomain[] = ["disease", "pest", "nutrients", "growth-stages", "management"];

const REGION_GROUP_PAIRS: Record<RegionKey, string[]> = {
  "US Pacific Northwest": ["solanaceae", "pome_stone"],
  "US California": ["vine_smallfruit", "cucurbits"],
  "US Southwest": ["other_fiber", "cucurbits"],
  "US Great Plains": ["cereals", "other_oil"],
  "US Midwest": ["cereals", "legumes"],
  "US Southeast": ["legumes", "other_fiber"],
  "US Northeast": ["pome_stone", "leafy"],
  "CA Prairies": ["cereals", "other_oil"],
  "CA Ontario+Quebec": ["solanaceae", "leafy"],
  "CA Atlantic": ["solanaceae", "vine_smallfruit"],
  "CA British Columbia": ["pome_stone", "vine_smallfruit"],
  "CA North": ["cereals", "legumes"],
};

const SOURCE_SEEDS = [
  // Pacific Northwest
  { region: "US Pacific Northwest", domains: ["disease"], baseUrl: "https://pnwhandbooks.org/plantdisease", include: [/plantdisease/i] },
  { region: "US Pacific Northwest", domains: ["pest"], baseUrl: "https://pnwhandbooks.org/insect", include: [/insect/i] },
  { region: "US Pacific Northwest", domains: ["management", "nutrients", "growth-stages"], baseUrl: "https://extension.oregonstate.edu", include: [/crop|plant|pest|disease|nutrient|fertil|vegetable|fruit|grain|field/i] },
  // California
  { region: "US California", domains: ["disease", "pest", "management"], baseUrl: "https://ipm.ucanr.edu", include: [/guidelines|pest|disease|crop|plant/i] },
  { region: "US California", domains: ["nutrients", "growth-stages"], baseUrl: "https://ucanr.edu", include: [/crop|plant|nutrient|fertil|management|hort|ag/i] },
  // Midwest
  { region: "US Midwest", domains: ["disease", "pest", "management", "nutrients", "growth-stages"], baseUrl: "https://crops.extension.iastate.edu", include: [/crop|field|corn|soy|wheat|disease|pest|nutrient|management/i] },
  { region: "US Midwest", domains: ["disease", "pest", "management"], baseUrl: "https://extension.purdue.edu", include: [/crop|plant|pest|disease|management|agriculture/i] },
  { region: "US Midwest", domains: ["disease", "pest", "management"], baseUrl: "https://extension.umn.edu", include: [/crop|plant|pest|disease|management|agriculture/i] },
  { region: "US Midwest", domains: ["disease", "pest", "management", "nutrients", "growth-stages"], baseUrl: "https://extension.missouri.edu", include: [/crop|plant|pest|disease|management|agriculture|fertil|nutrient/i] },
  { region: "US Midwest", domains: ["disease", "pest", "management", "nutrients", "growth-stages"], baseUrl: "https://www.canr.msu.edu", include: [/crop|plant|pest|disease|management|agriculture|fertil|nutrient/i] },
  { region: "US Midwest", domains: ["disease", "pest", "management"], baseUrl: "https://extension.illinois.edu", include: [/crop|plant|pest|disease|management|agriculture/i] },
  // Great Plains
  { region: "US Great Plains", domains: ["disease", "pest", "management"], baseUrl: "https://cropwatch.unl.edu", include: [/crop|field|corn|soy|wheat|disease|pest|management/i] },
  { region: "US Great Plains", domains: ["disease", "pest", "management"], baseUrl: "https://www.sdstate.edu", include: [/extension|crop|plant|pest|disease|management/i] },
  { region: "US Great Plains", domains: ["disease", "pest", "management", "nutrients", "growth-stages"], baseUrl: "https://extension.okstate.edu", include: [/crop|plant|pest|disease|management|agriculture|fertil|nutrient/i] },
  // Southeast
  { region: "US Southeast", domains: ["disease", "pest", "management", "nutrients", "growth-stages"], baseUrl: "https://extension.uga.edu", include: [/crop|plant|pest|disease|management|agriculture/i] },
  { region: "US Southeast", domains: ["disease", "pest", "management"], baseUrl: "https://edis.ifas.ufl.edu", include: [/crop|plant|pest|disease|management|fertil|nutrient/i] },
  { region: "US Southeast", domains: ["disease", "pest", "management"], baseUrl: "https://extension.msstate.edu", include: [/crop|plant|pest|disease|management|agriculture/i] },
  { region: "US Southeast", domains: ["disease", "pest", "management", "nutrients", "growth-stages"], baseUrl: "https://www.uaex.uada.edu", include: [/crop|plant|pest|disease|management|agriculture|fertil|nutrient/i] },
  // Northeast
  { region: "US Northeast", domains: ["disease", "pest", "management", "nutrients", "growth-stages"], baseUrl: "https://extension.psu.edu", include: [/crop|plant|pest|disease|management|agriculture/i] },
  { region: "US Northeast", domains: ["disease", "pest", "management"], baseUrl: "https://extension.umaine.edu", include: [/crop|plant|pest|disease|management|agriculture/i] },
  { region: "US Northeast", domains: ["disease", "pest", "management"], baseUrl: "https://extension.cornell.edu", include: [/crop|plant|pest|disease|management|agriculture/i] },
  // Canada Prairies
  { region: "CA Prairies", domains: ["disease", "pest", "management", "nutrients", "growth-stages"], baseUrl: "https://www.alberta.ca", include: [/agriculture|crop|plant|pest|disease|fertil|nutrient/i] },
  { region: "CA Prairies", domains: ["disease", "pest", "management"], baseUrl: "https://www.saskatchewan.ca", include: [/agriculture|crop|plant|pest|disease|fertil|nutrient/i] },
  { region: "CA Prairies", domains: ["disease", "pest", "management"], baseUrl: "https://www.gov.mb.ca", include: [/agriculture|crop|plant|pest|disease|fertil|nutrient/i] },
  // Canada Ontario+Quebec
  { region: "CA Ontario+Quebec", domains: ["disease", "pest", "management"], baseUrl: "https://www.ontario.ca", include: [/agriculture|crop|plant|pest|disease|fertil|nutrient/i] },
  { region: "CA Ontario+Quebec", domains: ["disease", "pest", "management"], baseUrl: "https://www.quebec.ca", include: [/agriculture|crop|plant|pest|disease|fertil|nutrient/i] },
  // Canada Atlantic
  { region: "CA Atlantic", domains: ["disease", "pest", "management"], baseUrl: "https://www2.gnb.ca", include: [/agriculture|crop|plant|pest|disease|fertil|nutrient/i] },
  { region: "CA Atlantic", domains: ["disease", "pest", "management"], baseUrl: "https://www.princeedwardisland.ca", include: [/agriculture|crop|plant|pest|disease|fertil|nutrient/i] },
  { region: "CA Atlantic", domains: ["disease", "pest", "management"], baseUrl: "https://novascotia.ca", include: [/agriculture|crop|plant|pest|disease|fertil|nutrient/i] },
  { region: "CA Atlantic", domains: ["disease", "pest", "management", "nutrients", "growth-stages"], baseUrl: "https://www.perennia.ca", include: [/pest|disease|crop|potato|fruit|vegetable|guide/i] },
  // Canada British Columbia
  { region: "CA British Columbia", domains: ["disease", "pest", "management"], baseUrl: "https://www2.gov.bc.ca", include: [/agriculture|crop|plant|pest|disease|fertil|nutrient/i] },
  // Canada North
  { region: "CA North", domains: ["management", "nutrients", "growth-stages"], baseUrl: "https://www.canada.ca", include: [/agriculture|crop|plant|pest|disease|fertil|nutrient/i] },
];

type SeedEntry = {
  region: RegionKey | "ALL";
  domains: AgronomyDomain[];
  url: string;
  include?: string[];
};

const DEFAULT_SEED_PAGES: SeedEntry[] = [
  // Pacific Northwest
  { region: "US Pacific Northwest", domains: ["disease"], url: "https://pnwhandbooks.org/plantdisease", include: ["/plantdisease/"] },
  { region: "US Pacific Northwest", domains: ["disease"], url: "https://pnwhandbooks.org/plantdisease/host-and-disease-descriptions", include: ["/plantdisease/host-disease/"] },
  { region: "US Pacific Northwest", domains: ["disease"], url: "https://pnwhandbooks.org/handbook/plant-disease", include: ["/plantdisease/"] },
  { region: "US Pacific Northwest", domains: ["pest"], url: "https://pnwhandbooks.org/insect", include: ["/insect/"] },
  { region: "US Pacific Northwest", domains: ["pest"], url: "https://pnwhandbooks.org/handbook/insect", include: ["/insect/"] },
  { region: "US Pacific Northwest", domains: ["management"], url: "https://pnwhandbooks.org/weed", include: ["/weed/"] },
  { region: "US Pacific Northwest", domains: ["management"], url: "https://pnwhandbooks.org/handbook/weed", include: ["/weed/"] },
  { region: "US Pacific Northwest", domains: ["management"], url: "https://cpg.treefruit.wsu.edu/", include: ["/"] },
  { region: "US Pacific Northwest", domains: ["growth-stages", "management"], url: "https://treefruit.wsu.edu/crop-protection/", include: ["/"] },
  { region: "US Pacific Northwest", domains: ["management", "nutrients"], url: "https://potatoes.wsu.edu/", include: ["/"] },
  { region: "US Pacific Northwest", domains: ["management", "nutrients"], url: "https://www.uidaho.edu/idaho-ag-experiment-station/potatoes/production", include: ["/"] },

  // California
  { region: "US California", domains: ["pest", "disease", "management"], url: "https://ipm.ucanr.edu/", include: ["/PMG/"] },
  { region: "US California", domains: ["pest", "disease", "management"], url: "https://ipm.ucanr.edu/PMG/menu.homegarden.html", include: ["/PMG/"] },
  { region: "US California", domains: ["pest", "disease", "management"], url: "https://ipm.ucanr.edu/PMG/menu.crop.html", include: ["/PMG/"] },
  { region: "US California", domains: ["pest", "disease", "management"], url: "https://ipm.ucanr.edu/PMG/crops-agriculture.html", include: ["/PMG/"] },
  { region: "US California", domains: ["pest", "disease", "management"], url: "https://ipm.ucanr.edu/ipmproject/ads/manual_gardenfarms.html", include: ["/IPMPROJECT/ADS/"] },
  { region: "US California", domains: ["nutrients"], url: "https://www.cdfa.ca.gov/is/ffldrs/frep/FertilizationGuidelines/", include: ["/FertilizationGuidelines/"] },

  // Midwest
  { region: "US Midwest", domains: ["disease", "pest", "management"], url: "https://crops.extension.iastate.edu/crops", include: ["/crops/"] },
  { region: "US Midwest", domains: ["disease", "pest", "management"], url: "https://extension.umn.edu/crop-production", include: ["/crop-production"] },
  { region: "US Midwest", domains: ["management", "nutrients"], url: "https://extensionpubs.osu.edu/2025-midwest-vegetable-production-guide-for-c", include: ["/"] },
  { region: "US Midwest", domains: ["management"], url: "https://www.canr.msu.edu/vegetables/resources/", include: ["/vegetables/resources/"] },
  { region: "US Midwest", domains: ["management"], url: "https://www.canr.msu.edu/resources/weed_control_guide_for_field_crops_e0434", include: ["/resources/"] },

  // Great Plains
  { region: "US Great Plains", domains: ["disease", "pest", "management"], url: "https://cropwatch.unl.edu", include: ["/"] },
  { region: "US Great Plains", domains: ["management"], url: "https://extensionpubs.unl.edu/publication/763/html/view", include: ["/publication/"] },
  { region: "US Great Plains", domains: ["management"], url: "https://digitalcommons.unl.edu/cgi/viewcontent.cgi?article=3878&context=extensionhist", include: ["/cgi/"] },
  { region: "US Great Plains", domains: ["disease", "pest", "management"], url: "https://boulder.extension.colostate.edu/agriculture/agriculture-fact-sheets/", include: ["/topic-areas/", "/resource/"] },
  { region: "US Great Plains", domains: ["disease", "pest", "management"], url: "https://boulder.extension.colostate.edu/agriculture/", include: ["/topic-areas/", "/resource/"] },

  // Southeast
  { region: "US Southeast", domains: ["management"], url: "https://edis.ifas.ufl.edu/publication/PI301", include: ["/publication/"] },
  { region: "US Southeast", domains: ["management"], url: "https://extension.msstate.edu/sites/default/files/publications/P2471_2025_web.pdf", include: [".pdf"] },
  { region: "US Southeast", domains: ["management"], url: "https://fieldreport.caes.uga.edu/wp-content/uploads/2025/08/AP-124-4_2.pdf", include: [".pdf"] },
  { region: "US Southeast", domains: ["management"], url: "https://fieldreport.caes.uga.edu/wp-content/uploads/2025/08/B-1146_2.pdf", include: [".pdf"] },

  // Northeast
  { region: "US Northeast", domains: ["management"], url: "https://extension.psu.edu/commercial-vegetable-production-recommendations", include: ["/commercial-vegetable-production-recommendations"] },
  { region: "US Northeast", domains: ["management"], url: "https://njaes.rutgers.edu/pubs/commercial-veg-rec/general-production-recomm", include: ["/pubs/"] },
  { region: "US Northeast", domains: ["management"], url: "https://extension.umaine.edu/potatoes/ipm/", include: ["/potatoes/"] },
  { region: "US Northeast", domains: ["management"], url: "https://extension.psu.edu/forage-and-food-crops/fruit/production-and-harvesting", include: ["/fruit/production-and-harvesting"] },
  { region: "US Northeast", domains: ["management"], url: "https://nevegetable.org/", include: ["/"] },
  { region: "US Northeast", domains: ["management"], url: "https://njaes.rutgers.edu/pubs/commercial-veg-rec/", include: ["/pubs/commercial-veg-rec/"] },

  // Canada Prairies
  { region: "CA Prairies", domains: ["management"], url: "https://www.albertabluebook.com/", include: ["/"] },
  { region: "CA Prairies", domains: ["management"], url: "https://www.saskatchewan.ca/business/agriculture-natural-resources-and-industry/agribusiness-farmers-and-ranchers/crops-and-irrigation/crop-guides-and-publications/guide-to-crop-protection", include: ["/guide-to-crop-protection"] },
  { region: "CA Prairies", domains: ["management"], url: "https://www.gov.mb.ca/agriculture/crops/guides-and-publications/", include: ["/agriculture/crops/guides-and-publications/"] },
  { region: "CA Prairies", domains: ["management"], url: "https://www.gov.mb.ca/agriculture/crops/guides-and-publications/print%2Cindex.html", include: ["/agriculture/crops/guides-and-publications/"] },
  { region: "CA Prairies", domains: ["management"], url: "https://www.gov.mb.ca/agriculture/crops/guides-and-publications/pubs/guide-crop-protection-2025.pdf", include: [".pdf"] },
  { region: "CA Prairies", domains: ["management"], url: "https://albertacanola.com/grower-resources/agronomy/", include: ["/grower-resources/"] },
  { region: "CA Prairies", domains: ["management"], url: "https://www.albertagrains.com/agronomy", include: ["/agronomy"] },

  // Canada Ontario+Quebec
  { region: "CA Ontario+Quebec", domains: ["management"], url: "https://www.ontario.ca/page/publication-839-guide-vegetable-production-ontario", include: ["/guide-vegetable-production"] },
  { region: "CA Ontario+Quebec", domains: ["management"], url: "https://www.ontariopotatoes.ca/growing-potatoes-1", include: ["/growing-potatoes"] },
  { region: "CA Ontario+Quebec", domains: ["management"], url: "https://www.ontario.ca/laws/regulation/990247", include: ["/laws/regulation/"] },
  { region: "CA Ontario+Quebec", domains: ["management"], url: "https://www.ontario.ca/page/ontario-crop-protection-hub", include: ["/crop-protection"] },
  { region: "CA Ontario+Quebec", domains: ["disease"], url: "https://www.ontario.ca/page/downy-mildew-cucurbits", include: ["/downy-mildew"] },
  { region: "CA Ontario+Quebec", domains: ["disease"], url: "https://www.ontario.ca/page/bacterial-diseases-tomato-bacterial-spot-bacterial-speck-and-bacterial-canker", include: ["/bacterial-diseases"] },
  { region: "CA Ontario+Quebec", domains: ["pest"], url: "https://www.ontario.ca/page/flea-beetles-crucifer-crops", include: ["/flea-beetles"] },
  { region: "CA Ontario+Quebec", domains: ["management"], url: "https://www.ontario.ca/page/publication-836a-integrated-pest-management-greenhouse-fruits-and-vegetables", include: ["/publication-836a"] },
  { region: "CA Ontario+Quebec", domains: ["management"], url: "https://www.ontario.ca/page/publication-836b-guide-production-greenhouse-fruits-and-vegetables", include: ["/publication-836b"] },

  // Canada Atlantic
  { region: "CA Atlantic", domains: ["management"], url: "https://www2.gnb.ca/content/gnb/en/departments/10/agriculture/content/crops/potatoes.html", include: ["/crops/"] },
  { region: "CA Atlantic", domains: ["management"], url: "https://www.princeedwardisland.ca/sites/default/files/publications/potato_guide_2016.pdf", include: [".pdf"] },
  { region: "CA Atlantic", domains: ["management"], url: "https://agri.gnb.ca/010-001/Index.aspx?lang=en", include: ["/010-001/"] },
  { region: "CA Atlantic", domains: ["management", "pest"], url: "https://www.perennia.ca/onlinepestmanagementguide/", include: ["/"] },

  // Canada British Columbia
  { region: "CA British Columbia", domains: ["management"], url: "https://www2.gov.bc.ca/gov/content/industry/agriculture-seafood/crops", include: ["/agriculture-seafood/crops"] },
];

const SEED_CONFIG_PATH = "ingestion/sources/agronomy-seeds.json";
const URL_POOL_PATH = "ingestion/sources/agronomy-url-pool.json";

const cliArgs = new Set(process.argv.slice(2));

type GeneratorOptions = {
  skipValidation: boolean;
  targetUrlsPerJson: number;
  maxCandidatesPerJson: number;
  maxTotalUrls: number;
  concurrency: number;
};

let options: GeneratorOptions = {
  skipValidation: false,
  targetUrlsPerJson: DEFAULT_TARGET_URLS,
  maxCandidatesPerJson: DEFAULT_MAX_CANDIDATES,
  maxTotalUrls: DEFAULT_MAX_TOTAL_URLS,
  concurrency: DEFAULT_CONCURRENCY,
};

function parseNumberFlag(flag: string, fallback: number): number {
  const arg = process.argv.find((value) => value.startsWith(`${flag}=`));
  if (!arg) return fallback;
  const raw = arg.split("=", 2)[1];
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseOptions(): GeneratorOptions {
  return {
    skipValidation: cliArgs.has("--skip-validation"),
    targetUrlsPerJson: parseNumberFlag("--target-urls", DEFAULT_TARGET_URLS),
    maxCandidatesPerJson: parseNumberFlag("--max-candidates", DEFAULT_MAX_CANDIDATES),
    maxTotalUrls: parseNumberFlag("--max-total-urls", DEFAULT_MAX_TOTAL_URLS),
    concurrency: parseNumberFlag("--concurrency", DEFAULT_CONCURRENCY),
  };
}

function buildProblemTemplates(domain: AgronomyDomain): AgronomyProblem[] {
  if (domain === "disease") {
    return [
      {
        name: "General Disease Identification and Management",
        scientificName: null,
        severityClasses: ["low", "medium", "high"],
        signals: {
          visual: {
            positiveIndicators: ["Lesions, discoloration, blights, wilts, or rots"],
            negativeIndicators: ["Uniform discoloration without lesions (possible abiotic)"],
            imageSources: [],
          },
          contextual: {
            growthStages: ["All stages"],
            weatherTriggers: ["Extended leaf wetness", "High humidity"],
            rotationRisk: ["Short rotations with host crops"],
          },
        },
        decisionLogic: {
          scoutingThresholds: [{ condition: "Symptoms increasing in field", action: "Intensify scouting and confirm diagnosis" }],
          preventativeActions: ["Use resistant varieties", "Rotate crops"],
          curativeActions: [
            {
              type: "chemical",
              constraints: { requiresRotation: true, regulatoryCheck: true, phiRelevant: true },
            },
          ],
        },
        sources: [],
      },
    ];
  }

  if (domain === "pest") {
    return [
      {
        name: "General Pest Identification and Thresholds",
        scientificName: null,
        severityClasses: ["low", "medium", "high"],
        signals: {
          visual: {
            positiveIndicators: ["Feeding damage, frass, or insect presence"],
            negativeIndicators: ["Nutrient deficiency patterns without pest activity"],
            imageSources: [],
          },
          contextual: {
            growthStages: ["Early vegetative", "Reproductive"],
            weatherTriggers: ["Warm temperatures"],
            rotationRisk: ["Continuous host cropping"],
          },
        },
        decisionLogic: {
          scoutingThresholds: [{ condition: "Economic threshold exceeded", action: "Select appropriate control based on label" }],
          preventativeActions: ["Use resistant varieties", "Encourage beneficials"],
          curativeActions: [
            {
              type: "biological",
              constraints: { requiresRotation: false, regulatoryCheck: true, phiRelevant: false },
            },
            {
              type: "chemical",
              constraints: { requiresRotation: true, regulatoryCheck: true, phiRelevant: true },
            },
          ],
        },
        sources: [],
      },
    ];
  }

  if (domain === "nutrients") {
    return [
      {
        name: "General Nutrient Deficiency Diagnosis",
        scientificName: null,
        severityClasses: ["low", "medium", "high"],
        signals: {
          visual: {
            positiveIndicators: ["Interveinal chlorosis, stunting, marginal burn"],
            negativeIndicators: ["Lesions with sporulation or pest presence"],
            imageSources: [],
          },
          contextual: {
            growthStages: ["Vegetative", "Reproductive"],
            weatherTriggers: ["Excess rainfall", "Drought stress"],
            rotationRisk: ["Low organic matter soils"],
          },
        },
        decisionLogic: {
          scoutingThresholds: [{ condition: "Deficiency symptoms confirmed", action: "Verify with tissue/soil tests" }],
          preventativeActions: ["Balanced fertility program", "Soil testing"],
          curativeActions: [
            {
              type: "cultural",
              constraints: { requiresRotation: false, regulatoryCheck: false, phiRelevant: false },
            },
          ],
        },
        sources: [],
      },
    ];
  }

  if (domain === "growth-stages") {
    return [
      {
        name: "Growth Stage Identification",
        scientificName: null,
        severityClasses: ["low", "medium", "high"],
        signals: {
          visual: {
            positiveIndicators: ["Stage-specific leaf, node, or reproductive markers"],
            negativeIndicators: ["Non-uniform development due to stress"],
            imageSources: [],
          },
          contextual: {
            growthStages: ["All stages"],
            weatherTriggers: ["Accumulated heat units"],
            rotationRisk: ["N/A"],
          },
        },
        decisionLogic: {
          scoutingThresholds: [{ condition: "Stage confirmed", action: "Time scouting and management windows" }],
          preventativeActions: ["Use stage-based planning"],
          curativeActions: [
            {
              type: "cultural",
              constraints: { requiresRotation: false, regulatoryCheck: false, phiRelevant: false },
            },
          ],
        },
        sources: [],
      },
    ];
  }

  return [
    {
      name: "Integrated Crop Management",
      scientificName: null,
      severityClasses: ["low", "medium", "high"],
      signals: {
        visual: {
          positiveIndicators: ["Healthy stand and canopy"],
          negativeIndicators: ["Poor emergence or uneven canopy"],
          imageSources: [],
        },
        contextual: {
          growthStages: ["All stages"],
          weatherTriggers: ["Seasonal variability"],
          rotationRisk: ["Short rotations"],
        },
      },
      decisionLogic: {
        scoutingThresholds: [{ condition: "Risk factors present", action: "Adjust management practices" }],
        preventativeActions: ["Use IPM and crop rotation"],
        curativeActions: [
          {
            type: "cultural",
            constraints: { requiresRotation: false, regulatoryCheck: false, phiRelevant: false },
          },
        ],
      },
      sources: [],
    },
  ];
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&#038;/g, "&")
    .replace(/&quot;/g, '"');
}

function resolveUrl(baseUrl: string, maybeRelative: string): string | null {
  try {
    return new URL(maybeRelative, baseUrl).href;
  } catch {
    return null;
  }
}

async function canFetchBase(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(baseUrl, { method: "GET" }, 8000);
    return res.ok;
  } catch {
    return false;
  }
}

async function getSitemapsFromRobots(baseUrl: string): Promise<string[]> {
  const robotsUrl = new URL("/robots.txt", baseUrl).href;
  try {
    const res = await fetchWithTimeout(robotsUrl, { method: "GET" }, 8000);
    if (!res.ok) return [];
    const text = await res.text();
    return text
      .split(/\r?\n/)
      .filter((line) => line.toLowerCase().startsWith("sitemap:"))
      .map((line) => line.split(/\s+/).slice(1).join(" ").trim())
      .map((url) => decodeHtmlEntities(url))
      .map((url) => resolveUrl(baseUrl, url))
      .filter((url): url is string => Boolean(url));
  } catch (error) {
    console.warn(`⚠️  Failed to fetch robots.txt: ${robotsUrl} (${error})`);
    return [];
  }
}

function extractSitemapLocs(xml: string): string[] {
  const locs: string[] = [];
  const re = /<loc>([^<]+)<\/loc>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml))) {
    locs.push(match[1].trim());
  }
  return locs;
}

async function fetchSitemapUrls(sitemapUrl: string, baseUrl: string): Promise<string[]> {
  let res: Response;
  try {
    const resolved = resolveUrl(baseUrl, decodeHtmlEntities(sitemapUrl)) ?? sitemapUrl;
    if (!resolved) return [];
    res = await fetchWithTimeout(resolved, { method: "GET" }, 10000);
  } catch (error) {
    console.warn(`⚠️  Failed to fetch sitemap: ${sitemapUrl} (${error})`);
    return [];
  }
  if (!res.ok) return [];
  const contentType = res.headers.get("content-type") || "";
  const isGzip = resolvedEndsWith(res.url, ".gz") || contentType.includes("gzip");
  const xml = isGzip ? await readGzipText(res) : await res.text();

  if (xml.includes("<html") || xml.includes("<!DOCTYPE html")) {
    return extractLinksFromHtml(xml, baseUrl);
  }

  const locs = extractSitemapLocs(xml);
  if (xml.includes("<sitemapindex")) {
    const nested: string[] = [];
    for (const loc of locs) {
      const child = await fetchSitemapUrls(loc, baseUrl);
      nested.push(...child);
    }
    return nested;
  }

  return locs;
}

function filterUrls(urls: string[], baseUrl: string): string[] {
  const base = new URL(baseUrl);
  return urls.filter((url) => {
    try {
      const parsed = new URL(url);
      if (parsed.hostname !== base.hostname) return false;
      if (!/\.(html?|pdf)$/i.test(parsed.pathname) && !parsed.pathname.endsWith("/")) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  });
}

function extractLinksFromHtml(html: string, baseUrl: string): string[] {
  const links = new Set<string>();
  const re = /href\\s*=\\s*[\"']([^\"']+)[\"']/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const raw = decodeHtmlEntities(match[1]);
    if (raw.startsWith("mailto:") || raw.startsWith("javascript:")) continue;
    const resolved = resolveUrl(baseUrl, raw);
    if (resolved) links.add(resolved);
  }
  return Array.from(links);
}

async function fetchSeedLinks(seedUrl: string): Promise<string[]> {
  try {
    const res = await fetchWithTimeout(seedUrl, { method: "GET" }, 10000);
    if (!res.ok) return [];
    const contentType = res.headers.get("content-type") || "";
    const isXml = contentType.includes("xml") || seedUrl.endsWith(".xml") || seedUrl.endsWith(".gz");
    if (isXml) {
      const xml = seedUrl.endsWith(".gz") ? await readGzipText(res) : await res.text();
      const locs = extractSitemapLocs(xml);
      if (xml.includes("<sitemapindex")) {
        const nested: string[] = [];
        for (const loc of locs) {
          const child = await fetchSitemapUrls(loc, seedUrl);
          nested.push(...child);
        }
        return nested;
      }
      return locs;
    }
    const html = await res.text();
    return extractLinksFromHtml(html, seedUrl);
  } catch {
    return [];
  }
}

function resolvedEndsWith(url: string, suffix: string): boolean {
  try {
    return new URL(url).pathname.toLowerCase().endsWith(suffix);
  } catch {
    return url.toLowerCase().endsWith(suffix);
  }
}

async function readGzipText(res: Response): Promise<string> {
  const buffer = Buffer.from(await res.arrayBuffer());
  try {
    return gunzipSync(buffer).toString("utf-8");
  } catch {
    return buffer.toString("utf-8");
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

async function loadSeedPages(): Promise<SeedEntry[]> {
  try {
    const raw = await fs.readFile(SEED_CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.seeds)) {
      return parsed.seeds as SeedEntry[];
    }
  } catch {
    // ignore
  }
  return DEFAULT_SEED_PAGES;
}

async function harvestUrls(): Promise<Map<string, string[]>> {
  const pool = new Map<string, string[]>();
  const seedPages = await loadSeedPages();

  for (const seed of SOURCE_SEEDS) {
    const baseOk = await canFetchBase(seed.baseUrl);
    if (!baseOk) {
      console.warn(`⚠️  Skipping seed (base fetch failed): ${seed.baseUrl}`);
      continue;
    }

    const sitemaps = await getSitemapsFromRobots(seed.baseUrl);
    const fallback = [
      new URL("/sitemap.xml", seed.baseUrl).href,
      new URL("/sitemap_index.xml", seed.baseUrl).href,
      new URL("/sitemap-index.xml", seed.baseUrl).href,
    ];

    const sitemapList = Array.from(new Set([...sitemaps, ...fallback]));

    for (const sitemapUrl of sitemapList) {
      const urls = await fetchSitemapUrls(sitemapUrl, seed.baseUrl);
      if (!urls.length) continue;
      const filtered = filterUrls(urls, seed.baseUrl).filter((url) => {
        if (!seed.include) return true;
        return seed.include.some((re) => re.test(url));
      });
    for (const domain of seed.domains) {
      const key = `${seed.region}::${domain}`;
      const existing = pool.get(key) || [];
      pool.set(key, [...existing, ...filtered]);
    }
  }
  }

  for (const seed of seedPages) {
    const links = await fetchSeedLinks(seed.url);
    const filtered = links.filter((link) => {
      if (seed.include && seed.include.length > 0) {
        return seed.include.some((pattern) => link.includes(pattern));
      }
      return true;
    });
    for (const domain of seed.domains) {
      const key = `${seed.region}::${domain}`;
      const existing = pool.get(key) || [];
      pool.set(key, [...existing, seed.url, ...filtered]);
    }
  }

  // Deduplicate each pool
  for (const [key, list] of Array.from(pool.entries())) {
    pool.set(key, Array.from(new Set(list)));
  }

  return pool;
}

async function loadUrlPoolOverride(): Promise<Map<string, string[]> | null> {
  try {
    const raw = await fs.readFile(URL_POOL_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, string[]>;
    const pool = new Map<string, string[]>();
    for (const [key, list] of Object.entries(parsed)) {
      if (Array.isArray(list)) {
        pool.set(key, Array.from(new Set(list)));
      }
    }
    return pool.size > 0 ? pool : null;
  } catch {
    return null;
  }
}

async function validateUrls(
  urls: string[],
  targetCount: number,
  concurrency = DEFAULT_CONCURRENCY
): Promise<string[]> {
  const results: string[] = [];
  let index = 0;
  let stop = false;

  async function worker() {
    while (index < urls.length && !stop) {
      const current = urls[index++];
      const status = await validateUrl(current);
      if (status.reachable) {
        results.push(current);
        if (results.length >= targetCount) {
          stop = true;
        }
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  return results;
}

function buildJsonSpecs(): Array<{ region: RegionKey; domain: AgronomyDomain; cropGroup: string }> {
  const specs: Array<{ region: RegionKey; domain: AgronomyDomain; cropGroup: string }> = [];
  const regions = Object.keys(REGION_MAP) as RegionKey[];

  for (const region of regions) {
    const groups = REGION_GROUP_PAIRS[region];
    for (const domain of DOMAINS) {
      for (const group of groups) {
        specs.push({ region, domain, cropGroup: group });
      }
    }
  }

  return specs;
}

function shuffle<T>(arr: T[]): T[] {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

async function writeJsons(urlPools: Map<string, string[]>) {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const specs = buildJsonSpecs();
  const used = new Set<string>();
  const summary: Array<{ file: string; urls: number }> = [];
  const shortages: Array<{ file: string; urls: number }> = [];
  const maxCandidatesPerJson = options.maxCandidatesPerJson;
  const targetUrlsPerJson = options.targetUrlsPerJson;
  const maxTotalUrls = options.maxTotalUrls;
  const total = specs.length;
  const startedAt = Date.now();

  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i];
    const regionMeta = REGION_MAP[spec.region];
    const poolKey = `${spec.region}::${spec.domain}`;
    const label = `${spec.cropGroup}/${spec.region}/${spec.domain}`;
    const pool = urlPools.get(poolKey) || [];
    const globalPool = urlPools.get(`ALL::${spec.domain}`) || [];
    const remaining = Math.max(maxTotalUrls - used.size, 0);
    const targetForThisJson = Math.min(targetUrlsPerJson, remaining);

    console.log(`\n[${i + 1}/${total}] Building ${label}`);
    const candidates = shuffle(
      [...pool, ...globalPool].filter((url) => !used.has(url))
    ).slice(0, Math.min(maxCandidatesPerJson, remaining));

    console.log(`   Candidate URLs: ${candidates.length} (target ${targetForThisJson})`);
    const selected = options.skipValidation
      ? candidates.slice(0, targetForThisJson)
      : (await validateUrls(candidates, targetForThisJson, options.concurrency)).slice(
          0,
          targetForThisJson
        );
    selected.forEach((url) => used.add(url));
    console.log(`   ✅ Selected ${selected.length} URLs`);

    const problems = buildProblemTemplates(spec.domain);
    problems.forEach((problem) => {
      problem.sources = selected.map((url) => ({
        institution: new URL(url).hostname,
        publicationId: null,
        url,
        year: null,
        authority: "supporting" as const,
      }));
    });

    const file: AgronomyFile = {
      crop: CROP_GROUPS[spec.cropGroup][0],
      cropAliases: CROP_GROUPS[spec.cropGroup].slice(1),
      region: {
        macro: regionMeta.macro,
        states: regionMeta.states,
        provinces: regionMeta.provinces,
        regulatoryAuthority: regionMeta.authority,
      },
      domain: spec.domain,
      problems,
      lastValidated: new Date().toISOString().slice(0, 10),
    };

    const filename = `${spec.cropGroup}-${spec.region.replace(/\s+/g, "-").toLowerCase()}-${spec.domain}.json`;
    const filepath = path.join(OUTPUT_DIR, filename);
    await fs.writeFile(filepath, JSON.stringify(file, null, 2));
    summary.push({ file: filepath, urls: selected.length });
    if (selected.length < targetForThisJson) {
      shortages.push({ file: filepath, urls: selected.length });
    }
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    const percent = (((i + 1) / total) * 100).toFixed(1);
    console.log(`   💾 Wrote ${filepath}`);
    console.log(`   ⏱️  Progress ${percent}% | ${elapsed}s elapsed`);
  }

  await fs.writeFile(
    "ingestion/state/agronomy-json-summary.json",
    JSON.stringify(summary, null, 2)
  );
  await fs.writeFile(
    "ingestion/state/agronomy-json-shortages.json",
    JSON.stringify(shortages, null, 2)
  );
}

async function main() {
  options = parseOptions();
  console.log(
    `⚙️  Options: target=${options.targetUrlsPerJson} max-candidates=${options.maxCandidatesPerJson} max-total=${options.maxTotalUrls} skip-validation=${options.skipValidation}`
  );
  console.log("🔍 Harvesting sitemaps...");
  const override = await loadUrlPoolOverride();
  const pool = override || (await harvestUrls());
  if (override) {
    console.log(`✅ Loaded URL pool override from ${URL_POOL_PATH}`);
  }

  console.log("🧾 Writing JSON files (validation happens during assignment)...");
  await writeJsons(pool);

  console.log("✅ Done. Summary saved to ingestion/state/agronomy-json-summary.json");
  console.log("⚠️  Any shortages saved to ingestion/state/agronomy-json-shortages.json");
}

main().catch((error) => {
  console.error("❌ Failed to generate agronomy JSONs:", error);
  process.exit(1);
});
