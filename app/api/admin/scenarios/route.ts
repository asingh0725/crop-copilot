import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { validateAdminAuth } from "@/lib/admin/auth";

const createScenarioSchema = z.object({
  inputId: z.string().optional(),
  scenarioType: z.enum(["PHOTO", "LAB_REPORT"]),
  expectedDiagnosis: z.string().min(1),
  expectedConditionType: z.enum([
    "deficiency",
    "disease",
    "pest",
    "environmental",
    "unknown",
  ]),
  mustInclude: z.array(z.string()),
  shouldAvoid: z.array(z.string()),
  symptoms: z.string().min(1),
  crop: z.string().min(1),
  location: z.string().min(1),
  season: z.string().optional(),
  sourceFocus: z.array(z.string()).optional(),
});

export async function POST(request: NextRequest) {
  const authError = validateAdminAuth(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const validated = createScenarioSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: "Invalid scenario data", details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const scenario = await prisma.testScenario.create({
      data: {
        inputId: validated.data.inputId,
        scenarioType: validated.data.scenarioType,
        expectedDiagnosis: validated.data.expectedDiagnosis,
        expectedConditionType: validated.data.expectedConditionType,
        mustInclude: validated.data.mustInclude,
        shouldAvoid: validated.data.shouldAvoid,
        symptoms: validated.data.symptoms,
        crop: validated.data.crop,
        location: validated.data.location,
        season: validated.data.season,
        sourceFocus: validated.data.sourceFocus || [],
      },
    });

    return NextResponse.json(scenario, { status: 201 });
  } catch (error) {
    console.error("Create scenario error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const authError = validateAdminAuth(request);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const crop = searchParams.get("crop");
    const location = searchParams.get("location");

    const scenarios = await prisma.testScenario.findMany({
      where: {
        ...(crop ? { crop } : {}),
        ...(location ? { location } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        evaluations: {
          select: { id: true, overall: true, accuracy: true, helpfulness: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    return NextResponse.json(scenarios);
  } catch (error) {
    console.error("List scenarios error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
