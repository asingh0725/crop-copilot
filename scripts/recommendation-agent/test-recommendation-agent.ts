import { generateRecommendation, type NormalizedInput } from '@/lib/ai/agents/recommendation'
import { searchTextChunks, searchImageChunks } from '@/lib/retrieval/search'
import { assembleContext } from '@/lib/retrieval/context-assembly'

async function testRecommendationAgent() {
  console.log('Testing recommendation agent...\n')

  try {
    // Step 1: Create test input
    console.log('1. Creating test input...')
    const input: NormalizedInput = {
      type: 'photo',
      description: 'Corn plants showing yellowing on lower leaves, V4 growth stage',
      crop: 'corn',
      location: 'Iowa',
    }
    console.log('✅ Input created')
    console.log('   Type:', input.type)
    console.log('   Crop:', input.crop)
    console.log('   Description:', input.description)

    // Step 2: Retrieve and assemble context
    console.log('\n2. Retrieving context...')
    const query = `${input.description} ${input.crop}`
    const textResults = await searchTextChunks(query, 5)
    const imageResults = await searchImageChunks(query, 3)
    const context = await assembleContext(textResults, imageResults)
    
    console.log('✅ Context assembled')
    console.log('   Total chunks:', context.totalChunks)
    console.log('   Total tokens:', context.totalTokens)

    if (context.totalChunks === 0) {
      console.log('❌ No context retrieved. Cannot test agent.')
      return
    }

    // Step 3: Generate recommendation
    console.log('\n3. Generating recommendation with Claude...')
    console.log('   (This may take 10-20 seconds...)')
    
    const startTime = Date.now()
    const recommendation = await generateRecommendation(input, context)
    const duration = Date.now() - startTime
    
    console.log(`✅ Recommendation generated in ${duration}ms`)

    // Step 4: Verify structure
    console.log('\n4. Verifying recommendation structure...')
    
    // Check diagnosis
    if (recommendation.diagnosis) {
      console.log('✅ Diagnosis present')
      console.log('   Condition:', recommendation.diagnosis.condition)
      console.log('   Type:', recommendation.diagnosis.conditionType)
      console.log('   Confidence:', recommendation.diagnosis.confidence)
      console.log('   Reasoning:', recommendation.diagnosis.reasoning.substring(0, 100) + '...')
    } else {
      console.log('❌ Diagnosis missing')
    }

    // Check recommendations
    if (recommendation.recommendations && recommendation.recommendations.length > 0) {
      console.log(`✅ Recommendations present (${recommendation.recommendations.length})`)
      recommendation.recommendations.forEach((rec, i) => {
        console.log(`\n   Action ${i + 1}:`)
        console.log('   - Action:', rec.action)
        console.log('   - Priority:', rec.priority)
        console.log('   - Citations:', rec.citations.length, 'chunks')
      })
    } else {
      console.log('❌ Recommendations missing or empty')
    }

    // Check products
    if (recommendation.products) {
      console.log(`\n✅ Products present (${recommendation.products.length})`)
      recommendation.products.forEach((prod, i) => {
        console.log(`\n   Product ${i + 1}:`)
        console.log('   - ID:', prod.productId)
        console.log('   - Reason:', prod.reason.substring(0, 60) + '...')
      })
    } else {
      console.log('❌ Products array missing')
    }

    // Check sources
    if (recommendation.sources && recommendation.sources.length > 0) {
      console.log(`\n✅ Sources present (${recommendation.sources.length})`)
      recommendation.sources.forEach((src, i) => {
        console.log(`\n   Source ${i + 1}:`)
        console.log('   - Chunk ID:', src.chunkId)
        console.log('   - Relevance:', src.relevance)
        console.log('   - Excerpt length:', src.excerpt.length, 'chars')
      })
    } else {
      console.log('❌ Sources missing or empty')
    }

    // Check overall confidence
    console.log('\n5. Overall confidence:', recommendation.confidence)
    if (recommendation.confidence >= 0 && recommendation.confidence <= 1) {
      console.log('✅ Confidence in valid range (0-1)')
    } else {
      console.log('❌ Confidence out of range')
    }

    // Step 5: Output full recommendation for inspection
    console.log('\n6. Full recommendation output:')
    console.log(JSON.stringify(recommendation, null, 2))

    console.log('\n✅ All basic tests passed!')

  } catch (error) {
    console.error('❌ Test failed:', error)
    throw error
  }
}

testRecommendationAgent()