import {
    DiagnosisSchema,
    ActionItemSchema,
    ProductSuggestionSchema,
    SourceSchema,
    RecommendationSchema,
  } from '@/lib/validation/schemas'
  
  function testSchemas() {
    console.log('Testing Zod validation schemas...\n')
  
    // Test 1: Valid Diagnosis
    console.log('Test 1: Valid Diagnosis Schema')
    try {
      const validDiagnosis = {
        condition: 'Nitrogen Deficiency',
        conditionType: 'deficiency',
        confidence: 0.85,
        reasoning: 'The V-shaped yellowing pattern on lower leaves is characteristic of nitrogen deficiency.',
      }
      const result = DiagnosisSchema.parse(validDiagnosis)
      console.log('✅ Valid diagnosis passed validation')
    } catch (error: any) {
      console.log('❌ Validation failed:', error.errors)
    }
  
    // Test 2: Invalid Diagnosis (confidence out of range)
    console.log('\nTest 2: Invalid Diagnosis (confidence > 1)')
    try {
      const invalidDiagnosis = {
        condition: 'Test',
        conditionType: 'deficiency',
        confidence: 1.5, // Invalid: > 1
        reasoning: 'Test reasoning',
      }
      DiagnosisSchema.parse(invalidDiagnosis)
      console.log('❌ Should have failed validation')
    } catch (error: any) {
      console.log('✅ Correctly rejected invalid confidence')
      console.log('   Error:', error.message)
    }
  
    // Test 3: Valid ActionItem
    console.log('\nTest 3: Valid ActionItem Schema')
    try {
      const validAction = {
        action: 'Apply side-dress nitrogen',
        priority: 'immediate',
        timing: 'Within 7 days',
        details: 'Apply 40-60 lbs N/acre as side-dress application.',
        citations: ['chunk-123', 'chunk-456'],
      }
      ActionItemSchema.parse(validAction)
      console.log('✅ Valid action item passed validation')
    } catch (error: any) {
      console.log('❌ Validation failed:', error.errors)
    }
  
    // Test 4: Invalid ActionItem (missing citations)
    console.log('\nTest 4: Invalid ActionItem (no citations)')
    try {
      const invalidAction = {
        action: 'Test action',
        priority: 'soon',
        details: 'Test details',
        citations: [], // Invalid: empty array
      }
      ActionItemSchema.parse(invalidAction)
      console.log('❌ Should have failed validation')
    } catch (error: any) {
      console.log('✅ Correctly rejected empty citations')
      console.log('   Error:', error.message)
    }
  
    // Test 5: Invalid ActionItem (wrong priority)
    console.log('\nTest 5: Invalid ActionItem (invalid priority)')
    try {
      const invalidAction = {
        action: 'Test action',
        priority: 'maybe', // Invalid: not in enum
        details: 'Test details',
        citations: ['chunk-1'],
      }
      ActionItemSchema.parse(invalidAction)
      console.log('❌ Should have failed validation')
    } catch (error: any) {
      console.log('✅ Correctly rejected invalid priority')
      console.log('   Error:', error.message)
    }
  
    // Test 6: Valid ProductSuggestion
    console.log('\nTest 6: Valid ProductSuggestion Schema')
    try {
      const validProduct = {
        productId: 'prod-123',
        reason: 'Liquid form ideal for side-dress application',
        applicationRate: '10-15 gal/acre',
        alternatives: ['prod-456', 'prod-789'],
      }
      ProductSuggestionSchema.parse(validProduct)
      console.log('✅ Valid product suggestion passed validation')
    } catch (error: any) {
      console.log('❌ Validation failed:', error.errors)
    }
  
    // Test 7: Valid Source
    console.log('\nTest 7: Valid Source Schema')
    try {
      const validSource = {
        chunkId: 'chunk-abc-123',
        relevance: 0.92,
        excerpt: 'Nitrogen deficiency causes V-shaped yellowing...',
      }
      SourceSchema.parse(validSource)
      console.log('✅ Valid source passed validation')
    } catch (error: any) {
      console.log('❌ Validation failed:', error.errors)
    }
  
    // Test 8: Invalid Source (excerpt too long)
    console.log('\nTest 8: Invalid Source (excerpt > 500 chars)')
    try {
      const invalidSource = {
        chunkId: 'chunk-123',
        relevance: 0.8,
        excerpt: 'x'.repeat(501), // Invalid: > 500 chars
      }
      SourceSchema.parse(invalidSource)
      console.log('❌ Should have failed validation')
    } catch (error: any) {
      console.log('✅ Correctly rejected long excerpt')
      console.log('   Error:', error.message)
    }
  
    // Test 9: Complete Valid Recommendation
    console.log('\nTest 9: Complete Valid Recommendation Schema')
    try {
      const validRecommendation = {
        diagnosis: {
          condition: 'Nitrogen Deficiency',
          conditionType: 'deficiency',
          confidence: 0.85,
          reasoning: 'V-shaped yellowing on lower leaves indicates nitrogen deficiency.',
        },
        recommendations: [
          {
            action: 'Apply nitrogen fertilizer',
            priority: 'immediate',
            timing: 'Within 7 days',
            details: 'Apply 50 lbs N/acre',
            citations: ['chunk-1'],
          },
        ],
        products: [
          {
            productId: 'prod-1',
            reason: 'Good for side-dress',
            applicationRate: '10 gal/acre',
          },
        ],
        sources: [
          {
            chunkId: 'chunk-1',
            relevance: 0.9,
            excerpt: 'Test excerpt',
          },
        ],
        confidence: 0.85,
      }
      RecommendationSchema.parse(validRecommendation)
      console.log('✅ Complete recommendation passed validation')
    } catch (error: any) {
      console.log('❌ Validation failed:', error.errors)
    }
  
    // Test 10: Invalid Recommendation (too many recommendations)
    console.log('\nTest 10: Invalid Recommendation (> 5 actions)')
    try {
      const invalidRecommendation = {
        diagnosis: {
          condition: 'Test',
          conditionType: 'deficiency',
          confidence: 0.8,
          reasoning: 'Test reasoning that is long enough',
        },
        recommendations: Array(6).fill({
          action: 'Test',
          priority: 'soon',
          details: 'Test details',
          citations: ['chunk-1'],
        }),
        products: [],
        sources: [
          {
            chunkId: 'chunk-1',
            relevance: 0.9,
            excerpt: 'Test',
          },
        ],
        confidence: 0.8,
      }
      RecommendationSchema.parse(invalidRecommendation)
      console.log('❌ Should have failed validation')
    } catch (error: any) {
      console.log('✅ Correctly rejected > 5 recommendations')
      console.log('   Error:', error.message)
    }
  
    console.log('\n✅ All schema tests complete!')
  }
  
  testSchemas()