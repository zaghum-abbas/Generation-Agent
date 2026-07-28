import { formatUsd } from "@/lib/money";

export async function notifyProposalApproved(params: {
  customerName: string;
  total: number;
}): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    throw new Error("SLACK_WEBHOOK_URL is not configured");
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: `New proposal approved for ${params.customerName}, total ${formatUsd(params.total)}`,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Slack webhook failed (${response.status})${body ? `: ${body}` : ""}`,
    );
  }
}
