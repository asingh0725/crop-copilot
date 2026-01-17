export const DIAGNOSIS_SYSTEM_PROMPT = `You are an expert agronomist AI assistant serving farmers and agricultural advisors across the United States and Canada. Your purpose is to analyze crop issues from photos and/or soil test data and provide actionable, research-informed recommendations.

## Your Expertise Covers
- Crop nutrient deficiencies and toxicities
- Plant diseases (fungal, bacterial, viral)
- Pest identification and damage assessment
- Environmental stress (drought, flooding, heat, cold)
- Soil health and fertility interpretation
- Regional growing practices for all US states and Canadian provinces

## Communication Principles
1. **Blend technical and accessible language**: Use proper agronomic terminology but always explain what it means. A new farmer and an experienced agronomist should both understand your response.

2. **Be specific and actionable**: Give exact rates, timings, and product categories. "Apply 40-60 lbs N/acre within 7 days" not "consider adding nitrogen."

3. **Be regionally aware**: Tailor advice to the user's state/province. Reference local conditions, typical practices, state extension recommendations, and appropriate timing for their region.

4. **Acknowledge uncertainty honestly**: Your confidence score must accurately reflect input quality. Explain what would increase confidence.

## Two-Stage Analysis Process

### STAGE 1: Input Validation
First, assess whether the provided inputs are sufficient for analysis.

REJECT (validation.passed = false) if:
- Image is severely blurred, too dark, or too bright to discern content
- Image clearly shows non-agricultural content (pets, vehicles, people, food, screenshots, etc.)
- Description is completely unrelated to farming/crops

ACCEPT (validation.passed = true) if:
- Image shows plants, crops, leaves, soil, or field conditions (even if not perfect quality)
- Description has any relevance to crop/field issues

Be lenient - only reject obvious failures. When rejecting, clearly explain what the user should fix.

### STAGE 2: Confidence Calculation
Calculate confidence (0.50 to 0.95) based on input quality:

Base Score: 30 points

Image Quality (up to +20):
- Clear, focused, well-lit: +20
- Acceptable quality: +12
- Poor but usable: +5

Image Content (up to +10):
- Shows specific symptoms clearly: +10
- Shows general plant/field: +5

Description Quality (up to +15):
- Detailed (100+ chars, specific symptoms, timing, progression): +15
- Moderate (50-100 chars, mentions symptoms): +10
- Basic (under 50 chars, vague): +5

Lab Data (up to +20):
- Full nutrient panel: +20
- Partial data (pH + macros): +12
- No lab data: +0

Context (up to +15):
- Crop specified: +5
- Growth stage specified: +5
- Location specified: +5

Total points → Confidence:
- 80+ points: 0.80-0.95 confidence (high)
- 65-79 points: 0.65-0.79 confidence (moderate)
- 50-64 points: 0.50-0.64 confidence (low)
- Below 50 points: Return validation failure (insufficient data)

IMPORTANT: If calculated confidence would be below 0.50, set validation.passed to false and explain what additional information is needed.

### STAGE 3: Generate Diagnosis
For the primary condition:
- Name the specific condition (not vague categories)
- Explain your reasoning in terms both new and experienced farmers understand
- Describe what visual/data evidence supports this diagnosis
- - Rate severity as one of: "low", "moderate", "high", or "critical" (use "low" for normal/healthy conditions)

For differential diagnoses (include 2-3 alternatives):
- Only include conditions with >10% likelihood
- Explain what differentiates each from the primary diagnosis
- Note what evidence would confirm or rule out each alternative

### STAGE 4: Generate Recommendations
For each recommendation:
- State the action clearly
- Set priority: "immediate" (act within days), "soon" (1-2 weeks), "monitor" (observe and reassess)
- Give specific timing based on crop stage and regional conditions
- Include specific rates, product categories, and application methods
- Reference state extension guidelines where applicable
- Add safety notes for any chemical/fertilizer applications

## Required Disclaimers
ALWAYS include both disclaimers in every response:

Liability: "This analysis is provided for informational purposes only and does not constitute professional agronomic advice. Recommendations are based on general best practices and the information provided. Always consult with a certified crop advisor (CCA) or your local extension service before making critical crop management decisions. Results may vary based on field-specific conditions not captured in this analysis."

Safety: "Always read and follow label directions when applying any agricultural products. Observe all safety precautions, re-entry intervals (REI), and pre-harvest intervals (PHI). Store chemicals properly and dispose of containers according to local regulations."

## Output Format
Respond with ONLY valid JSON. No markdown code blocks, no text before or after the JSON.

For validation failures:
{"validation":{"passed":false,"inputQuality":"insufficient","issues":["array of specific issues to fix"]}}

For successful analysis, use this exact structure:
{"validation":{"passed":true,"inputQuality":"good","qualityFactors":{"imageClarity":"clear","imageRelevance":"agricultural","descriptionDetail":"detailed","labDataProvided":false}},"diagnosis":{"primaryCondition":{"condition":"string","confidence":0.00,"confidenceLevel":"moderate","severity":"moderate","reasoning":"string"},"differentialDiagnoses":[{"condition":"string","likelihood":0.00,"differentiatingFactors":"string"}]},"recommendations":[{"action":"string","priority":"immediate","timing":"string","details":"string","safetyNotes":"string or null"}],"confidenceExplanation":"string","additionalNotes":"string","disclaimers":{"liability":"standard liability text","safety":"standard safety text"}}`

export interface DiagnosisPromptInput {
  type: 'PHOTO' | 'LAB_REPORT' | 'HYBRID'
  imageUrl?: string | null
  description?: string | null
  labData?: Record<string, number | string | null> | null
  crop?: string | null
  location?: string | null
  growthStage?: string | null
}

/**
 * Build the user prompt for photo-based diagnosis
 */
export function buildPhotoPrompt(input: DiagnosisPromptInput): string {
  const parts: string[] = []

  parts.push('## Crop Analysis Request')
  parts.push('')
  parts.push('Please analyze the attached image of my crop and provide a diagnosis with recommendations.')
  parts.push('')

  if (input.description) {
    parts.push('### My Observations')
    parts.push(input.description)
    parts.push('')
  }

  parts.push('### Context')
  if (input.crop) parts.push(`- **Crop**: ${input.crop}`)
  if (input.location) parts.push(`- **Location**: ${input.location}`)
  if (input.growthStage) parts.push(`- **Growth Stage**: ${input.growthStage}`)
  parts.push('')

  parts.push('Please validate the input quality first, then provide your diagnosis and recommendations in the specified JSON format.')

  return parts.join('\n')
}

/**
 * Build the user prompt for lab report diagnosis
 */
export function buildLabReportPrompt(input: DiagnosisPromptInput): string {
  const parts: string[] = []

  parts.push('## Soil Test Analysis Request')
  parts.push('')
  parts.push('Please analyze the following soil test data and provide recommendations for my crop.')
  parts.push('')

  if (input.labData && Object.keys(input.labData).length > 0) {
    parts.push('### Soil Test Results')
    const labEntries = Object.entries(input.labData).filter(([_, v]) => v !== null && v !== '')

    // Group by category
    const macros = ['ph', 'organicMatter', 'nitrogen', 'phosphorus', 'potassium']
    const secondary = ['calcium', 'magnesium', 'sulfur']
    const micros = ['zinc', 'manganese', 'iron', 'copper', 'boron']
    const other = ['cec', 'baseSaturation']

    const formatValue = (key: string, value: any): string => {
      const units: Record<string, string> = {
        ph: '',
        organicMatter: '%',
        nitrogen: ' ppm',
        phosphorus: ' ppm',
        potassium: ' ppm',
        calcium: ' ppm',
        magnesium: ' ppm',
        sulfur: ' ppm',
        zinc: ' ppm',
        manganese: ' ppm',
        iron: ' ppm',
        copper: ' ppm',
        boron: ' ppm',
        cec: ' meq/100g',
        baseSaturation: '%',
      }
      return `${value}${units[key] || ''}`
    }

    const formatKey = (key: string): string => {
      const names: Record<string, string> = {
        ph: 'pH',
        organicMatter: 'Organic Matter',
        nitrogen: 'Nitrogen (N)',
        phosphorus: 'Phosphorus (P)',
        potassium: 'Potassium (K)',
        calcium: 'Calcium (Ca)',
        magnesium: 'Magnesium (Mg)',
        sulfur: 'Sulfur (S)',
        zinc: 'Zinc (Zn)',
        manganese: 'Manganese (Mn)',
        iron: 'Iron (Fe)',
        copper: 'Copper (Cu)',
        boron: 'Boron (B)',
        cec: 'CEC',
        baseSaturation: 'Base Saturation',
      }
      return names[key] || key
    }

    const printCategory = (title: string, keys: string[]) => {
      const entries = labEntries.filter(([k]) => keys.includes(k))
      if (entries.length > 0) {
        parts.push(`\n**${title}:**`)
        entries.forEach(([k, v]) => {
          parts.push(`- ${formatKey(k)}: ${formatValue(k, v)}`)
        })
      }
    }

    printCategory('Macronutrients', macros)
    printCategory('Secondary Nutrients', secondary)
    printCategory('Micronutrients', micros)
    printCategory('Other Properties', other)
    parts.push('')
  }

  if (input.description) {
    parts.push('### Additional Observations')
    parts.push(input.description)
    parts.push('')
  }

  parts.push('### Context')
  if (input.crop) parts.push(`- **Crop**: ${input.crop}`)
  if (input.location) parts.push(`- **Location**: ${input.location}`)
  if (input.growthStage) parts.push(`- **Growth Stage**: ${input.growthStage}`)
  parts.push('')

  parts.push('Please validate the input quality first, then provide your diagnosis and recommendations in the specified JSON format.')

  return parts.join('\n')
}

/**
 * Build the user prompt for hybrid diagnosis (photo + lab data)
 */
export function buildHybridPrompt(input: DiagnosisPromptInput): string {
  const parts: string[] = []

  parts.push('## Combined Crop and Soil Analysis Request')
  parts.push('')
  parts.push('Please analyze both the attached image and the soil test data to provide a comprehensive diagnosis.')
  parts.push('')

  if (input.description) {
    parts.push('### My Observations')
    parts.push(input.description)
    parts.push('')
  }

  if (input.labData && Object.keys(input.labData).length > 0) {
    // Use same lab data formatting as buildLabReportPrompt
    parts.push('### Soil Test Results')
    const labEntries = Object.entries(input.labData).filter(([_, v]) => v !== null && v !== '')

    const formatValue = (key: string, value: any): string => {
      const units: Record<string, string> = {
        ph: '', organicMatter: '%', nitrogen: ' ppm', phosphorus: ' ppm', potassium: ' ppm',
        calcium: ' ppm', magnesium: ' ppm', sulfur: ' ppm', zinc: ' ppm', manganese: ' ppm',
        iron: ' ppm', copper: ' ppm', boron: ' ppm', cec: ' meq/100g', baseSaturation: '%',
      }
      return `${value}${units[key] || ''}`
    }

    const formatKey = (key: string): string => {
      const names: Record<string, string> = {
        ph: 'pH', organicMatter: 'Organic Matter', nitrogen: 'Nitrogen (N)', phosphorus: 'Phosphorus (P)',
        potassium: 'Potassium (K)', calcium: 'Calcium (Ca)', magnesium: 'Magnesium (Mg)', sulfur: 'Sulfur (S)',
        zinc: 'Zinc (Zn)', manganese: 'Manganese (Mn)', iron: 'Iron (Fe)', copper: 'Copper (Cu)',
        boron: 'Boron (B)', cec: 'CEC', baseSaturation: 'Base Saturation',
      }
      return names[key] || key
    }

    labEntries.forEach(([k, v]) => {
      parts.push(`- ${formatKey(k)}: ${formatValue(k, v)}`)
    })
    parts.push('')
  }

  parts.push('### Context')
  if (input.crop) parts.push(`- **Crop**: ${input.crop}`)
  if (input.location) parts.push(`- **Location**: ${input.location}`)
  if (input.growthStage) parts.push(`- **Growth Stage**: ${input.growthStage}`)
  parts.push('')

  parts.push('Please validate the input quality first, then provide your diagnosis and recommendations in the specified JSON format.')

  return parts.join('\n')
}

/**
 * Build the appropriate prompt based on input type
 */
export function buildDiagnosisPrompt(input: DiagnosisPromptInput): string {
  switch (input.type) {
    case 'PHOTO':
      return buildPhotoPrompt(input)
    case 'LAB_REPORT':
      return buildLabReportPrompt(input)
    case 'HYBRID':
      return buildHybridPrompt(input)
    default:
      return buildPhotoPrompt(input)
  }
}
