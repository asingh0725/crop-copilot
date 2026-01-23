import { generateEmbedding } from "@/lib/embeddings/generate";

const TEXT_EMBEDDING_DIMENSIONS = 1536
async function testEmbeddings() {
  console.log("Testing embedding generation...\n");

  try {
    const text = "Nitrogen deficiency in corn causes yellowing of lower leaves";
    console.log("Input text:", text);

    const embedding = await generateEmbedding(text, TEXT_EMBEDDING_DIMENSIONS);

    console.log("✅ Embedding generated successfully");
    console.log("Dimensions:", embedding.length);
    console.log("First 5 values:", embedding.slice(0, 5));
    console.log("Expected dimensions: 1536");

    if (embedding.length === 1536) {
      console.log("✅ Correct dimensionality");
    } else {
      console.log("❌ Wrong dimensionality");
    }
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

testEmbeddings();
