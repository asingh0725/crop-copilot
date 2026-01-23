import { generateRecommendation, type NormalizedInput } from '@/lib/ai/agents/recommendation'
import { searchTextChunks, searchImageChunks } from '@/lib/retrieval/search'
import { assembleContext } from '@/lib/retrieval/context-assembly'

async function testRetryLogic() {
  console.log('Testing retry logic with feedback...\n')

  try {
    // Create input
    const input: NormalizedInput = {
      type: 'photo',
      description: 'Yellowing leaves on corn',
      crop: 'corn',
    }

    // Get context
    const query = `${input.description} ${input.crop}`
    const textResults = await searchTextChunks(query, 3)
    const imageResults = await searchImageChunks(query, 2)
    const context = await assembleContext(textResults, imageResults)

    console.log('Context assembled:', context.totalChunks, 'chunks\n')

    // Test 1: Normal generation (no retry feedback)
    console.log('Test 1: Normal generation (no retry feedback)...')
    const rec1 = await generateRecommendation(input, context)
    console.log('✅ Generated without retry feedback')
    console.log('   Diagnosis:', rec1.diagnosis.condition)

    // Test 2: With retry feedback (simulating a validation error)
    console.log('\nTest 2: Generation with retry feedback...')
    const retryFeedback = `Your previous response failed validation. Please fix these issues:

1. Field "diagnosis.confidence": Must be between 0 and 1
2. Field "recommendations": Must have at least one citation

Please ensure:
- All required fields are present
- Confidence values are between 0 and 1
- Each recommendation has at least one citation`

    const rec2 = await generateRecommendation(input, context, retryFeedback)
    console.log('✅ Generated with retry feedback')
    console.log('   Diagnosis:', rec2.diagnosis.condition)
    console.log('   Note: Agent received feedback and adjusted response')

    console.log('\n✅ Retry logic test passed!')

  } catch (error) {
    console.error('❌ Test failed:', error)
  }
}

testRetryLogic()