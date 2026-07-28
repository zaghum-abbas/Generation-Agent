import { NextResponse } from "next/server";
import { apiError, requireDatabaseUrl } from "@/lib/api";
import { sql } from "@/lib/db";
import { recomputeLineItems } from "@/lib/money";
import { isFiniteNumber, type LineItem } from "@/lib/types";

type RouteContext = { params: { id: string } };

type PatchBody = {
  line_items?: LineItem[];
  ai_summary?: string;
};

export async function PATCH(request: Request, context: RouteContext) {
  const db = requireDatabaseUrl();
  if (db instanceof NextResponse) return db;

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return apiError(400, "Invalid JSON body");
  }

  if (!body.line_items && body.ai_summary === undefined) {
    return apiError(400, "Provide line_items and/or ai_summary");
  }

  try {
    const existing = await sql`
      SELECT id, status FROM proposals WHERE id = ${context.params.id} LIMIT 1
    `;
    if (existing.length === 0) return apiError(404, "Proposal not found");
    if ((existing[0] as { status: string }).status !== "draft") {
      return apiError(409, "Only draft proposals can be edited");
    }

    let lineItemsJson: string | null = null;
    let subtotal: number | null = null;
    let total: number | null = null;

    if (body.line_items) {
      if (!Array.isArray(body.line_items) || body.line_items.length === 0) {
        return apiError(400, "line_items must be a non-empty array");
      }

      for (const item of body.line_items) {
        if (
          typeof item.description !== "string" ||
          !isFiniteNumber(item.quantity) ||
          !isFiniteNumber(item.unit_price)
        ) {
          return apiError(400, "Invalid line item shape");
        }
      }

      const { items, subtotal: nextSubtotal } = recomputeLineItems(
        body.line_items,
      );
      lineItemsJson = JSON.stringify(items);
      subtotal = nextSubtotal;
      total = nextSubtotal;
    }

    const summary = body.ai_summary !== undefined ? body.ai_summary : null;

    const updated = await sql`
      UPDATE proposals
      SET
        line_items = COALESCE(${lineItemsJson}::jsonb, line_items),
        subtotal = COALESCE(${subtotal}, subtotal),
        total = COALESCE(${total}, total),
        ai_summary = COALESCE(${summary}, ai_summary)
      WHERE id = ${context.params.id}
      RETURNING
        id, lead_id, line_items, subtotal, total, ai_summary,
        status, model_used, cost_usd, created_at
    `;

    return NextResponse.json({ proposal: updated[0] });
  } catch (err) {
    return apiError(500, "Failed to update proposal", err);
  }
}
