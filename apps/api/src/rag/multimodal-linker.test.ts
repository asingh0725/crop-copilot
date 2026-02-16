import test from 'node:test';
import assert from 'node:assert/strict';
import { linkImageCandidatesToText } from './multimodal-linker';

test('linkImageCandidatesToText links images to best matching text chunk', () => {
  const links = linkImageCandidatesToText(
    [
      {
        imageId: 'img-1',
        caption: 'Tomato leaf lesions',
        tags: ['tomato', 'lesion', 'blight'],
        position: 2,
      },
    ],
    [
      {
        chunkId: 'chunk-a',
        content: 'General nutrient content',
        similarity: 0.5,
        sourceType: 'OTHER',
        sourceTitle: 'General',
        metadata: { tags: ['nitrogen'], position: 20 },
      },
      {
        chunkId: 'chunk-b',
        content: 'Tomato blight lesions and fungicide windows',
        similarity: 0.8,
        sourceType: 'UNIVERSITY_EXTENSION',
        sourceTitle: 'UC Extension',
        metadata: { tags: ['tomato', 'blight', 'lesion'], position: 3 },
      },
    ]
  );

  assert.equal(links[0].linkedChunkId, 'chunk-b');
  assert.ok(links[0].score > 0.5);
});

test('linkImageCandidatesToText returns null link when no tag overlap exists', () => {
  const links = linkImageCandidatesToText(
    [
      {
        imageId: 'img-2',
        caption: 'Leaf edge curling',
        tags: ['leaf', 'curling'],
      },
    ],
    [
      {
        chunkId: 'chunk-z',
        content: 'Nutrient and irrigation scheduling',
        similarity: 0.6,
        sourceType: 'OTHER',
        sourceTitle: 'General',
        metadata: { tags: ['nitrogen', 'water'] },
      },
    ]
  );

  assert.equal(links[0].linkedChunkId, null);
  assert.equal(links[0].score, 0);
});
