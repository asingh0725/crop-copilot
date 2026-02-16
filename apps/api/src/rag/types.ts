export type SourceAuthorityType =
  | 'GOVERNMENT'
  | 'UNIVERSITY_EXTENSION'
  | 'RESEARCH_PAPER'
  | 'MANUFACTURER'
  | 'RETAILER'
  | 'OTHER';

export interface RetrievedCandidate {
  chunkId: string;
  content: string;
  similarity: number;
  sourceType: SourceAuthorityType;
  sourceTitle: string;
  metadata?: {
    crops?: string[];
    topics?: string[];
    region?: string;
    updatedAt?: string;
    position?: number;
    tags?: string[];
  };
}

export interface RankedCandidate extends RetrievedCandidate {
  rankScore: number;
  scoreBreakdown: {
    vector: number;
    keyword: number;
    authority: number;
    metadata: number;
  };
}
