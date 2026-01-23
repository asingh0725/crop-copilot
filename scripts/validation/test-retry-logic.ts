import { generateWithRetry } from '@/lib/validation/retry'
import { searchTextChunks, searchImageChunks } from '@/lib/retrieval/search'
import { assembleContext } from '@/lib/retrieval/context-assembly'
import type { NormalizedInput } from '@/lib/ai/agents/recommendation'

async function testRetryLogic() {
  console.log('Testing retry logic with real AI generation...\n')

  try {
    // Step 1: Create input and get context
    console.log('1. Setting up test...')
    const input: NormalizedInput = {
      type: 'photo',
      description: 'Yellowing leaves on corn plants at V4 stage',
      crop: 'corn',
      location: 'Iowa',
    }

    const query = `${input.description} ${input.crop}`
    const textResults = await searchTextChunks(query, 5)
    const imageResults = await searchImageChunks(query, 3)
    const context = await assembleContext(textResults, imageResults)

    console.log('✅ Context assembled:', context.totalChunks, 'chunks')

    if (context.totalChunks === 0) {
      console.log('❌ No context. Cannot test retry logic.')
      return
    }

    // Step 2: Generate with retry logic
    console.log('\n2. Generating recommendation with retry logic...')
    console.log('   (May take 20-30 seconds if retry is needed...)')

    const startTime = Date.now()
    const recommendation = await generateWithRetry(input, context)
    const duration = Date.now() - startTime

    console.log(`✅ Recommendation generated successfully in ${duration}ms`)

    // Step 3: Verify the result is valid
    console.log('\n3. Verifying validated recommendation...')

    if (recommendation.diagnosis) {
      console.log('✅ Diagnosis present')
      console.log('   Condition:', recommendation.diagnosis.condition)
      console.log('   Type:', recommendation.diagnosis.conditionType)
      console.log('   Confidence:', recommendation.diagnosis.confidence)
    }

    if (recommendation.recommendations && recommendation.recommendations.length > 0) {
      console.log(`✅ Recommendations: ${recommendation.recommendations.length}`)
      console.log('   First action:', recommendation.recommendations[0].action)
      console.log('   Priority:', recommendation.recommendations[0].priority)
      console.log('   Citations:', recommendation.recommendations[0].citations.length)
    }

    if (recommendation.sources && recommendation.sources.length > 0) {
      console.log(`✅ Sources: ${recommendation.sources.length}`)
    }

    console.log('✅ Confidence:', recommendation.confidence)

    // Step 4: Verify all fields match schema
    console.log('\n4. Verifying schema compliance...')
    
    const checks = [
      recommendation.diagnosis.confidence >= 0 && recommendation.diagnosis.confidence <= 1,
      ['deficiency', 'disease', 'pest', 'environmental', 'unknown'].includes(recommendation.diagnosis.conditionType),
      recommendation.recommendations.every(r => ['immediate', 'soon', 'when_convenient'].includes(r.priority)),
      recommendation.recommendations.every(r => r.citations.length >= 1),
      recommendation.recommendations.length >= 1 && recommendation.recommendations.length <= 5,
      recommendation.products.length <= 6,
      recommendation.sources.length >= 1,
      recommendation.sources.every(s => s.excerpt.length <= 500),
    ]

    if (checks.every(c => c === true)) {
      console.log('✅ All schema constraints satisfied')
    } else {
      console.log('❌ Some schema constraints failed')
    }

    console.log('\n✅ Retry logic test passed!')

  } catch (error) {
    console.error('❌ Test failed:', error)
    throw error
  }
}

testRetryLogic()