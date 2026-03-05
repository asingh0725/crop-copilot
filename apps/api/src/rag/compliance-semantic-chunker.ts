import { chunkTextSemantically } from './semantic-chunker-v2';

export interface ComplianceChunkCandidate {
  content: string;
  section: string;
  position: number;
  tags: string[];
}

function detectTags(text: string): string[] {
  const normalized = text.toLowerCase();
  const tags = new Set<string>();

  if (/\brei\b|re-entry interval|restricted entry/i.test(normalized)) {
    tags.add('rei');
  }
  if (/\bphi\b|pre-harvest interval|pre harvest/i.test(normalized)) {
    tags.add('phi');
  }
  if (/max(imum)?[^\n]{0,30}(rate|dose)|seasonal maximum/i.test(normalized)) {
    tags.add('dose_limit');
  }
  if (/crop stage|growth stage|before bloom|after emergence/i.test(normalized)) {
    tags.add('crop_stage');
  }
  if (/state|jurisdiction|county|federal|label/i.test(normalized)) {
    tags.add('jurisdiction');
  }
  if (/except|unless|do not apply|prohibited|restricted/i.test(normalized)) {
    tags.add('restriction');
  }

  if (tags.size === 0) {
    tags.add('general');
  }

  return Array.from(tags);
}

export function chunkComplianceText(
  section: string,
  text: string,
  startPosition = 0
): ComplianceChunkCandidate[] {
  const semanticChunks = chunkTextSemantically(section, text);

  return semanticChunks.map((chunk, index) => ({
    content: chunk.content,
    section,
    position: startPosition + index,
    tags: detectTags(chunk.content),
  }));
}
