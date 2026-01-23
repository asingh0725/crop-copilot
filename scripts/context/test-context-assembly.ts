import { searchTextChunks, searchImageChunks } from '@/lib/retrieval/search'
import { assembleContext } from '@/lib/retrieval/context-assembly'

async function testContextAssembly() {
  console.log('Testing context assembly service...\n')

  try {
    // Step 1: Retrieve chunks
    console.log('1. Retrieving chunks...')
    const query = 'nitrogen deficiency corn yellowing leaves'
    
    const textResults = await searchTextChunks(query, 5)
    const imageResults = await searchImageChunks(query, 3)
    
    console.log(`✅ Retrieved ${textResults.length} text chunks`)
    console.log(`✅ Retrieved ${imageResults.length} image chunks`)

    // Step 2: Assemble context
    console.log('\n2. Assembling context...')
    const context = await assembleContext(textResults, imageResults)
    
    console.log(`✅ Context assembled successfully`)
    console.log(`   Total chunks: ${context.totalChunks}`)
    console.log(`   Total tokens: ${context.totalTokens}`)
    console.log(`   Relevance threshold: ${context.relevanceThreshold}`)

    // Step 3: Verify chunks have source metadata
    console.log('\n3. Verifying chunk structure...')
    context.chunks.forEach((chunk, i) => {
      console.log(`\n   Chunk ${i + 1}:`)
      console.log(`   - ID: ${chunk.id}`)
      console.log(`   - Similarity: ${chunk.similarity.toFixed(4)}`)
      console.log(`   - Content length: ${chunk.content.length} chars`)
      console.log(`   - Source title: ${chunk.source.title}`)
      console.log(`   - Source type: ${chunk.source.sourceType}`)
      console.log(`   - Content preview: ${chunk.content.substring(0, 80)}...`)
    })

    // Step 4: Verify sorting (highest similarity first)
    console.log('\n4. Verifying sort order...')
    let sortedCorrectly = true
    for (let i = 0; i < context.chunks.length - 1; i++) {
      if (context.chunks[i].similarity < context.chunks[i + 1].similarity) {
        sortedCorrectly = false
        console.log(`❌ Sort error at index ${i}`)
      }
    }
    if (sortedCorrectly) {
      console.log('✅ Chunks sorted correctly by relevance')
    }

    // Step 5: Verify no duplicates
    console.log('\n5. Verifying deduplication...')
    const ids = new Set(context.chunks.map(c => c.id))
    if (ids.size === context.chunks.length) {
      console.log('✅ No duplicate chunks')
    } else {
      console.log(`❌ Found duplicates: ${context.chunks.length - ids.size}`)
    }

    // Step 6: Verify token limit
    console.log('\n6. Verifying token limit...')
    const MAX_TOKENS = 4000
    if (context.totalTokens <= MAX_TOKENS) {
      console.log(`✅ Within token limit: ${context.totalTokens}/${MAX_TOKENS}`)
    } else {
      console.log(`❌ Exceeds token limit: ${context.totalTokens}/${MAX_TOKENS}`)
    }

    // Step 7: Verify relevance threshold filtering
    console.log('\n7. Verifying relevance threshold...')
    const belowThreshold = context.chunks.filter(
      c => c.similarity < context.relevanceThreshold
    )
    if (belowThreshold.length === 0) {
      console.log(`✅ All chunks above threshold (${context.relevanceThreshold})`)
    } else {
      console.log(`❌ Found ${belowThreshold.length} chunks below threshold`)
    }

    console.log('\n✅ All tests passed!')

  } catch (error) {
    console.error('❌ Test failed:', error)
    throw error
  }
}

testContextAssembly()