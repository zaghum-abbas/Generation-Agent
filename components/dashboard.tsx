"use client";

import { useCallback, useEffect, useState } from "react";
import { AddLeadModal, type NewLeadForm } from "@/components/add-lead-modal";
import { Button } from "@/components/ui/button";
import { apiFetch, apiFetchOk } from "@/lib/client-api";
import { readErrorMessage } from "@/lib/errors";
import { formatUsd, recomputeLineItems, roundMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { Lead, LeadListItem, LineItem, Proposal } from "@/lib/types";

function StatusBadge({ status }: { status: string | null | undefined }) {
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

function applyProposal(p: Proposal | null | undefined) {
  if (!p) {
    return { proposal: null, items: [] as LineItem[], summary: "" };
  }

  let items: LineItem[] = [];
  if (Array.isArray(p.line_items)) {
    items = p.line_items;
  } else if (typeof p.line_items === "string") {
    try {
      const parsed: unknown = JSON.parse(p.line_items);
      if (Array.isArray(parsed)) items = parsed as LineItem[];
    } catch {
      items = [];
    }
  }

  return {
    proposal: { ...p, line_items: items },
    items,
    summary: p.ai_summary ?? "",
  };
}

async function fetchLeadsList(): Promise<LeadListItem[]> {
  let lastError = "Failed to load leads";

  for (let attempt = 1; attempt <= 2; attempt++) {
    const { res, data } = await apiFetch<{
      leads?: LeadListItem[];
      error?: string;
      detail?: string;
    }>("/api/leads");
    if (res.ok) return data.leads ?? [];
    lastError = readErrorMessage(data, lastError);
    if (attempt === 1) await new Promise((r) => setTimeout(r, 400));
  }

  throw new Error(lastError);
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
  const [addLeadOpen, setAddLeadOpen] = useState(false);
  const [creatingLead, setCreatingLead] = useState(false);

  const runningTotal = recomputeLineItems(editItems).subtotal;
  const canEdit = proposal?.status === "draft";
  const busy = generating || saving || approving || creatingLead;


  const loadLeads = useCallback(async (preferSelectId?: string) => {
    setListLoading(true);
    try {
      const next = await fetchLeadsList();
      setLeads(next);
      if (preferSelectId) setSelectedId(preferSelectId);
      else setSelectedId((current) => current ?? next[0]?.id ?? null);
    } catch (err) {
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setListLoading(true);
      try {
        const next = await fetchLeadsList();
        if (cancelled) return;
        setLeads(next);
        setSelectedId((current) => current ?? next[0]?.id ?? null);
      } catch (err) {
        if (!cancelled) {
        }
      } finally {
        if (!cancelled) setListLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    (async () => {
      setDetailLoading(true);
      try {
        let data: {
          lead?: Lead;
          proposal?: Proposal | null;
          error?: string;
          detail?: string;
        } | null = null;
        let ok = false;

        for (let attempt = 1; attempt <= 2; attempt++) {
          if (cancelled) return;
          const result = await apiFetch<{
            lead?: Lead;
            proposal?: Proposal | null;
            error?: string;
            detail?: string;
          }>(`/api/leads/${selectedId}`);
          data = result.data;
          ok = result.res.ok;
          if (ok) break;
          if (attempt === 1) await new Promise((r) => setTimeout(r, 400));
        }

        if (cancelled || !data) return;
        if (!ok) throw new Error(readErrorMessage(data, "Failed to load lead"));
        setLead(data.lead ?? null);
        const applied = applyProposal(data.proposal);
        setProposal(applied.proposal);
        setEditItems(applied.items);
        setEditSummary(applied.summary);
      } catch (err) {
        console.error(err);
      } finally {
        setDetailLoading(false);
      }
    })();
  }, [selectedId]);

  async function generateForLead(leadId: string): Promise<Proposal> {
    const data = await apiFetchOk<{
      proposal?: Proposal;
      error?: string;
      detail?: string;
    }>("/api/generate-proposal", "Generate failed", {
      method: "POST",
      body: JSON.stringify({ leadId }),
    });
    if (!data.proposal) throw new Error("No proposal returned");
    return data.proposal;
  }

  async function handleCreateLead(
    form: NewLeadForm,
    options: { generate: boolean },
  ) {
    setCreatingLead(true);
    try {
      const data = await apiFetchOk<{
        lead?: Lead;
        error?: string;
        detail?: string;
      }>("/api/leads", "Failed to add lead", {
        method: "POST",
        body: JSON.stringify(form),
      });
      const newId = data.lead?.id;
      if (!newId) throw new Error("Lead created but no id returned");

      setAddLeadOpen(false);
      await loadLeads(newId);

      if (options.generate) {
        setGenerating(true);
        const next = await generateForLead(newId);
        const applied = applyProposal(next);
        setProposal(applied.proposal);
        setEditItems(applied.items);
        setEditSummary(applied.summary);
        await loadLeads(newId);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCreatingLead(false);
    }
  }

  async function handleGenerate() {
    if (!selectedId) return;
    setGenerating(true);
    try {
      const next = await generateForLead(selectedId);
      const applied = applyProposal(next);
      setProposal(applied.proposal);
      setEditItems(applied.items);
      setEditSummary(applied.summary);
      await loadLeads(selectedId);
    } catch (err) {
      console.error(err);
    } finally {
      setGenerating(false);
    }
  }

  async function saveEdits(): Promise<boolean> {
    if (!proposal || proposal.status !== "draft") return false;
    setSaving(true);
    try {
      const { items, subtotal } = recomputeLineItems(editItems);
      const data = await apiFetchOk<{
        proposal?: Proposal;
        error?: string;
        detail?: string;
      }>(`/api/proposals/${proposal.id}`, "Save failed", {
        method: "PATCH",
        body: JSON.stringify({
          line_items: items,
          ai_summary: editSummary,
        }),
      });
      const applied = applyProposal(data.proposal);
      setProposal(applied.proposal);
      setEditItems(applied.items.length ? applied.items : items);
      await loadLeads(selectedId ?? undefined);
      return true;
    } catch (err) {
      console.error(err);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove() {
    if (!proposal) return;

    if (proposal.status === "draft") {
      const saved = await saveEdits();
      if (!saved) return;
    }

    setApproving(true);
    try {
      const { res, data } = await apiFetch<{
        proposal?: Proposal;
        error?: string;
        warning?: string;
        detail?: string;
      }>(`/api/proposals/${proposal.id}/approve`, { method: "POST" });
      if (!res.ok) throw new Error(data.error ?? "Approve failed");
      setProposal(data.proposal ?? null);
      await loadLeads(selectedId ?? undefined);
    } catch (err) {
      console.error(err);
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
      if (field === "description") item.description = value;
      else if (field === "quantity") item.quantity = Number(value) || 0;
      else item.unit_price = Number(value) || 0;
      item.line_total = roundMoney(item.quantity * item.unit_price);
      next[index] = item;
      return next;
    });
  }

  return (
    <div className="flex min-h-svh flex-col bg-[#f6f4ef] text-stone-900">
      <AddLeadModal
        open={addLeadOpen}
        submitting={creatingLead || generating}
        onClose={() => setAddLeadOpen(false)}
        onSubmit={handleCreateLead}
      />

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
              Notes in → priced draft → you approve.
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-6 px-6 py-6 lg:grid-cols-[320px_1fr]">
        <section className="rounded-xl border border-stone-200 bg-white shadow-sm">
          <div className="flex items-start justify-between gap-2 border-b border-stone-100 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-stone-800">Leads</h2>
              <p className="text-xs text-stone-500">
                Select a lead or add a new one.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setAddLeadOpen(true)}
            >
              + Add
            </Button>
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            {listLoading ? (
              <p className="px-4 py-8 text-center text-sm text-stone-500">
                Loading leads…
              </p>
            ) : leads.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-stone-500">No leads yet.</p>
                <Button
                  type="button"
                  className="mt-3 bg-[#1f3d2b] text-white hover:bg-[#294f38]"
                  onClick={() => setAddLeadOpen(true)}
                >
                  Add your first lead
                </Button>
              </div>
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
                          {formatUsd(item.proposal_total)}
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
          {detailLoading ? (
            <p className="px-6 py-16 text-center text-sm text-stone-500">
              Loading lead…
            </p>
          ) : !lead ? (
            <p className="px-6 py-16 text-center text-sm text-stone-500">
              Select a lead to begin.
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
                  <StatusBadge status={proposal?.status ?? "no proposal"} />
                  <Button
                    onClick={() => void handleGenerate()}
                    disabled={busy}
                    className="bg-[#1f3d2b] text-white hover:bg-[#294f38]"
                  >
                    {generating ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="size-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        Generating…
                      </span>
                    ) : proposal ? (
                      "Regenerate"
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
                    <h3 className="text-sm font-semibold text-stone-800">
                      Proposal draft
                    </h3>
                    <p className="text-lg font-semibold text-stone-900">
                      {formatUsd(canEdit ? runningTotal : proposal.total)}
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
                            key={`${item.sku ?? item.description}-${index}`}
                            className="border-t border-stone-100"
                          >
                            <td className="px-3 py-2">
                              <input
                                value={item.description}
                                disabled={!canEdit}
                                onChange={(e) =>
                                  updateItem(
                                    index,
                                    "description",
                                    e.target.value,
                                  )
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
                                  updateItem(
                                    index,
                                    "unit_price",
                                    e.target.value,
                                  )
                                }
                                className="w-24 rounded border border-transparent bg-transparent px-1 py-1 focus:border-stone-300 focus:bg-white"
                              />
                            </td>
                            <td className="px-3 py-2 text-right font-medium tabular-nums">
                              {formatUsd(item.line_total)}
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
                        onClick={() => void saveEdits()}
                        disabled={busy}
                      >
                        {saving ? "Saving…" : "Save edits"}
                      </Button>
                    )}
                    <Button
                      onClick={() => void handleApprove()}
                      disabled={busy || proposal.status === "approved"}
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
