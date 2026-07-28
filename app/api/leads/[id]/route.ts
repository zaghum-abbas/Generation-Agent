import { NextResponse } from "next/server";
import { apiError, requireDatabaseUrl } from "@/lib/api";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

export async function GET(_request: Request, context: RouteContext) {
  const db = requireDatabaseUrl();
  if (db instanceof NextResponse) return db;

  const leadId = context.params.id;

  try {
    const load = async () => {
      const leads = await sql`
        SELECT id, customer_name, email, phone, raw_notes, status, created_at
        FROM leads
        WHERE id = ${leadId}
        LIMIT 1
      `;
      if (leads.length === 0) {
        return { leads, proposals: [] as Record<string, unknown>[] };
      }

      const proposals = await sql`
        SELECT
          id, lead_id, line_items, subtotal, total, ai_summary,
          status, model_used, cost_usd, created_at
        FROM proposals
        WHERE lead_id = ${leadId}
        ORDER BY created_at DESC
        LIMIT 1
      `;
      return { leads, proposals };
    };

    let result;
    try {
      result = await load();
    } catch (firstErr) {
      await new Promise((r) => setTimeout(r, 300));
      result = await load();
      console.warn(
        "[GET /api/leads/:id] retried after:",
        firstErr instanceof Error ? firstErr.message : firstErr,
      );
    }

    if (result.leads.length === 0) {
      return apiError(404, "Lead not found");
    }

    return NextResponse.json({
      lead: result.leads[0],
      proposal: result.proposals[0] ?? null,
    });
  } catch (err) {
    return apiError(500, "Failed to load lead", err);
  }
}
