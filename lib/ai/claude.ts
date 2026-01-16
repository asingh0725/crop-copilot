import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const MODEL = 'claude-sonnet-4-20250514'
const MAX_TOKENS = 4096
const TIMEOUT_MS = 60000

export interface ClaudeMessage {
  role: 'user' | 'assistant'
  content: string | ClaudeContentBlock[]
}

export interface ClaudeContentBlock {
  type: 'text' | 'image'
  text?: string
  source?: {
    type: 'base64'
    media_type: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
    data: string
  }
}

export interface ClaudeResponse {
  content: string
  usage: {
    inputTokens: number
    outputTokens: number
  }
  model: string
}

/**
 * Send a text-only message to Claude
 */
export async function analyzeText(
  systemPrompt: string,
  userPrompt: string
): Promise<ClaudeResponse> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    messages: [
      { role: 'user', content: userPrompt }
    ],
  })

  const textContent = response.content.find(block => block.type === 'text')

  return {
    content: textContent?.type === 'text' ? textContent.text : '',
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
    model: response.model,
  }
}

/**
 * Send a message with an image to Claude (vision)
 */
export async function analyzeWithVision(
  systemPrompt: string,
  userPrompt: string,
  imageBase64: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' = 'image/jpeg'
): Promise<ClaudeResponse> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: imageBase64,
            },
          },
          {
            type: 'text',
            text: userPrompt,
          },
        ],
      },
    ],
  })

  const textContent = response.content.find(block => block.type === 'text')

  return {
    content: textContent?.type === 'text' ? textContent.text : '',
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
    model: response.model,
  }
}

/**
 * Fetch an image from URL and convert to base64
 */
export async function imageUrlToBase64(imageUrl: string): Promise<{
  base64: string
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp'
}> {
  const response = await fetch(imageUrl)
  const arrayBuffer = await response.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString('base64')

  const contentType = response.headers.get('content-type') || 'image/jpeg'
  let mediaType: 'image/jpeg' | 'image/png' | 'image/webp' = 'image/jpeg'

  if (contentType.includes('png')) {
    mediaType = 'image/png'
  } else if (contentType.includes('webp')) {
    mediaType = 'image/webp'
  }

  return { base64, mediaType }
}
