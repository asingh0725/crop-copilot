import OpenAI from "openai";

// Lazy initialization to avoid issues during build
let openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openai) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openai;
}

/**
 * Generate embedding vector using OpenAI's text-embedding-3-small model
 * Returns 1536-dimensional vector
 */
export async function generateEmbedding(text: string, vector_dimension: 1536 | 512): Promise<number[]> {
  try {
    const client = getOpenAI();
    const response = await client.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
      encoding_format: "float",
      dimensions: vector_dimension,
    });

    return response.data[0].embedding;
  } catch (error) {
    console.error("Error generating embedding:", error);
    throw new Error("Failed to generate embedding");
  }
}
