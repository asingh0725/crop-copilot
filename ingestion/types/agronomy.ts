export type RegulatoryAuthority = "EPA" | "PMRA" | "EPA+PMRA";

export type AgronomyDomain =
  | "disease"
  | "pest"
  | "nutrients"
  | "growth-stages"
  | "management";

export interface AgronomyRegion {
  macro: string;
  states: string[];
  provinces: string[];
  regulatoryAuthority: RegulatoryAuthority[];
}

export interface AgronomySource {
  institution: string;
  publicationId: string | null;
  url: string;
  year: number | null;
  authority: "primary" | "supporting";
}

export interface AgronomyProblem {
  name: string;
  scientificName: string | null;
  severityClasses: string[];
  signals: {
    visual: {
      positiveIndicators: string[];
      negativeIndicators: string[];
      imageSources: Array<{
        url: string;
        source: string;
        confidence: "high" | "medium";
      }>;
    };
    contextual: {
      growthStages: string[];
      weatherTriggers: string[];
      rotationRisk: string[];
    };
  };
  decisionLogic: {
    scoutingThresholds: Array<{ condition: string; action: string }>;
    preventativeActions: string[];
    curativeActions: Array<{
      type: "chemical" | "biological" | "cultural";
      constraints: {
        requiresRotation: boolean;
        regulatoryCheck: boolean;
        phiRelevant: boolean;
      };
    }>;
  };
  sources: AgronomySource[];
}

export interface AgronomyFile {
  crop: string;
  region: AgronomyRegion;
  domain: AgronomyDomain;
  problems: AgronomyProblem[];
  cropAliases: string[];
  lastValidated: string;
}

export type AgronomyChunkType = "visual" | "threshold" | "table" | "narrative";
