import { NextResponse } from "next/server";
import { apiError, requireDatabaseUrl } from "@/lib/api";
import { sql } from "@/lib/db";
import { generateProposalFromNotes } from "@/lib/generate-proposal";

type GenerateBody = {
  leadId?: string;
  rawNotes?: string;
};

export async function POST(request: Request) {
  const db = requireDatabaseUrl();
  if (db instanceof NextResponse) return db;

  let body: GenerateBody;
  try {
    body = (await request.json()) as GenerateBody;
  } catch {
    return apiError(400, "Invalid JSON body");
  }

  const leadId = body.leadId?.trim();
  if (!leadId) return apiError(400, "leadId is required");

  let rawNotes = body.rawNotes?.trim() ?? "";
  let customerName = "Customer";

  try {
    const leads = await sql`
      SELECT id, customer_name, raw_notes
      FROM leads
      WHERE id = ${leadId}
      LIMIT 1
    `;
    if (leads.length === 0) return apiError(404, "Lead not found");

    const lead = leads[0] as {
      id: string;
      customer_name: string;
      raw_notes: string;
    };
    customerName = lead.customer_name;
    if (!rawNotes) rawNotes = lead.raw_notes;
  } catch (err) {
    return apiError(500, "Failed to load lead from database", err);
  }

  if (!rawNotes) {
    return apiError(400, "Lead has no site-walk notes to price");
  }

  let generated;
  try {
    generated = await generateProposalFromNotes(rawNotes);
  } catch (err) {
    return apiError(
      502,
      "Proposal generation failed after validation/retry. No draft was saved.",
      err,
    );
  }

  const { draft, model_used, cost_usd } = generated;

  try {
    const existing = await sql`
      SELECT id FROM proposals
      WHERE lead_id = ${leadId} AND status = 'draft'
      ORDER BY created_at DESC
      LIMIT 1
    `;

    let proposal;
    if (existing.length > 0) {
      const draftId = (existing[0] as { id: string }).id;
      const updated = await sql`
        UPDATE proposals
        SET
          line_items = ${JSON.stringify(draft.line_items)},
          subtotal = ${draft.subtotal},
          total = ${draft.total},
          ai_summary = ${draft.summary},
          model_used = ${model_used},
          cost_usd = ${cost_usd}
        WHERE id = ${draftId}
        RETURNING
          id, lead_id, line_items, subtotal, total, ai_summary,
          status, model_used, cost_usd, created_at
      `;
      proposal = updated[0];
    } else {
      const inserted = await sql`
        INSERT INTO proposals (
          lead_id, line_items, subtotal, total, ai_summary,
          status, model_used, cost_usd
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
          id, lead_id, line_items, subtotal, total, ai_summary,
          status, model_used, cost_usd, created_at
      `;
      proposal = inserted[0];
    }

    await sql`
      UPDATE leads SET status = 'proposal_draft' WHERE id = ${leadId}
    `;

    return NextResponse.json({ proposal, customer_name: customerName });
  } catch (err) {
    return apiError(500, "Generated OK but failed to save draft", err);
  }
}
