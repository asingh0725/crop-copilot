import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalizeDiscoveryUrl,
  extractDiscoveryUrlsFromGeminiCandidate,
} from './discovery-url-utils';

test('canonicalizeDiscoveryUrl unwraps Google redirect URLs', () => {
  const raw =
    'https://www.google.com/url?sa=t&url=https%3A%2F%2Fwww.epa.gov%2Fpesticide-registration&utm_source=foo';
  const canonical = canonicalizeDiscoveryUrl(raw);
  assert.equal(canonical, 'https://www.epa.gov/pesticide-registration');
});

test('canonicalizeDiscoveryUrl rejects transient grounding redirect hosts', () => {
  const raw =
    'https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQFooBarBaz';
  const canonical = canonicalizeDiscoveryUrl(raw);
  assert.equal(canonical, null);
});

test('canonicalizeDiscoveryUrl unwraps perfdrive validator redirects', () => {
  const raw =
    'http://validate.perfdrive.com/d5bd5333eafe8b0ccd6023ba818d1aa6?ssc=https%3A%2F%2Fmn.gov%2Flih%2Fall%2Flicenses%2Fpesticide-registration&ssp=12345';
  const canonical = canonicalizeDiscoveryUrl(raw);
  assert.equal(canonical, 'https://mn.gov/lih/all/licenses/pesticide-registration');
});

test('canonicalizeDiscoveryUrl rejects unresolved perfdrive validator URLs', () => {
  const raw = 'http://validate.perfdrive.com/d5bd5333eafe8b0ccd6023ba818d1aa6';
  const canonical = canonicalizeDiscoveryUrl(raw);
  assert.equal(canonical, null);
});

test('canonicalizeDiscoveryUrl rejects in.gov search results pages', () => {
  const raw = 'https://www.in.gov/core/results?q=pesticide%20license';
  const canonical = canonicalizeDiscoveryUrl(raw);
  assert.equal(canonical, null);
});

test('extractDiscoveryUrlsFromGeminiCandidate reads JSON in fenced response text', () => {
  const candidate = {
    content: {
      parts: [
        {
          text: '```json\n[{"url":"https://crops.extension.iastate.edu/corn","title":"Corn","sourceType":"UNIVERSITY_EXTENSION"}]\n```',
        },
      ],
    },
  };

  const parsed = extractDiscoveryUrlsFromGeminiCandidate(candidate, 8);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.url, 'https://crops.extension.iastate.edu/corn');
  assert.equal(parsed[0]?.title, 'Corn');
  assert.equal(parsed[0]?.sourceTypeHint, 'UNIVERSITY_EXTENSION');
});

test('extractDiscoveryUrlsFromGeminiCandidate falls back to grounding chunks', () => {
  const candidate = {
    groundingMetadata: {
      groundingChunks: [
        {
          web: {
            uri: 'https://www.epa.gov/pesticides',
            title: 'EPA pesticides',
          },
        },
      ],
    },
  };

  const parsed = extractDiscoveryUrlsFromGeminiCandidate(candidate, 8);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.url, 'https://www.epa.gov/pesticides');
  assert.equal(parsed[0]?.title, 'EPA pesticides');
});
