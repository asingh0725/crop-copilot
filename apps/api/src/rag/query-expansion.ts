const STOPWORDS = new Set([
  'the',
  'and',
  'with',
  'from',
  'this',
  'that',
  'have',
  'has',
  'was',
  'were',
  'soil',
  'crop',
  'field',
]);

const TERM_EXPANSIONS: Record<string, string[]> = {
  blight: ['fungal disease', 'leaf lesions'],
  chlorosis: ['yellowing leaves', 'nutrient deficiency'],
  mildew: ['fungal disease', 'humidity management'],
  wilt: ['water stress', 'vascular disease'],
  aphid: ['insect pest', 'sap-sucking insects'],
  nitrogen: ['n deficiency', 'leaf yellowing'],
  potassium: ['k deficiency', 'marginal scorch'],
};

export interface QueryExpansionInput {
  query: string;
  crop?: string;
  region?: string;
  growthStage?: string;
}

export interface QueryExpansionResult {
  expandedQuery: string;
  terms: string[];
}

export function expandRetrievalQuery(input: QueryExpansionInput): QueryExpansionResult {
  const rawTokens = input.query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));

  const terms = new Set(rawTokens);

  for (const token of rawTokens) {
    const expansions = TERM_EXPANSIONS[token];
    if (expansions) {
      for (const item of expansions) {
        terms.add(item);
      }
    }
  }

  if (input.crop) {
    terms.add(input.crop.toLowerCase());
  }

  if (input.region) {
    terms.add(input.region.toLowerCase());
  }

  if (input.growthStage) {
    terms.add(input.growthStage.toLowerCase());
  }

  const orderedTerms = Array.from(terms);
  return {
    expandedQuery: orderedTerms.join(' '),
    terms: orderedTerms,
  };
}
