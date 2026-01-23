import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { searchTextChunks, searchImageChunks, SearchResult } from "@/lib/retrieval/search";

const searchSchema = z.object({
  query: z.string().min(1, "Query is required"),
  type: z.enum(["text", "image", "both"]).default("both"),
  limit: z.number().min(1).max(20).default(5),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, type, limit } = searchSchema.parse(body);

    let textResults: SearchResult[] = [];
    let imageResults: SearchResult[] = [];

    if (type === "text" || type === "both") {
      textResults = await searchTextChunks(query, limit);
    }

    if (type === "image" || type === "both") {
      imageResults = await searchImageChunks(query, limit);
    }

    return NextResponse.json({
      query,
      type,
      textResults,
      imageResults,
      totalResults: textResults.length + imageResults.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.issues },
        { status: 400 }
      );
    }

    console.error("Search error:", error);
    return NextResponse.json(
      { error: "Failed to perform search" },
      { status: 500 }
    );
  }
}
