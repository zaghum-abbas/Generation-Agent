"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";

export type NewLeadForm = {
  customer_name: string;
  email: string;
  phone: string;
  raw_notes: string;
};

type AddLeadModalProps = {
  open: boolean;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (
    form: NewLeadForm,
    options: { generate: boolean },
  ) => Promise<void>;
};

const EMPTY: NewLeadForm = {
  customer_name: "",
  email: "",
  phone: "",
  raw_notes: "",
};

export function AddLeadModal({
  open,
  submitting,
  onClose,
  onSubmit,
}: AddLeadModalProps) {
  const titleId = useId();
  const [form, setForm] = useState<NewLeadForm>(EMPTY);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(EMPTY);
      setLocalError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, submitting, onClose]);

  if (!open) return null;

  async function handleSubmit(e: FormEvent, generate: boolean) {
    e.preventDefault();
    if (
      !form.customer_name.trim() ||
      !form.email.trim() ||
      !form.raw_notes.trim()
    ) {
      setLocalError("Name, email, and site-walk notes are required.");
      return;
    }
    setLocalError(null);
    await onSubmit(form, { generate });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4"
      role="presentation"
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-stone-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-stone-100 px-5 py-4">
          <h2 id={titleId} className="text-lg font-semibold text-stone-900">
            Add lead
          </h2>
          <p className="mt-1 text-sm text-stone-500">
            Paste site-walk notes, then generate a priced draft.
          </p>
        </div>

        <form
          onSubmit={(e) => void handleSubmit(e, false)}
          className="flex flex-col gap-4 px-5 py-4"
        >
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-stone-600">
              Customer name *
            </span>
            <input
              required
              value={form.customer_name}
              onChange={(e) =>
                setForm((f) => ({ ...f, customer_name: e.target.value }))
              }
              className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-emerald-600"
              placeholder="Jennifer Walsh"
              disabled={submitting}
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-stone-600">
                Email *
              </span>
              <input
                required
                type="email"
                value={form.email}
                onChange={(e) =>
                  setForm((f) => ({ ...f, email: e.target.value }))
                }
                className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-emerald-600"
                placeholder="customer@email.com"
                disabled={submitting}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-stone-600">
                Phone
              </span>
              <input
                value={form.phone}
                onChange={(e) =>
                  setForm((f) => ({ ...f, phone: e.target.value }))
                }
                className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-emerald-600"
                placeholder="512-555-0198"
                disabled={submitting}
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-stone-600">
              Site-walk notes *
            </span>
            <textarea
              required
              rows={8}
              value={form.raw_notes}
              onChange={(e) =>
                setForm((f) => ({ ...f, raw_notes: e.target.value }))
              }
              className="w-full rounded-lg border border-stone-200 px-3 py-2 font-sans text-sm leading-relaxed outline-none focus:border-emerald-600"
              placeholder="Paste messy site-walk notes here…"
              disabled={submitting}
            />
          </label>

          {localError && <p className="text-sm text-red-700">{localError}</p>}

          <div className="flex flex-wrap justify-end gap-2 border-t border-stone-100 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" variant="outline" disabled={submitting}>
              {submitting ? "Saving…" : "Save lead"}
            </Button>
            <Button
              type="button"
              disabled={submitting}
              className="bg-[#1f3d2b] text-white hover:bg-[#294f38]"
              onClick={(e) => void handleSubmit(e, true)}
            >
              {submitting ? "Working…" : "Save & generate"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
