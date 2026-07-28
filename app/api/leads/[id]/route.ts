import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

type RouteContext = { params: { id: string } };

/** GET /api/leads/[id] — lead + latest proposal for the detail pane. */
export async function GET(_request: Request, context: RouteContext) {
  const leadId = context.params.id;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "DATABASE_URL is not configured" },
      { status: 500 },
    );
  }

  try {
    const leads = await sql`
      SELECT id, customer_name, email, phone, raw_notes, status, created_at
      FROM leads
      WHERE id = ${leadId}
      LIMIT 1
    `;

    if (leads.length === 0) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const proposals = await sql`
      SELECT
        id,
        lead_id,
        line_items,
        subtotal,
        total,
        ai_summary,
        status,
        model_used,
        cost_usd,
        created_at
      FROM proposals
      WHERE lead_id = ${leadId}
      ORDER BY created_at DESC
      LIMIT 1
    `;

    return NextResponse.json({
      lead: leads[0],
      proposal: proposals[0] ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error";
    console.error("[GET /api/leads/:id]", message);
    return NextResponse.json(
      { error: "Failed to load lead", detail: message },
      { status: 500 },
    );
  }
}
