import { NextRequest, NextResponse } from "next/server";

/**
 * Validates admin API key from Authorization header.
 * Set ADMIN_API_KEY in your .env file.
 *
 * Returns null if authorized, or a 401 NextResponse if not.
 */
export function validateAdminAuth(
  request: NextRequest
): NextResponse | null {
  const adminKey = process.env.ADMIN_API_KEY;

  if (!adminKey) {
    return NextResponse.json(
      { error: "Admin API not configured" },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Missing Authorization header" },
      { status: 401 }
    );
  }

  const token = authHeader.slice(7);
  if (token !== adminKey) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  return null;
}
