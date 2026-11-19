"use client";

import { useLive } from "@/app/_components/LiveProvider";

/** Connection state in text; the dot is decorative. */
export function LiveIndicator({ className }: { className?: string }) {
  const { mode, connecting } = useLive();
  const live = mode === "live";
  const label = live ? "Live" : connecting ? "Connecting" : "Reconnecting";
  return (
    <span
      data-testid="live-indicator"
      data-mode={mode}
      className={`inline-flex items-center gap-1.5 text-xs font-semibold ${live ? "text-accent" : "text-muted"} ${className ?? ""}`}
    >
      <span aria-hidden="true" className={`size-[7px] rounded-full ${live ? "live-dot bg-accent" : "bg-faint"}`} />
      {label}
    </span>
  );
}
