"use client";

import { useEffect } from "react";
import { Icon } from "@/app/_components/Icon";

export type ToastTone = "success" | "error";

export interface ToastMessage {
  id: number;
  text: string;
  tone: ToastTone;
}

const DISMISS_MS = 5000;

/** Always-mounted live region; the visible toast sits inside it so screen readers hear each message once. */
export function Toast({ toast, onDismiss }: { toast: ToastMessage | null; onDismiss: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(onDismiss, DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  const error = toast?.tone === "error";

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[max(1.5rem,env(safe-area-inset-bottom))] z-50 flex justify-center px-4"
    >
      {toast ? (
        <div
          key={toast.id}
          className={`pointer-events-auto flex max-w-lg items-center gap-3 rounded-lg border px-4 py-3 text-sm font-medium text-ink shadow-pop motion-safe:animate-[toast-in_160ms_ease-out] ${
            error ? "border-now bg-surface" : "border-accent bg-surface"
          }`}
        >
          <span
            aria-hidden="true"
            className={`grid size-6 shrink-0 place-items-center rounded-full text-white ${error ? "bg-now" : "bg-accent"}`}
          >
            <Icon name={error ? "x" : "check"} className="size-3.5" />
          </span>
          <span>
            <span className="sr-only">{error ? "Error: " : ""}</span>
            {toast.text}
          </span>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss message"
            className="-mr-1 grid size-7 shrink-0 place-items-center rounded text-muted hover:bg-surface-2"
          >
            <Icon name="x" className="size-3.5" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
