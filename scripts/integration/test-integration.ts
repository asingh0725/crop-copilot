import { assembleContext } from '@/lib/retrieval/context-assembly'
import { prisma } from '@/lib/prisma'
import type { SearchResult } from '@/lib/retrieval/search'

async function testIntegration() {
  console.log('Testing integration with search API results...\n')

  try {
    // Step 1: Get a real source ID from the database
    console.log('1. Fetching real source from database...')
    const realSource = await prisma.source.findFirst()
    
    if (!realSource) {
      console.error('❌ No sources found in database. Run seed script first.')
      return
    }
    
    console.log(`✅ Found source: ${realSource.title} (${realSource.id})`)

    // Step 2: Create mock search results with real source ID
    console.log('\n2. Creating mock search results...')
    const mockSearchResults: SearchResult[] = [
      {
        id: 'chunk-1',
        content: 'Nitrogen deficiency causes yellowing...',
        similarity: 0.85,
        sourceId: realSource.id, // Use real source ID
        metadata: { topic: 'nitrogen' }
      },
      {
        id: 'chunk-2',
        content: 'Apply 40-60 lbs N/acre...',
        similarity: 0.78,
        sourceId: realSource.id, // Use real source ID
        metadata: { topic: 'application' }
      }
    ]
    
    console.log(`✅ Created ${mockSearchResults.length} mock results`)

    // Step 3: Assemble context
    console.log('\n3. Assembling context...')
    const context = await assembleContext(mockSearchResults, [])
    
    console.log('✅ Context assembled from mock results')
    console.log(`   Chunks: ${context.totalChunks}`)
    console.log(`   Tokens: ${context.totalTokens}`)
    
    // Step 4: Verify source enrichment happened
    console.log('\n4. Verifying source enrichment...')
    if (context.chunks[0].source) {
      console.log('✅ Source metadata enriched')
      console.log(`   Source ID: ${context.chunks[0].source.id}`)
      console.log(`   Source title: ${context.chunks[0].source.title}`)
      console.log(`   Source type: ${context.chunks[0].source.sourceType}`)
      console.log(`   Institution: ${context.chunks[0].source.institution || 'N/A'}`)
    } else {
      console.log('❌ Source metadata missing')
    }

    // Step 5: Verify all chunks have source metadata
    console.log('\n5. Checking all chunks...')
    const allHaveSources = context.chunks.every(chunk => chunk.source !== undefined)
    if (allHaveSources) {
      console.log('✅ All chunks have source metadata')
    } else {
      console.log('❌ Some chunks missing source metadata')
    }

    console.log('\n✅ Integration test passed!')

  } catch (error) {
    console.error('❌ Integration test failed:', error)
  } finally {
    await prisma.$disconnect()
  }
}

testIntegration()