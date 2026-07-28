import { NextResponse } from "next/server";
import { apiError, requireDatabaseUrl } from "@/lib/api";
import { sql } from "@/lib/db";
import { toNumber } from "@/lib/money";
import { notifyProposalApproved } from "@/lib/slack";

type RouteContext = { params: { id: string } };

export async function POST(_request: Request, context: RouteContext) {
  const db = requireDatabaseUrl();
  if (db instanceof NextResponse) return db;

  try {
    const rows = await sql`
      SELECT
        p.id,
        p.status,
        p.total,
        l.customer_name,
        l.id AS lead_id
      FROM proposals p
      JOIN leads l ON l.id = p.lead_id
      WHERE p.id = ${context.params.id}
      LIMIT 1
    `;

    if (rows.length === 0) return apiError(404, "Proposal not found");

    const row = rows[0] as {
      id: string;
      status: string;
      total: string | number;
      customer_name: string;
      lead_id: string;
    };

    if (row.status === "approved" || row.status === "sent") {
      return apiError(409, "Proposal is already approved");
    }

    const updated = await sql`
      UPDATE proposals
      SET status = 'approved'
      WHERE id = ${context.params.id}
      RETURNING
        id, lead_id, line_items, subtotal, total, ai_summary,
        status, model_used, cost_usd, created_at
    `;

    await sql`
      UPDATE leads SET status = 'approved' WHERE id = ${row.lead_id}
    `;

    try {
      await notifyProposalApproved({
        customerName: row.customer_name,
        total: toNumber(row.total),
      });
    } catch (slackErr) {
      const detail =
        slackErr instanceof Error ? slackErr.message : "Slack error";
      console.error("[approve] Slack failed:", detail);
      return NextResponse.json({
        proposal: updated[0],
        warning: "Proposal approved, but Slack notification failed",
        detail,
      });
    }

    return NextResponse.json({ proposal: updated[0] });
  } catch (err) {
    return apiError(500, "Failed to approve proposal", err);
  }
}
