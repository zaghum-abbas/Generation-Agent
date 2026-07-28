import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import type { LineItem } from "@/lib/types";

type RouteContext = { params: { id: string } };

type PatchBody = {
  line_items?: LineItem[];
  ai_summary?: string;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** PATCH /api/proposals/[id] — founder edits line items / summary before approve. */
export async function PATCH(request: Request, context: RouteContext) {
  const proposalId = context.params.id;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "DATABASE_URL is not configured" },
      { status: 500 },
    );
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.line_items && body.ai_summary === undefined) {
    return NextResponse.json(
      { error: "Provide line_items and/or ai_summary" },
      { status: 400 },
    );
  }

  try {
    const existing = await sql`
      SELECT id, status FROM proposals WHERE id = ${proposalId} LIMIT 1
    `;
    if (existing.length === 0) {
      return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
    }
    if ((existing[0] as { status: string }).status !== "draft") {
      return NextResponse.json(
        { error: "Only draft proposals can be edited" },
        { status: 409 },
      );
    }

    let lineItemsJson: string | null = null;
    let subtotal: number | null = null;
    let total: number | null = null;

    if (body.line_items) {
      if (!Array.isArray(body.line_items) || body.line_items.length === 0) {
        return NextResponse.json(
          { error: "line_items must be a non-empty array" },
          { status: 400 },
        );
      }

      const normalized: LineItem[] = [];
      for (const item of body.line_items) {
        if (
          typeof item.description !== "string" ||
          !isFiniteNumber(item.quantity) ||
          !isFiniteNumber(item.unit_price)
        ) {
          return NextResponse.json(
            { error: "Invalid line item shape" },
            { status: 400 },
          );
        }
        const line_total =
          Math.round(item.quantity * item.unit_price * 100) / 100;
        normalized.push({
          sku: item.sku,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          line_total,
        });
      }

      subtotal =
        Math.round(normalized.reduce((s, i) => s + i.line_total, 0) * 100) /
        100;
      total = subtotal;
      lineItemsJson = JSON.stringify(normalized);
    }

    const summary =
      body.ai_summary !== undefined ? body.ai_summary : null;

    const updated = await sql`
      UPDATE proposals
      SET
        line_items = COALESCE(${lineItemsJson}::jsonb, line_items),
        subtotal = COALESCE(${subtotal}, subtotal),
        total = COALESCE(${total}, total),
        ai_summary = COALESCE(${summary}, ai_summary)
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

    return NextResponse.json({ proposal: updated[0] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error";
    console.error("[PATCH /api/proposals/:id]", message);
    return NextResponse.json(
      { error: "Failed to update proposal", detail: message },
      { status: 500 },
    );
  }
}
