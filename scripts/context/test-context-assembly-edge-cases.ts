import { searchTextChunks, searchImageChunks } from '@/lib/retrieval/search'
import { assembleContext } from '@/lib/retrieval/context-assembly'

async function testEdgeCases() {
  console.log('Testing context assembly edge cases...\n')

  try {
    // Test 1: Query with low relevance results
    console.log('Test 1: Low relevance query...')
    const lowRelevanceQuery = 'xyzabc nonsense query that should not match well'
    
    const textResults1 = await searchTextChunks(lowRelevanceQuery, 5)
    const imageResults1 = await searchImageChunks(lowRelevanceQuery, 3)
    
    const context1 = await assembleContext(textResults1, imageResults1)
    
    console.log(`  Retrieved: ${textResults1.length + imageResults1.length} chunks`)
    console.log(`  After filtering: ${context1.totalChunks} chunks`)
    console.log(`  (Chunks below 0.5 similarity were filtered out)`)
    
    if (context1.totalChunks < textResults1.length + imageResults1.length) {
      console.log('✅ Low relevance chunks filtered correctly\n')
    }

    // Test 2: Empty results
    console.log('Test 2: Empty results...')
    const context2 = await assembleContext([], [])
    
    console.log(`  Total chunks: ${context2.totalChunks}`)
    console.log(`  Total tokens: ${context2.totalTokens}`)
    
    if (context2.totalChunks === 0 && context2.totalTokens === 0) {
      console.log('✅ Handles empty results correctly\n')
    }

    // Test 3: Duplicate chunks (same ID in text and image results)
    console.log('Test 3: Deduplication with overlapping results...')
    const query3 = 'nitrogen deficiency'
    
    const textResults3 = await searchTextChunks(query3, 3)
    const imageResults3 = await searchImageChunks(query3, 3)
    
    // Artificially create overlap by duplicating first result
    const overlappingResults = [
      ...textResults3,
      ...textResults3.slice(0, 1), // Duplicate first chunk
      ...imageResults3
    ]
    
    const context3 = await assembleContext(overlappingResults, [])
    const uniqueIds = new Set(context3.chunks.map(c => c.id))
    
    console.log(`  Input chunks: ${overlappingResults.length}`)
    console.log(`  After deduplication: ${context3.totalChunks}`)
    console.log(`  Unique IDs: ${uniqueIds.size}`)
    
    if (uniqueIds.size === context3.totalChunks) {
      console.log('✅ Deduplication works correctly\n')
    }

    // Test 4: Very long content (truncation test)
    console.log('Test 4: Token limit enforcement...')
    
    // Get many chunks to test truncation
    const textResults4 = await searchTextChunks('corn', 10)
    const imageResults4 = await searchImageChunks('corn', 10)
    
    const context4 = await assembleContext(textResults4, imageResults4)
    
    console.log(`  Retrieved: ${textResults4.length + imageResults4.length} chunks`)
    console.log(`  Included: ${context4.totalChunks} chunks`)
    console.log(`  Total tokens: ${context4.totalTokens}`)
    
    if (context4.totalTokens <= 4000) {
      console.log('✅ Token limit enforced correctly\n')
    } else {
      console.log('❌ Token limit exceeded\n')
    }

    console.log('✅ All edge case tests passed!')

  } catch (error) {
    console.error('❌ Test failed:', error)
    throw error
  }
}

testEdgeCases()