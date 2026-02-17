import test from 'node:test';
import assert from 'node:assert/strict';
import { chunkTextSemantically } from './semantic-chunker-v2';

const longParagraph =
  'Tomato late blight develops rapidly under cool wet weather conditions. '.repeat(80);

test('chunkTextSemantically creates multiple bounded chunks for long content', () => {
  const chunks = chunkTextSemantically('Disease Management', `${longParagraph}\n\n${longParagraph}`);

  assert.ok(chunks.length >= 2);
  for (const chunk of chunks) {
    assert.ok(chunk.tokenCount > 0);
    assert.ok(chunk.content.includes('Disease Management'));
  }
});

test('chunkTextSemantically splits oversized single paragraph to respect maxTokens', () => {
  const chunks = chunkTextSemantically('Disease Management', longParagraph, {
    minTokens: 180,
    maxTokens: 120,
    overlapTokens: 20,
  });

  assert.ok(chunks.length > 1);
  for (const chunk of chunks) {
    assert.ok(chunk.tokenCount <= 130);
  }
});
