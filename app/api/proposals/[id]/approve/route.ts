import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { notifyProposalApproved } from "@/lib/slack";

type RouteContext = { params: { id: string } };

/**
 * POST /api/proposals/[id]/approve
 * Human-in-the-loop gate: draft -> approved, then Slack alert.
 * Customer email/SMS is intentionally out of scope for this demo.
 */
export async function POST(_request: Request, context: RouteContext) {
  const proposalId = context.params.id;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "DATABASE_URL is not configured" },
      { status: 500 },
    );
  }

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
      WHERE p.id = ${proposalId}
      LIMIT 1
    `;

    if (rows.length === 0) {
      return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
    }

    const row = rows[0] as {
      id: string;
      status: string;
      total: string | number;
      customer_name: string;
      lead_id: string;
    };

    if (row.status === "approved" || row.status === "sent") {
      return NextResponse.json(
        { error: "Proposal is already approved" },
        { status: 409 },
      );
    }

    const total =
      typeof row.total === "number" ? row.total : Number(row.total);

    // Persist approval first so Slack retries don't double-approve awkwardly.
    const updated = await sql`
      UPDATE proposals
      SET status = 'approved'
      WHERE id = ${proposalId}
      RETURNING
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
    `;

    await sql`
      UPDATE leads
      SET status = 'approved'
      WHERE id = ${row.lead_id}
    `;

    try {
      await notifyProposalApproved({
        customerName: row.customer_name,
        total,
      });
    } catch (slackErr) {
      const message =
        slackErr instanceof Error ? slackErr.message : "Slack error";
      console.error("[approve] Slack webhook failed:", message);
      // Proposal is already approved — surface Slack failure clearly.
      return NextResponse.json(
        {
          proposal: updated[0],
          warning: "Proposal approved, but Slack notification failed",
          detail: message,
        },
        { status: 200 },
      );
    }

    return NextResponse.json({ proposal: updated[0] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error";
    console.error("[POST /api/proposals/:id/approve]", message);
    return NextResponse.json(
      { error: "Failed to approve proposal", detail: message },
      { status: 500 },
    );
  }
}
