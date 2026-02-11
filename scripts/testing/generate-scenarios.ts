import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { TestScenario } from "./types";

const COVERAGE_PLAN: Array<{
  category: TestScenario["category"];
  count: number;
  templates: Omit<TestScenario, "id">[];
}> = [
  {
    category: "nitrogen_deficiency",
    count: 12,
    templates: [
      {
        category: "nitrogen_deficiency",
        crop: "corn",
        region: "Midwest",
        growthStage: "V4-V6",
        symptoms:
          "yellowing lower leaves and pale canopy under warm wet conditions",
        expectedDiagnosis: "Nitrogen deficiency",
        expectedConditionType: "deficiency",
        mustInclude: [
          "soil or tissue test",
          "split nitrogen application",
          "growth-stage timing",
        ],
        shouldAvoid: ["single high-rate burn risk advice"],
      },
      {
        category: "nitrogen_deficiency",
        crop: "soybean",
        region: "South",
        growthStage: "V3-V5",
        symptoms:
          "general chlorosis and reduced nodulation after saturated soils",
        expectedDiagnosis: "Nitrogen deficiency linked to nodulation stress",
        expectedConditionType: "deficiency",
        mustInclude: [
          "root/nodule check",
          "inoculant strategy",
          "rate guardrails",
        ],
        shouldAvoid: ["overstating yield recovery certainty"],
      },
      {
        category: "nitrogen_deficiency",
        crop: "wheat",
        region: "West",
        growthStage: "tillering",
        symptoms:
          "pale older foliage and thin stand in low organic matter field",
        expectedDiagnosis: "Nitrogen deficiency",
        expectedConditionType: "deficiency",
        mustInclude: [
          "topdress window",
          "rainfall incorporation note",
          "safety to avoid lodging",
        ],
        shouldAvoid: ["late-season high N that increases lodging risk"],
      },
    ],
  },
  {
    category: "phosphorus_deficiency",
    count: 8,
    templates: [
      {
        category: "phosphorus_deficiency",
        crop: "corn",
        region: "Midwest",
        growthStage: "seedling",
        symptoms: "purpling leaves and slow early growth in cool wet soil",
        expectedDiagnosis: "Phosphorus deficiency",
        expectedConditionType: "deficiency",
        mustInclude: [
          "soil temperature context",
          "banded phosphorus recommendation",
          "starter timing",
        ],
        shouldAvoid: [
          "claiming fungal disease as primary cause without evidence",
        ],
      },
      {
        category: "phosphorus_deficiency",
        crop: "soybean",
        region: "Southeast",
        growthStage: "early vegetative",
        symptoms: "stunted plants with dark green leaves on acidic sandy soil",
        expectedDiagnosis: "Phosphorus deficiency with pH limitation",
        expectedConditionType: "deficiency",
        mustInclude: [
          "pH correction",
          "soil test recommendation",
          "placement strategy",
        ],
        shouldAvoid: ["blanket high-rate phosphorus without test"],
      },
    ],
  },
  {
    category: "potassium_deficiency",
    count: 8,
    templates: [
      {
        category: "potassium_deficiency",
        crop: "cotton",
        region: "Southeast",
        growthStage: "flowering",
        symptoms: "leaf edge scorching and poor boll retention",
        expectedDiagnosis: "Potassium deficiency",
        expectedConditionType: "deficiency",
        mustInclude: [
          "split K application",
          "petiole/tissue test",
          "water management tie-in",
        ],
        shouldAvoid: ["single large potassium chloride burst in drought"],
      },
      {
        category: "potassium_deficiency",
        crop: "soybean",
        region: "Midwest",
        growthStage: "R3-R5",
        symptoms: "marginal chlorosis progressing to necrosis in upper canopy",
        expectedDiagnosis: "Potassium deficiency",
        expectedConditionType: "deficiency",
        mustInclude: [
          "rate by test level",
          "timing guardrails",
          "source citation",
        ],
        shouldAvoid: ["ignoring Mg antagonism risk"],
      },
    ],
  },
  {
    category: "micronutrient_deficiency",
    count: 12,
    templates: [
      {
        category: "micronutrient_deficiency",
        crop: "corn",
        region: "Midwest",
        growthStage: "V5",
        symptoms:
          "striped interveinal chlorosis on younger leaves in high pH soil",
        expectedDiagnosis: "Zinc deficiency",
        expectedConditionType: "deficiency",
        mustInclude: [
          "tissue test confirmation",
          "foliar vs soil zinc choice",
          "pH context",
        ],
        shouldAvoid: ["misdiagnosing as nitrogen deficiency"],
      },
      {
        category: "micronutrient_deficiency",
        crop: "soybean",
        region: "Midwest",
        growthStage: "V3",
        symptoms: "interveinal chlorosis with green veins on young leaves",
        expectedDiagnosis: "Iron chlorosis",
        expectedConditionType: "deficiency",
        mustInclude: ["variety tolerance", "chelate guidance", "drainage note"],
        shouldAvoid: ["high confidence without differential"],
      },
    ],
  },
  {
    category: "fungal_disease",
    count: 15,
    templates: [
      {
        category: "fungal_disease",
        crop: "corn",
        region: "Midwest",
        growthStage: "late vegetative",
        symptoms: "rectangular gray lesions confined by veins, humid canopy",
        expectedDiagnosis: "Gray leaf spot",
        expectedConditionType: "disease",
        mustInclude: [
          "differential diagnosis",
          "fungicide timing",
          "resistance management",
        ],
        shouldAvoid: ["single chemistry overreliance"],
      },
      {
        category: "fungal_disease",
        crop: "wheat",
        region: "Midwest",
        growthStage: "heading",
        symptoms:
          "bleached spikelets and pink-orange fungal growth after rains",
        expectedDiagnosis: "Fusarium head blight",
        expectedConditionType: "disease",
        mustInclude: [
          "DON risk mention",
          "application timing at flowering",
          "harvest segregation note",
        ],
        shouldAvoid: ["late curative claim with high confidence"],
      },
      {
        category: "fungal_disease",
        crop: "soybean",
        region: "Midwest",
        growthStage: "R1-R3",
        symptoms: "white cottony growth and stem lesions in dense canopy",
        expectedDiagnosis: "White mold",
        expectedConditionType: "disease",
        mustInclude: [
          "canopy risk factors",
          "timing-sensitive control",
          "future prevention",
        ],
        shouldAvoid: ["ignoring humidity risk context"],
      },
    ],
  },
  {
    category: "bacterial_or_viral",
    count: 8,
    templates: [
      {
        category: "bacterial_or_viral",
        crop: "tomato",
        region: "Southeast",
        growthStage: "fruiting",
        symptoms: "bronzing, stunting, ring spots on fruit and leaves",
        expectedDiagnosis: "Tomato spotted wilt virus",
        expectedConditionType: "disease",
        mustInclude: [
          "vector management",
          "rogueing infected plants",
          "uncertainty communication",
        ],
        shouldAvoid: ["fungicide as cure for viral disease"],
      },
      {
        category: "bacterial_or_viral",
        crop: "soybean",
        region: "Midwest",
        growthStage: "vegetative",
        symptoms: "angular water-soaked lesions with yellow halos after storms",
        expectedDiagnosis: "Bacterial blight",
        expectedConditionType: "disease",
        mustInclude: [
          "weather-driven spread context",
          "rotation/residue strategy",
          "diagnostic confirmation",
        ],
        shouldAvoid: ["unnecessary antibiotic recommendations"],
      },
    ],
  },
  {
    category: "insect_pressure",
    count: 12,
    templates: [
      {
        category: "insect_pressure",
        crop: "corn",
        region: "South",
        growthStage: "whorl",
        symptoms: "ragged leaves and frass in whorl with active larvae",
        expectedDiagnosis: "Fall armyworm infestation",
        expectedConditionType: "pest",
        mustInclude: [
          "scouting thresholds",
          "mode-of-action rotation",
          "timing urgency",
        ],
        shouldAvoid: ["spray recommendation without threshold"],
      },
      {
        category: "insect_pressure",
        crop: "soybean",
        region: "Midwest",
        growthStage: "R1-R3",
        symptoms: "leaf feeding and clustered metallic beetles on canopy",
        expectedDiagnosis: "Japanese beetle pressure",
        expectedConditionType: "pest",
        mustInclude: [
          "defoliation threshold",
          "pollinator-safe timing",
          "beneficial insects note",
        ],
        shouldAvoid: ["automatic rescue spray"],
      },
    ],
  },
  {
    category: "abiotic_stress",
    count: 10,
    templates: [
      {
        category: "abiotic_stress",
        crop: "corn",
        region: "Midwest",
        growthStage: "tasseling",
        symptoms:
          "leaf rolling by midday and poor silk emergence during heat wave",
        expectedDiagnosis: "Drought and heat stress",
        expectedConditionType: "environmental",
        mustInclude: [
          "irrigation prioritization",
          "stress mitigation timing",
          "realistic yield expectations",
        ],
        shouldAvoid: ["claiming full recovery certainty"],
      },
      {
        category: "abiotic_stress",
        crop: "soybean",
        region: "Midwest",
        growthStage: "V2",
        symptoms: "blackened cotyledons and stem cracking after late frost",
        expectedDiagnosis: "Cold injury",
        expectedConditionType: "environmental",
        mustInclude: [
          "stand assessment",
          "replant decision framework",
          "wait-and-reassess guidance",
        ],
        shouldAvoid: ["immediate blanket replant instruction"],
      },
    ],
  },
  {
    category: "edge_case",
    count: 15,
    templates: [
      {
        category: "edge_case",
        crop: "corn",
        region: "Midwest",
        growthStage: "V8",
        symptoms:
          "interveinal chlorosis with scattered lesioning after herbicide pass and storms",
        expectedDiagnosis:
          "Mixed stress: possible nutrient + disease + herbicide interaction",
        expectedConditionType: "unknown",
        mustInclude: [
          "clear uncertainty",
          "prioritized diagnostics",
          "safe immediate actions",
        ],
        shouldAvoid: ["single-cause certainty"],
      },
      {
        category: "edge_case",
        crop: "cucurbits",
        region: "Southeast",
        growthStage: "flowering",
        symptoms:
          "wilting at midday recovering at night with patchy distribution",
        expectedDiagnosis:
          "Potential vascular disease or root stress; needs confirmation",
        expectedConditionType: "unknown",
        mustInclude: [
          "diagnostic sampling steps",
          "irrigation and root-zone checks",
          "containment precautions",
        ],
        shouldAvoid: ["high-confidence diagnosis without test"],
      },
    ],
  },
];

function buildScenario(
  index: number,
  template: Omit<TestScenario, "id">
): TestScenario {
  return {
    id: `scenario_${String(index + 1).padStart(3, "0")}`,
    ...template,
  };
}

export function generateScenarios(): TestScenario[] {
  const scenarios: TestScenario[] = [];

  for (const plan of COVERAGE_PLAN) {
    for (let i = 0; i < plan.count; i += 1) {
      const template = plan.templates[i % plan.templates.length];
      scenarios.push(buildScenario(scenarios.length, template));
    }
  }

  return scenarios;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const outputPath = resolve(process.cwd(), "data/testing/scenarios-100.json");
  const scenarios = generateScenarios();
  writeFileSync(outputPath, `${JSON.stringify(scenarios, null, 2)}\n`, "utf-8");
  console.log(`Generated ${scenarios.length} scenarios at ${outputPath}`);
}
