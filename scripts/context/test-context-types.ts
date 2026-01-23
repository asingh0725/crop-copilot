import type { RetrievedChunk, AssembledContext } from '@/lib/retrieval/context-assembly'

// This script just verifies the types are exported correctly
// If it compiles without errors, types are working

const mockChunk: RetrievedChunk = {
  id: 'test-id',
  content: 'Test content',
  similarity: 0.85,
  source: {
    id: 'source-id',
    title: 'Test Source',
    sourceType: 'UNIVERSITY_EXTENSION',
    institution: 'Test University'
  }
}

const mockContext: AssembledContext = {
  chunks: [mockChunk],
  totalChunks: 1,
  totalTokens: 10,
  relevanceThreshold: 0.5
}

console.log('✅ TypeScript types are correctly exported and valid')
console.log('Mock chunk:', mockChunk.id)
console.log('Mock context:', mockContext.totalChunks, 'chunks')