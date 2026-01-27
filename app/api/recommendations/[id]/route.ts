export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // First try to find by recommendation ID
    let recommendation = await prisma.recommendation.findUnique({
      where: { id: params.id },
      include: {
        input: {
          include: {
            user: {
              include: {
                profile: true,
              },
            },
          },
        },
        sources: {
          include: {
            textChunk: {
              include: {
                source: true,
              },
            },
            imageChunk: {
              include: {
                source: true,
              },
            },
          },
        },
      },
    });

    // If not found, try to find by input ID
    if (!recommendation) {
      recommendation = await prisma.recommendation.findUnique({
        where: { inputId: params.id },
        include: {
          input: {
            include: {
              user: {
                include: {
                  profile: true,
                },
              },
            },
          },
          sources: {
            include: {
              textChunk: {
                include: {
                  source: true,
                },
              },
              imageChunk: {
                include: {
                  source: true,
                },
              },
            },
          },
        },
      });
    }

    if (!recommendation) {
      return NextResponse.json(
        { error: "Recommendation not found" },
        { status: 404 }
      );
    }

    if (recommendation.input.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Format response with all necessary data
    const response = {
      id: recommendation.id,
      createdAt: recommendation.createdAt,
      diagnosis: recommendation.diagnosis,
      confidence: recommendation.confidence,
      modelUsed: recommendation.modelUsed,
      input: {
        id: recommendation.input.id,
        type: recommendation.input.type,
        description: recommendation.input.description,
        imageUrl: recommendation.input.imageUrl,
        labData: recommendation.input.labData,
        createdAt: recommendation.input.createdAt,
      },
      sources: recommendation.sources.map((source) => {
        const chunk = source.textChunk || source.imageChunk;
        const sourceDoc = chunk?.source;

        return {
          id: source.id,
          chunkId: source.textChunkId || source.imageChunkId,
          type: source.textChunkId ? "text" : "image",
          content: source.textChunk?.content || source.imageChunk?.caption,
          imageUrl: source.imageChunk?.imageUrl,
          relevanceScore: source.relevanceScore,
          source: sourceDoc
            ? {
                id: sourceDoc.id,
                title: sourceDoc.title,
                type: sourceDoc.sourceType,
                url: sourceDoc.url,
              }
            : null,
        };
      }),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Get recommendation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
