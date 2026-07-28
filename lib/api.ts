import { NextResponse } from "next/server";

export function requireDatabaseUrl(): string | NextResponse {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "DATABASE_URL is not configured" },
      { status: 500 },
    );
  }
  return process.env.DATABASE_URL;
}

export function apiError(
  status: number,
  error: string,
  err?: unknown,
): NextResponse {
  const detail = err instanceof Error ? err.message : undefined;
  if (detail) console.error(error, detail);
  return NextResponse.json(detail ? { error, detail } : { error }, {
    status,
  });
}
