/**
 * Slack Incoming Webhook — fires when Marcus approves a proposal.
 * Why webhook (not Bot API): one URL, zero OAuth, enough for the approval loop.
 */
export async function notifyProposalApproved(params: {
  customerName: string;
  total: number;
}): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    throw new Error("SLACK_WEBHOOK_URL is not configured");
  }

  const totalFormatted = params.total.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: `New proposal approved for ${params.customerName}, total ${totalFormatted}`,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Slack webhook failed (${response.status})${body ? `: ${body}` : ""}`,
    );
  }
}
