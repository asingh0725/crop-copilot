export interface SemanticChunk {
  section: string;
  content: string;
  tokenCount: number;
}

export interface SemanticChunkingOptions {
  minTokens?: number;
  maxTokens?: number;
  overlapTokens?: number;
}

const DEFAULT_OPTIONS: Required<SemanticChunkingOptions> = {
  minTokens: 180,
  maxTokens: 520,
  overlapTokens: 60,
};

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function extractOverlapText(content: string, overlapTokens: number): string {
  const sentences = content.match(/[^.!?]+[.!?]?/g) ?? [content];
  let overlap = '';
  let running = 0;

  for (let i = sentences.length - 1; i >= 0; i -= 1) {
    const sentence = sentences[i].trim();
    const sentenceTokens = estimateTokens(sentence);
    if (!sentence) {
      continue;
    }

    if (running + sentenceTokens > overlapTokens) {
      break;
    }

    overlap = overlap ? `${sentence} ${overlap}` : sentence;
    running += sentenceTokens;
  }

  return overlap;
}

export function chunkTextSemantically(
  section: string,
  text: string,
  options: SemanticChunkingOptions = {}
): SemanticChunk[] {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const paragraphs = text
    .split(/\n\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const chunks: SemanticChunk[] = [];

  let current = `${section}\n\n`;
  let currentTokens = estimateTokens(current);

  for (const paragraph of paragraphs) {
    const paragraphTokens = estimateTokens(paragraph);

    if (currentTokens + paragraphTokens > config.maxTokens && currentTokens >= config.minTokens) {
      chunks.push({
        section,
        content: current.trim(),
        tokenCount: estimateTokens(current),
      });

      const overlap = extractOverlapText(current, config.overlapTokens);
      current = overlap ? `${section}\n\n${overlap}\n\n${paragraph}` : `${section}\n\n${paragraph}`;
      currentTokens = estimateTokens(current);
      continue;
    }

    current += `${current.endsWith('\n\n') ? '' : '\n\n'}${paragraph}`;
    currentTokens = estimateTokens(current);
  }

  if (current.trim().length > 0) {
    chunks.push({
      section,
      content: current.trim(),
      tokenCount: estimateTokens(current),
    });
  }

  return chunks;
}
