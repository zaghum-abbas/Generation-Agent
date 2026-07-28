import { NextResponse } from "next/server";
import { apiError, requireDatabaseUrl } from "@/lib/api";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

async function queryLeads() {
  return sql`
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
}

export async function GET() {
  const db = requireDatabaseUrl();
  if (db instanceof NextResponse) return db;

  try {
    let rows;
    try {
      rows = await queryLeads();
    } catch (firstErr) {
      await new Promise((r) => setTimeout(r, 300));
      rows = await queryLeads();
      console.warn(
        "[GET /api/leads] retried after:",
        firstErr instanceof Error ? firstErr.message : firstErr,
      );
    }
    return NextResponse.json({ leads: rows });
  } catch (err) {
    return apiError(500, "Failed to load leads", err);
  }
}

type CreateLeadBody = {
  customer_name?: string;
  email?: string;
  phone?: string;
  raw_notes?: string;
};

export async function POST(request: Request) {
  const db = requireDatabaseUrl();
  if (db instanceof NextResponse) return db;

  let body: CreateLeadBody;
  try {
    body = (await request.json()) as CreateLeadBody;
  } catch {
    return apiError(400, "Invalid JSON body");
  }

  const customerName = body.customer_name?.trim() ?? "";
  const email = body.email?.trim() ?? "";
  const phone = body.phone?.trim() || null;
  const rawNotes = body.raw_notes?.trim() ?? "";

  if (!customerName || !email || !rawNotes) {
    return apiError(
      400,
      "customer_name, email, and raw_notes are required",
    );
  }
  if (!email.includes("@")) {
    return apiError(400, "email looks invalid");
  }

  try {
    const inserted = await sql`
      INSERT INTO leads (customer_name, email, phone, raw_notes, status)
      VALUES (${customerName}, ${email}, ${phone}, ${rawNotes}, 'new')
      RETURNING id, customer_name, email, phone, raw_notes, status, created_at
    `;
    return NextResponse.json({ lead: inserted[0] }, { status: 201 });
  } catch (err) {
    return apiError(500, "Failed to create lead", err);
  }
}
