import type { LineItem } from "@/lib/types";

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function toNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") return value;
  return Number(value ?? 0);
}

export function formatUsd(value: number | string | null | undefined): string {
  return toNumber(value).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

export function recomputeLineItems(items: LineItem[]): {
  items: LineItem[];
  subtotal: number;
} {
  const next = items.map((item) => ({
    ...item,
    line_total: roundMoney(item.quantity * item.unit_price),
  }));
  const subtotal = roundMoney(next.reduce((sum, i) => sum + i.line_total, 0));
  return { items: next, subtotal };
}
