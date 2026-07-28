import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

/** GET /api/leads — dashboard list with latest proposal status. */
export async function GET() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "DATABASE_URL is not configured" },
      { status: 500 },
    );
  }

  try {
    // Latest proposal per lead via DISTINCT ON (Postgres).
    const rows = await sql`
      SELECT
        l.id,
        l.customer_name,
        l.email,
        l.phone,
        l.raw_notes,
        l.status,
        l.created_at,
        p.id AS proposal_id,
        p.status AS proposal_status,
        p.total AS proposal_total
      FROM leads l
      LEFT JOIN LATERAL (
        SELECT id, status, total
        FROM proposals
        WHERE lead_id = l.id
        ORDER BY created_at DESC
        LIMIT 1
      ) p ON true
      ORDER BY l.created_at DESC
    `;

    return NextResponse.json({ leads: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error";
    console.error("[GET /api/leads]", message);
    return NextResponse.json(
      { error: "Failed to load leads", detail: message },
      { status: 500 },
    );
  }
}
