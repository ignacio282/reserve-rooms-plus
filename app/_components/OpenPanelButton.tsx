"use client";

import type { ReactNode } from "react";
import { useBoard } from "@/app/_components/BoardProvider";
import type { BookingSummary } from "@/app/_components/booking-summary";

export function OpenPanelButton({
  booking,
  className,
  label,
  children,
}: {
  booking: BookingSummary;
  className?: string;
  label: string;
  children: ReactNode;
}) {
  const { openPanel } = useBoard();
  return (
    <button type="button" aria-label={label} onClick={(e) => openPanel(booking, e.currentTarget)} className={className}>
      {children}
    </button>
  );
}
