import { prisma } from "@/lib/prisma";
import { generateEmbedding } from "@/lib/embeddings/generate";

const TEXT_EMBEDDING_DIMENSIONS = 1536;
const IMAGE_EMBEDDING_DIMENSIONS = 512;

async function seedTestChunks() {
  console.log("Starting seed process...\n");

  try {
    // Step 1: Create or find test Source
    console.log("1. Creating/finding test source...");

    let source = await prisma.source.findUnique({
      where: { url: "https://example.com/corn-guide" },
    });

    if (source) {
      console.log("✅ Using existing source:", source.id);

      // Clean up old chunks from this source
      console.log("   Cleaning up old chunks...");
      await prisma.textChunk.deleteMany({
        where: { sourceId: source.id },
      });
      await prisma.imageChunk.deleteMany({
        where: { sourceId: source.id },
      });
      console.log("   ✅ Old chunks deleted");
    } else {
      source = await prisma.source.create({
        data: {
          title: "Corn Nutrient Management Guide",
          url: "https://example.com/corn-guide",
          sourceType: "UNIVERSITY_EXTENSION",
          institution: "Test University",
        },
      });
      console.log("✅ Source created:", source.id);
    }

    // Step 2: Create TextChunks with embeddings
    console.log("\n2. Creating text chunks with embeddings...");

    const textChunksData = [
      {
        content:
          "Nitrogen deficiency in corn typically manifests as V-shaped yellowing starting at the leaf tip and progressing toward the base. This symptom usually appears first on the lower, older leaves because nitrogen is a mobile nutrient that the plant relocates from older tissue to support new growth.",
        metadata: { topic: "nitrogen-deficiency", crop: "corn" },
      },
      {
        content:
          "For side-dress nitrogen application in corn, apply 40-60 lbs N/acre when plants are at the V4-V6 growth stage. This timing ensures the nitrogen is available during the critical period of rapid growth and maximum nutrient uptake.",
        metadata: { topic: "nitrogen-application", crop: "corn" },
      },
      {
        content:
          "Phosphorus deficiency symptoms include purple or reddish discoloration of leaves, especially on the leaf margins and tips. Stunted growth and delayed maturity are also common indicators. Cool, wet soil conditions can induce temporary phosphorus deficiency even when soil test levels are adequate.",
        metadata: { topic: "phosphorus-deficiency", crop: "corn" },
      },
      {
        content:
          "Soil pH significantly affects nutrient availability. For corn production, the optimal pH range is 6.0-6.8. Below pH 6.0, aluminum and manganese toxicity can occur, while above pH 7.5, phosphorus, iron, and zinc become less available to plants.",
        metadata: { topic: "soil-ph", crop: "corn" },
      },
      {
        content:
          "Potassium deficiency symptoms appear as yellowing or browning of leaf margins (firing), beginning with the older leaves. Potassium is essential for water regulation, enzyme activation, and photosynthesis. Adequate potassium also improves stalk strength and disease resistance.",
        metadata: { topic: "potassium-deficiency", crop: "corn" },
      },
    ];

    for (const chunkData of textChunksData) {
      console.log(`  Processing: "${chunkData.content.substring(0, 50)}..."`);

      const embedding = await generateEmbedding(
        chunkData.content,
        TEXT_EMBEDDING_DIMENSIONS
      );
      const embeddingString = `[${embedding.join(",")}]`;

      const chunk = await prisma.$executeRaw`
        INSERT INTO "TextChunk" (id, "sourceId", content, embedding, metadata, "createdAt")
        VALUES (
          gen_random_uuid()::text,
          ${source.id},
          ${chunkData.content},
          ${embeddingString}::vector,
          ${JSON.stringify(chunkData.metadata)}::jsonb,
          NOW()
        )
      `;

      console.log(`  ✅ Created text chunk`);
    }

    // Step 3: Create ImageChunks with embeddings
    console.log("\n3. Creating image chunks with embeddings...");

    const imageChunksData = [
      {
        imageUrl: "https://example.com/images/nitrogen-deficiency-corn.jpg",
        caption:
          "Nitrogen deficiency in corn showing characteristic V-shaped yellowing on lower leaves. The yellowing starts at the leaf tip and progresses toward the base, with older leaves affected first.",
        metadata: { symptom: "nitrogen-deficiency", crop: "corn" },
      },
      {
        imageUrl: "https://example.com/images/phosphorus-deficiency-corn.jpg",
        caption:
          "Phosphorus deficiency in young corn plant displaying purple discoloration on leaves and stunted growth. Early season P deficiency often occurs in cool, wet conditions.",
        metadata: { symptom: "phosphorus-deficiency", crop: "corn" },
      },
      {
        imageUrl: "https://example.com/images/potassium-deficiency-corn.jpg",
        caption:
          "Potassium deficiency showing leaf margin firing (yellowing and browning) on older corn leaves. The yellowing typically starts at the leaf edges and progresses inward.",
        metadata: { symptom: "potassium-deficiency", crop: "corn" },
      },
    ];

    for (const imageData of imageChunksData) {
      console.log(`  Processing: "${imageData.caption.substring(0, 50)}..."`);

      // Generate embedding from caption
      const embedding = await generateEmbedding(
        imageData.caption,
        IMAGE_EMBEDDING_DIMENSIONS
      );
      const embeddingString = `[${embedding.join(",")}]`;

      await prisma.$executeRaw`
        INSERT INTO "ImageChunk" (id, "sourceId", "imageUrl", caption, embedding, metadata, "createdAt")
        VALUES (
          gen_random_uuid()::text,
          ${source.id},
          ${imageData.imageUrl},
          ${imageData.caption},
          ${embeddingString}::vector,
          ${JSON.stringify(imageData.metadata)}::jsonb,
          NOW()
        )
      `;

      console.log(`  ✅ Created image chunk`);
    }

    // Step 4: Verify counts
    console.log("\n4. Verifying data...");

    // Use raw SQL to count since embedding is Unsupported type
    const textCountResult = await prisma.$queryRaw<[{ count: bigint }]>`
  SELECT COUNT(*) as count FROM "TextChunk" WHERE embedding IS NOT NULL
`;
    const textCount = Number(textCountResult[0].count);

    const imageCountResult = await prisma.$queryRaw<[{ count: bigint }]>`
  SELECT COUNT(*) as count FROM "ImageChunk" WHERE embedding IS NOT NULL
`;
    const imageCount = Number(imageCountResult[0].count);

    console.log(`\n✅ Seed complete!`);
    console.log(`   Text chunks with embeddings: ${textCount}`);
    console.log(`   Image chunks with embeddings: ${imageCount}`);
    console.log(`   Source ID: ${source.id}`);
  } catch (error) {
    console.error("❌ Seed failed:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

seedTestChunks();
