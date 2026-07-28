import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { generateProposalFromNotes } from "@/lib/generate-proposal";

type GenerateBody = {
  leadId?: string;
  rawNotes?: string;
};

/**
 * POST /api/generate-proposal
 * Body: { leadId: string } — loads notes from Neon, calls Claude, saves draft.
 * Optional rawNotes override for testing without a lead row.
 */
export async function POST(request: Request) {
  let body: GenerateBody;
  try {
    body = (await request.json()) as GenerateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const leadId = body.leadId?.trim();
  if (!leadId) {
    return NextResponse.json(
      { error: "leadId is required" },
      { status: 400 },
    );
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "DATABASE_URL is not configured" },
      { status: 500 },
    );
  }

  let rawNotes = body.rawNotes?.trim() ?? "";
  let customerName = "Customer";

  try {
    const leads = await sql`
      SELECT id, customer_name, raw_notes
      FROM leads
      WHERE id = ${leadId}
      LIMIT 1
    `;

    if (leads.length === 0) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const lead = leads[0] as {
      id: string;
      customer_name: string;
      raw_notes: string;
    };
    customerName = lead.customer_name;
    if (!rawNotes) {
      rawNotes = lead.raw_notes;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error";
    console.error("[generate-proposal] lead fetch failed:", message);
    return NextResponse.json(
      { error: "Failed to load lead from database", detail: message },
      { status: 500 },
    );
  }

  if (!rawNotes) {
    return NextResponse.json(
      { error: "Lead has no site-walk notes to price" },
      { status: 400 },
    );
  }

  let generated;
  try {
    generated = await generateProposalFromNotes(rawNotes);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Claude API error";
    console.error("[generate-proposal] Claude failed:", message);
    return NextResponse.json(
      {
        error:
          "Proposal generation failed after validation/retry. No draft was saved.",
        detail: message,
      },
      { status: 502 },
    );
  }

  const { draft, model_used, cost_usd } = generated;

  try {
    // Guardrails already validated shape — only then persist as draft.
    const inserted = await sql`
      INSERT INTO proposals (
        lead_id,
        line_items,
        subtotal,
        total,
        ai_summary,
        status,
        model_used,
        cost_usd
      )
      VALUES (
        ${leadId},
        ${JSON.stringify(draft.line_items)},
        ${draft.subtotal},
        ${draft.total},
        ${draft.summary},
        'draft',
        ${model_used},
        ${cost_usd}
      )
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

    // Mark lead as having a draft so the dashboard can badge it.
    await sql`
      UPDATE leads
      SET status = 'proposal_draft'
      WHERE id = ${leadId}
    `;

    return NextResponse.json({
      proposal: inserted[0],
      customer_name: customerName,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error";
    console.error("[generate-proposal] save failed:", message);
    return NextResponse.json(
      { error: "Generated OK but failed to save draft", detail: message },
      { status: 500 },
    );
  }
}
