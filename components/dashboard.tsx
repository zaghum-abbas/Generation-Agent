"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Lead, LeadListItem, LineItem, Proposal } from "@/lib/types";

function formatMoney(value: number | string | null | undefined): string {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function StatusBadge({
  status,
}: {
  status: string | null | undefined;
}) {
  const label = status ?? "no proposal";
  const styles =
    label === "approved" || label === "sent"
      ? "bg-emerald-100 text-emerald-800"
      : label === "draft" || label === "proposal_draft"
        ? "bg-amber-100 text-amber-900"
        : "bg-stone-100 text-stone-600";

  return (
    <span
      className={cn(
        "inline-flex rounded-md px-2 py-0.5 text-xs font-medium capitalize",
        styles,
      )}
    >
      {label.replace("_", " ")}
    </span>
  );
}

function recalcItems(items: LineItem[]): {
  items: LineItem[];
  subtotal: number;
} {
  const next = items.map((item) => ({
    ...item,
    line_total: Math.round(item.quantity * item.unit_price * 100) / 100,
  }));
  const subtotal =
    Math.round(next.reduce((sum, i) => sum + i.line_total, 0) * 100) / 100;
  return { items: next, subtotal };
}

export function Dashboard() {
  const [leads, setLeads] = useState<LeadListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lead, setLead] = useState<Lead | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [editItems, setEditItems] = useState<LineItem[]>([]);
  const [editSummary, setEditSummary] = useState("");
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const runningTotal = useMemo(
    () => recalcItems(editItems).subtotal,
    [editItems],
  );

  const loadLeads = useCallback(async () => {
    setListLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/leads");
      const data = (await res.json()) as {
        leads?: LeadListItem[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to load leads");
      const next = data.leads ?? [];
      setLeads(next);
      if (!selectedId && next.length > 0) {
        setSelectedId(next[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load leads");
    } finally {
      setListLoading(false);
    }
  }, [selectedId]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/leads/${id}`);
      const data = (await res.json()) as {
        lead?: Lead;
        proposal?: Proposal | null;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to load lead");
      setLead(data.lead ?? null);
      const p = data.proposal ?? null;
      setProposal(p);
      setEditItems(p?.line_items ?? []);
      setEditSummary(p?.ai_summary ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load lead");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLeads();
  }, [loadLeads]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  async function handleGenerate() {
    if (!selectedId) return;
    setGenerating(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/generate-proposal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: selectedId }),
      });
      const data = (await res.json()) as {
        proposal?: Proposal;
        error?: string;
        detail?: string;
      };
      if (!res.ok) {
        throw new Error(
          data.detail ? `${data.error}: ${data.detail}` : data.error ?? "Generate failed",
        );
      }
      setProposal(data.proposal ?? null);
      setEditItems(data.proposal?.line_items ?? []);
      setEditSummary(data.proposal?.ai_summary ?? "");
      setNotice("Draft proposal generated.");
      await loadLeads();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generate failed");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSaveEdits() {
    if (!proposal || proposal.status !== "draft") return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const { items, subtotal } = recalcItems(editItems);
      const res = await fetch(`/api/proposals/${proposal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          line_items: items,
          ai_summary: editSummary,
        }),
      });
      const data = (await res.json()) as {
        proposal?: Proposal;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setProposal(data.proposal ?? null);
      setEditItems(data.proposal?.line_items ?? items);
      setNotice(`Saved. Running total ${formatMoney(subtotal)}.`);
      await loadLeads();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove() {
    if (!proposal) return;
    // Persist latest edits before approval so Slack total matches the UI.
    if (proposal.status === "draft") {
      await handleSaveEdits();
    }
    setApproving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/proposals/${proposal.id}/approve`, {
        method: "POST",
      });
      const data = (await res.json()) as {
        proposal?: Proposal;
        error?: string;
        warning?: string;
        detail?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Approve failed");
      setProposal(data.proposal ?? null);
      if (data.warning) {
        setNotice(`${data.warning}${data.detail ? `: ${data.detail}` : ""}`);
      } else {
        setNotice("Approved — Slack notified.");
      }
      await loadLeads();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approve failed");
    } finally {
      setApproving(false);
    }
  }

  function updateItem(
    index: number,
    field: "description" | "quantity" | "unit_price",
    value: string,
  ) {
    setEditItems((prev) => {
      const next = [...prev];
      const item = { ...next[index] };
      if (field === "description") {
        item.description = value;
      } else if (field === "quantity") {
        item.quantity = Number(value) || 0;
      } else {
        item.unit_price = Number(value) || 0;
      }
      item.line_total =
        Math.round(item.quantity * item.unit_price * 100) / 100;
      next[index] = item;
      return next;
    });
  }

  const isDraft = proposal?.status === "draft";
  const canEdit = Boolean(proposal && isDraft);

  return (
    <div className="flex min-h-svh flex-col bg-[#f6f4ef] text-stone-900">
      <header className="border-b border-stone-200/80 bg-[#1f3d2b] px-6 py-5 text-white">
        <div className="mx-auto flex max-w-6xl items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium tracking-[0.18em] text-emerald-200/90 uppercase">
              Internal tools
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
              Greenscape Pro
            </h1>
            <p className="mt-1 text-sm text-emerald-100/80">
              Proposal Generation Agent — notes in, priced draft out, you
              approve.
            </p>
          </div>
        </div>
      </header>

      {(error || notice) && (
        <div className="mx-auto w-full max-w-6xl px-6 pt-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          )}
          {notice && !error && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              {notice}
            </div>
          )}
        </div>
      )}

      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-6 px-6 py-6 lg:grid-cols-[320px_1fr]">
        <section className="rounded-xl border border-stone-200 bg-white shadow-sm">
          <div className="border-b border-stone-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-stone-800">Leads</h2>
            <p className="text-xs text-stone-500">
              Select a lead to generate or review a proposal.
            </p>
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            {listLoading ? (
              <p className="px-4 py-8 text-center text-sm text-stone-500">
                Loading leads…
              </p>
            ) : leads.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-stone-500">
                No leads yet. Run seed.sql in Neon.
              </p>
            ) : (
              <ul>
                {leads.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      className={cn(
                        "flex w-full flex-col gap-1 border-b border-stone-100 px-4 py-3 text-left transition-colors hover:bg-stone-50",
                        selectedId === item.id && "bg-emerald-50/70",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-stone-900">
                          {item.customer_name}
                        </span>
                        <StatusBadge status={item.proposal_status} />
                      </div>
                      <span className="truncate text-xs text-stone-500">
                        {item.email}
                      </span>
                      {item.proposal_total != null && (
                        <span className="text-xs font-medium text-stone-700">
                          {formatMoney(item.proposal_total)}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-stone-200 bg-white shadow-sm">
          {detailLoading || !lead ? (
            <p className="px-6 py-16 text-center text-sm text-stone-500">
              {detailLoading ? "Loading lead…" : "Select a lead to begin."}
            </p>
          ) : (
            <div className="flex flex-col gap-6 p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-stone-900">
                    {lead.customer_name}
                  </h2>
                  <p className="mt-1 text-sm text-stone-500">
                    {lead.email}
                    {lead.phone ? ` · ${lead.phone}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={proposal?.status ?? lead.status} />
                  <Button
                    onClick={() => void handleGenerate()}
                    disabled={generating}
                    className="bg-[#1f3d2b] text-white hover:bg-[#294f38]"
                  >
                    {generating ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="size-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        Generating…
                      </span>
                    ) : proposal ? (
                      "Regenerate Proposal"
                    ) : (
                      "Generate Proposal"
                    )}
                  </Button>
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold text-stone-800">
                  Site-walk notes
                </h3>
                <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg border border-stone-200 bg-stone-50 p-4 font-sans text-sm leading-relaxed text-stone-700">
                  {lead.raw_notes}
                </pre>
              </div>

              {proposal ? (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-stone-800">
                        Proposal draft
                      </h3>
                      <p className="text-xs text-stone-500">
                        {proposal.model_used
                          ? `Model: ${proposal.model_used}`
                          : null}
                        {proposal.cost_usd != null
                          ? ` · Est. cost $${Number(proposal.cost_usd).toFixed(4)}`
                          : null}
                      </p>
                    </div>
                    <p className="text-lg font-semibold text-stone-900">
                      {formatMoney(canEdit ? runningTotal : proposal.total)}
                    </p>
                  </div>

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-stone-600">
                      Customer summary
                    </span>
                    <textarea
                      value={editSummary}
                      onChange={(e) => setEditSummary(e.target.value)}
                      disabled={!canEdit}
                      rows={4}
                      className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm leading-relaxed text-stone-800 disabled:bg-stone-50"
                    />
                  </label>

                  <div className="overflow-x-auto rounded-lg border border-stone-200">
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-stone-50 text-xs tracking-wide text-stone-500 uppercase">
                        <tr>
                          <th className="px-3 py-2 font-medium">Description</th>
                          <th className="px-3 py-2 font-medium">Qty</th>
                          <th className="px-3 py-2 font-medium">Unit $</th>
                          <th className="px-3 py-2 font-medium text-right">
                            Line total
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {editItems.map((item, index) => (
                          <tr
                            key={`${item.description}-${index}`}
                            className="border-t border-stone-100"
                          >
                            <td className="px-3 py-2">
                              <input
                                value={item.description}
                                disabled={!canEdit}
                                onChange={(e) =>
                                  updateItem(index, "description", e.target.value)
                                }
                                className="w-full min-w-[180px] rounded border border-transparent bg-transparent px-1 py-1 focus:border-stone-300 focus:bg-white disabled:text-stone-700"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                step="any"
                                value={item.quantity}
                                disabled={!canEdit}
                                onChange={(e) =>
                                  updateItem(index, "quantity", e.target.value)
                                }
                                className="w-20 rounded border border-transparent bg-transparent px-1 py-1 focus:border-stone-300 focus:bg-white"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                step="0.01"
                                value={item.unit_price}
                                disabled={!canEdit}
                                onChange={(e) =>
                                  updateItem(index, "unit_price", e.target.value)
                                }
                                className="w-24 rounded border border-transparent bg-transparent px-1 py-1 focus:border-stone-300 focus:bg-white"
                              />
                            </td>
                            <td className="px-3 py-2 text-right font-medium tabular-nums">
                              {formatMoney(item.line_total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {canEdit && (
                      <Button
                        variant="outline"
                        onClick={() => void handleSaveEdits()}
                        disabled={saving || approving}
                      >
                        {saving ? "Saving…" : "Save edits"}
                      </Button>
                    )}
                    <Button
                      onClick={() => void handleApprove()}
                      disabled={approving || proposal.status === "approved"}
                      className="bg-emerald-700 text-white hover:bg-emerald-800"
                    >
                      {approving
                        ? "Approving…"
                        : proposal.status === "approved"
                          ? "Approved"
                          : "Approve & Send"}
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="rounded-lg border border-dashed border-stone-300 bg-stone-50 px-4 py-8 text-center text-sm text-stone-500">
                  No proposal yet. Click Generate Proposal to draft one from
                  these notes.
                </p>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
