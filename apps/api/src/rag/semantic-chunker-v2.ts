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

function splitParagraphByMaxTokens(paragraph: string, maxTokens: number): string[] {
  if (estimateTokens(paragraph) <= maxTokens) {
    return [paragraph];
  }

  const sentences = paragraph
    .match(/[^.!?]+[.!?]?/g)
    ?.map((sentence) => sentence.trim())
    .filter(Boolean) ?? [paragraph];
  const segments: string[] = [];
  let current = '';

  const flushCurrent = () => {
    if (current.trim().length > 0) {
      segments.push(current.trim());
      current = '';
    }
  };

  for (const sentence of sentences) {
    if (estimateTokens(sentence) > maxTokens) {
      flushCurrent();
      const words = sentence.split(/\s+/).filter(Boolean);
      let wordChunk: string[] = [];

      for (const word of words) {
        const nextWordChunk = [...wordChunk, word].join(' ');
        if (estimateTokens(nextWordChunk) > maxTokens && wordChunk.length > 0) {
          segments.push(wordChunk.join(' '));
          wordChunk = [word];
        } else {
          wordChunk.push(word);
        }
      }

      if (wordChunk.length > 0) {
        segments.push(wordChunk.join(' '));
      }
      continue;
    }

    const candidate = current ? `${current} ${sentence}` : sentence;
    if (estimateTokens(candidate) > maxTokens && current) {
      flushCurrent();
      current = sentence;
    } else {
      current = candidate;
    }
  }

  flushCurrent();
  return segments.length > 0 ? segments : [paragraph];
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

  const sectionPrefix = `${section}\n\n`;
  let current = sectionPrefix;
  let currentTokens = estimateTokens(current);
  const sectionTokens = currentTokens;
  const maxParagraphTokens = Math.max(1, config.maxTokens - sectionTokens);

  for (const paragraph of paragraphs) {
    const paragraphSegments = splitParagraphByMaxTokens(paragraph, maxParagraphTokens);

    for (const segment of paragraphSegments) {
      const paragraphTokens = estimateTokens(segment);
      if (
        currentTokens + paragraphTokens > config.maxTokens &&
        currentTokens > sectionTokens
      ) {
        chunks.push({
          section,
          content: current.trim(),
          tokenCount: estimateTokens(current),
        });

        const overlap = extractOverlapText(current, config.overlapTokens);
        current = overlap
          ? `${sectionPrefix}${overlap}\n\n${segment}`
          : `${sectionPrefix}${segment}`;
        currentTokens = estimateTokens(current);
        continue;
      }

      if (currentTokens + paragraphTokens > config.maxTokens) {
        chunks.push({
          section,
          content: current.trim(),
          tokenCount: estimateTokens(current),
        });
        current = `${sectionPrefix}${segment}`;
        currentTokens = estimateTokens(current);
        continue;
      }

      current += `${current.endsWith('\n\n') ? '' : '\n\n'}${segment}`;
      currentTokens = estimateTokens(current);
    }
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
