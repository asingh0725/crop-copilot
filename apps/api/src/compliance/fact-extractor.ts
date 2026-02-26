export interface ComplianceFactCandidate {
  factType: string;
  factKey: string;
  factValue: string;
  confidence: number;
  metadata: Record<string, unknown>;
}

function captureAll(regex: RegExp, text: string): string[] {
  const matches: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const value = match[1]?.trim();
    if (value) {
      matches.push(value);
    }
  }

  return matches;
}

export function extractComplianceFacts(text: string): ComplianceFactCandidate[] {
  const facts: ComplianceFactCandidate[] = [];

  const reiMatches = captureAll(/(?:\brei\b|re-?entry interval)\D{0,20}(\d{1,3}\s*(?:hours?|days?))/gi, text);
  for (const value of reiMatches) {
    facts.push({
      factType: 'timing',
      factKey: 'rei',
      factValue: value,
      confidence: 0.92,
      metadata: { extractor: 'regex', pattern: 'rei' },
    });
  }

  const phiMatches = captureAll(/(?:\bphi\b|pre-?harvest interval)\D{0,20}(\d{1,3}\s*(?:hours?|days?))/gi, text);
  for (const value of phiMatches) {
    facts.push({
      factType: 'timing',
      factKey: 'phi',
      factValue: value,
      confidence: 0.9,
      metadata: { extractor: 'regex', pattern: 'phi' },
    });
  }

  const doseMatches = captureAll(/(?:max(?:imum)?\s+(?:single\s+)?(?:rate|dose)|seasonal\s+maximum)\D{0,40}(\d+(?:\.\d+)?\s*(?:oz|lb|pt|qt|gal)\/?(?:acre|ac)?)/gi, text);
  for (const value of doseMatches) {
    facts.push({
      factType: 'dose_limit',
      factKey: 'max_rate',
      factValue: value,
      confidence: 0.86,
      metadata: { extractor: 'regex', pattern: 'dose_limit' },
    });
  }

  const restrictedUseMatches = captureAll(/(do not apply[^.]{0,160}\.)/gi, text);
  for (const value of restrictedUseMatches.slice(0, 5)) {
    facts.push({
      factType: 'restriction',
      factKey: 'prohibited_clause',
      factValue: value,
      confidence: 0.8,
      metadata: { extractor: 'regex', pattern: 'restriction_clause' },
    });
  }

  return facts;
}
