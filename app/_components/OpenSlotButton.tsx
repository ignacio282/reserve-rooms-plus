"use client";

import { useBoard } from "@/app/_components/BoardProvider";
import { Icon } from "@/app/_components/Icon";

export function OpenSlotButton({
  roomId,
  start,
  end,
  label,
  accessibleLabel,
  className,
}: {
  roomId: string;
  start: string;
  end: string;
  label: string;
  accessibleLabel: string;
  className?: string;
}) {
  const { openBooking } = useBoard();
  return (
    <button
      type="button"
      aria-label={accessibleLabel}
      onClick={(e) => openBooking({ roomId, start, end }, e.currentTarget)}
      className={`flex items-start gap-2 rounded-lg border border-dashed border-accent/50 bg-accent-soft/60 px-3 py-2 text-left text-sm font-medium text-accent hover:border-accent hover:bg-accent-soft ${className ?? ""}`}
    >
      <Icon name="plus" className="mt-0.5 size-4" />
      <span>{label}</span>
    </button>
  );
}
