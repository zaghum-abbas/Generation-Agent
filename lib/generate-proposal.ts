import Anthropic from "@anthropic-ai/sdk";
import { formatPricingCatalog, PRICING_TABLE } from "@/lib/pricing";
export const PROPOSAL_MODEL = "claude-sonnet-4-6";

const INPUT_USD_PER_MTOK = 3;
const OUTPUT_USD_PER_MTOK = 15;

export type LineItem = {
  sku?: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

export type ProposalDraft = {
  line_items: LineItem[];
  subtotal: number;
  total: number;
  summary: string;
};

export type GenerateResult = {
  draft: ProposalDraft;
  model_used: string;
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
};

function estimateCostUsd(inputTokens: number, outputTokens: number): number {
  const cost =
    (inputTokens / 1_000_000) * INPUT_USD_PER_MTOK +
    (outputTokens / 1_000_000) * OUTPUT_USD_PER_MTOK;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

function buildSystemPrompt(): string {
  return `You are the proposal engine for Greenscape Pro, a high-end landscaping company.
Extract scope from the founder's messy site-walk notes and produce a priced proposal.

TONE (critical — this goes to a real homeowner):
- Write like a seasoned landscape designer talking to a neighbor: warm, clear, confident — not corporate, not chatbotty.
- summary: one natural paragraph in second person ("you'll get…", "we'll remove…"). Mention what they'll enjoy day-to-day, not jargon dumps.
- Avoid robotic phrasing ("utilize", "leverage", "comprehensive solution", "as per your request", bullet-speak inside the summary).
- line item descriptions: short and plain ("Cedar pergola over seating area"), not SKU-speak or marketing fluff.
- Sound human. If it could have been written by Marcus after a site walk, you're doing it right.

RULES:
1. Return ONLY valid JSON — no markdown fences, no commentary.
2. Price ONLY using the catalog below. Match each scope item to the closest SKU.
3. Use the catalog unit_price exactly. quantity × unit_price = line_total (round to 2 decimals).
4. subtotal = sum of line_totals. total = subtotal (no tax in this demo).
5. summary = one humanized paragraph a homeowner can understand and feel good about.
6. Include mobilization when there is meaningful install work.
7. If a note is ambiguous, pick a reasonable quantity and stay conservative.

PRICING CATALOG:
${formatPricingCatalog()}

JSON SHAPE (exact keys):
{
  "line_items": [
    {
      "sku": string,
      "description": string,
      "quantity": number,
      "unit_price": number,
      "line_total": number
    }
  ],
  "subtotal": number,
  "total": number,
  "summary": string
}`;
}

function extractJsonText(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  return trimmed;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function validateProposalDraft(data: unknown): ProposalDraft | null {
  if (!data || typeof data !== "object") return null;

  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj.line_items) || obj.line_items.length === 0) return null;
  if (!isFiniteNumber(obj.subtotal) || !isFiniteNumber(obj.total)) return null;
  if (typeof obj.summary !== "string" || obj.summary.trim().length === 0) {
    return null;
  }
  if (obj.total <= 0) return null;

  const line_items: LineItem[] = [];
  for (const rawItem of obj.line_items) {
    if (!rawItem || typeof rawItem !== "object") return null;
    const item = rawItem as Record<string, unknown>;
    if (typeof item.description !== "string" || !item.description.trim()) {
      return null;
    }
    if (
      !isFiniteNumber(item.quantity) ||
      !isFiniteNumber(item.unit_price) ||
      !isFiniteNumber(item.line_total)
    ) {
      return null;
    }
    if (item.quantity <= 0 || item.unit_price < 0) return null;

    line_items.push({
      sku: typeof item.sku === "string" ? item.sku.trim() : undefined,
      description: item.description.trim(),
      quantity: item.quantity,
      unit_price: item.unit_price,
      line_total: item.line_total,
    });
  }

  return {
    line_items,
    subtotal: obj.subtotal,
    total: obj.total,
    summary: obj.summary.trim(),
  };
}


export function applyCatalogPrices(draft: ProposalDraft): ProposalDraft {
  const line_items = draft.line_items.map((item) => {
    const match =
      PRICING_TABLE.find(
        (p) => item.sku && p.sku.toLowerCase() === item.sku.toLowerCase(),
      ) ??
      PRICING_TABLE.find(
        (p) =>
          item.description.toLowerCase().includes(p.description.toLowerCase()) ||
          p.description.toLowerCase().includes(item.description.toLowerCase()),
      );
    const unit_price = match ? match.unit_price : item.unit_price;
    const line_total = Math.round(item.quantity * unit_price * 100) / 100;
    return {
      ...item,
      sku: match?.sku ?? item.sku,
      unit_price,
      line_total,
      description: item.description || match?.description || "Line item",
    };
  });

  const subtotal =
    Math.round(line_items.reduce((sum, i) => sum + i.line_total, 0) * 100) /
    100;

  return {
    line_items,
    subtotal,
    total: subtotal,
    summary: draft.summary,
  };
}

async function callClaudeOnce(
  client: Anthropic,
  rawNotes: string,
): Promise<{ text: string; input_tokens: number; output_tokens: number }> {
  const response = await client.messages.create({
    model: PROPOSAL_MODEL,
    max_tokens: 4096,
    system: buildSystemPrompt(),
    messages: [
      {
        role: "user",
        content: `Site-walk notes:\n\n${rawNotes}`,
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude returned no text content");
  }

  return {
    text: textBlock.text,
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
  };
}

function parseAndValidate(text: string): ProposalDraft | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonText(text));
  } catch {
    return null;
  }
  const validated = validateProposalDraft(parsed);
  if (!validated) return null;
  const priced = applyCatalogPrices(validated);
  if (priced.total <= 0) return null;
  return priced;
}

export async function generateProposalFromNotes(
  rawNotes: string,
): Promise<GenerateResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  const client = new Anthropic({ apiKey });

  let input_tokens = 0;
  let output_tokens = 0;
  let lastError = "Invalid JSON or zero total from Claude";

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const result = await callClaudeOnce(client, rawNotes);
      input_tokens += result.input_tokens;
      output_tokens += result.output_tokens;

      const draft = parseAndValidate(result.text);
      if (draft) {
        return {
          draft,
          model_used: PROPOSAL_MODEL,
          cost_usd: estimateCostUsd(input_tokens, output_tokens),
          input_tokens,
          output_tokens,
        };
      }
      lastError =
        attempt === 1
          ? "Claude returned invalid JSON or a zero total; retrying once"
          : "Claude returned invalid JSON or a zero total after retry";
    } catch (err) {
      const message = err instanceof Error ? err.message : "Claude API error";
      if (attempt === 2) throw new Error(message);
      lastError = message;
    }
  }

  throw new Error(lastError);
}
