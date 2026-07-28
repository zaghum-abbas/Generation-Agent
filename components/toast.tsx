"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";

type ToastProps = {
  message: string;
  variant?: "error" | "success";
  onDismiss: () => void;
};

export function Toast({
  message,
  variant = "error",
  onDismiss,
}: ToastProps) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 7000);
    return () => window.clearTimeout(timer);
  }, [message, onDismiss]);

  return (
    <div
      role="status"
      className={cn(
        "fixed top-4 right-4 z-50 max-w-sm rounded-lg border px-4 py-3 text-sm shadow-lg",
        variant === "error"
          ? "border-red-200 bg-red-50 text-red-900"
          : "border-emerald-200 bg-emerald-50 text-emerald-950",
      )}
    >
      <div className="flex items-start gap-3">
        <p className="flex-1 leading-snug">{message}</p>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-xs font-medium opacity-70 hover:opacity-100"
          aria-label="Dismiss"
        >
          Close
        </button>
      </div>
    </div>
  );
}
