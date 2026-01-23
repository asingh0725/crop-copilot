import { generateRecommendation, type NormalizedInput } from '@/lib/ai/agents/recommendation'
import { searchTextChunks, searchImageChunks } from '@/lib/retrieval/search'
import { assembleContext } from '@/lib/retrieval/context-assembly'

async function testInputVariations() {
  console.log('Testing different input types...\n')

  const testCases: Array<{ name: string; input: NormalizedInput }> = [
    {
      name: 'Photo input only',
      input: {
        type: 'photo',
        description: 'Purple discoloration on corn leaves',
        crop: 'corn',
        location: 'Iowa',
      },
    },
    {
      name: 'Lab data input',
      input: {
        type: 'lab_report',
        labData: {
          pH: 5.8,
          N: 12,
          P: 8,
          K: 95,
          crop: 'corn',
        },
        crop: 'corn',
        location: 'Minnesota',
      },
    },
    {
      name: 'Hybrid input (photo + lab)',
      input: {
        type: 'hybrid',
        description: 'Leaf margins turning brown',
        labData: {
          pH: 7.2,
          K: 45,
        },
        crop: 'corn',
      },
    },
  ]

  for (const testCase of testCases) {
    console.log(`\n--- ${testCase.name} ---`)
    
    try {
      // Build query from input
      let query = testCase.input.description || ''
      if (testCase.input.labData) {
        query += ` pH: ${testCase.input.labData.pH || ''}`
      }
      query += ` ${testCase.input.crop || ''}`

      // Get context
      const textResults = await searchTextChunks(query, 3)
      const imageResults = await searchImageChunks(query, 2)
      const context = await assembleContext(textResults, imageResults)

      console.log(`Context: ${context.totalChunks} chunks`)

      if (context.totalChunks === 0) {
        console.log('⚠️  No context found, skipping...')
        continue
      }

      // Generate
      const recommendation = await generateRecommendation(testCase.input, context)

      console.log('✅ Generated successfully')
      console.log(`   Diagnosis: ${recommendation.diagnosis.condition}`)
      console.log(`   Recommendations: ${recommendation.recommendations.length}`)
      console.log(`   Confidence: ${recommendation.confidence}`)

    } catch (error: any) {
      console.error('❌ Failed:', error.message)
    }
  }

  console.log('\n✅ Input variation tests complete!')
}

testInputVariations()