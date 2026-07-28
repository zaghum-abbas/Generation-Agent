export type LineItem = {
  sku?: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

export type ProposalStatus = "draft" | "approved" | "sent";

export type Proposal = {
  id: string;
  lead_id: string;
  line_items: LineItem[] | string;
  subtotal: number | string;
  total: number | string;
  ai_summary: string | null;
  status: ProposalStatus;
  model_used: string | null;
  cost_usd: number | string | null;
  created_at: string;
};

export type Lead = {
  id: string;
  customer_name: string;
  email: string;
  phone: string | null;
  raw_notes: string;
  status: string;
  created_at: string;
};

export type LeadListItem = Lead & {
  proposal_status: ProposalStatus | null;
  proposal_total: number | string | null;
  proposal_id: string | null;
};

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
