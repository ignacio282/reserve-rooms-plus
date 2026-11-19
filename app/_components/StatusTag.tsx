import { Icon, type IconName } from "@/app/_components/Icon";

export type TagStatus = "booked" | "checked_in" | "completed" | "cancelled";

const TAGS: Record<TagStatus, { label: string; icon: IconName; className: string }> = {
  booked: { label: "Booked - awaiting check-in", icon: "clock", className: "bg-booked-bg text-booked border-booked-edge" },
  checked_in: { label: "Checked in", icon: "check", className: "bg-checked-bg text-checked border-checked-edge" },
  completed: { label: "Completed", icon: "done", className: "bg-completed-bg text-completed border-completed-edge" },
  cancelled: { label: "Cancelled", icon: "x", className: "bg-cancelled-bg text-cancelled border-cancelled-edge" },
};

export type BlockStatus = "booked" | "checked_in" | "completed";

/** Booking block look shared by the All rooms grid and the room agenda: tinted box, status as icon + text. */
export const STATUS_BLOCK: Record<BlockStatus, { box: string; text: string; label: string; icon: IconName }> = {
  booked: { box: "border-booked-edge bg-booked-bg", text: "text-booked", label: "Booked - awaiting check-in", icon: "clock" },
  checked_in: { box: "border-checked-edge bg-checked-bg", text: "text-checked", label: "Checked in", icon: "check" },
  completed: { box: "border-completed-edge bg-completed-bg", text: "text-completed", label: "Completed", icon: "done" },
};

export function StatusTag({ status, detail }: { status: TagStatus; detail?: string }) {
  const tag = TAGS[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${tag.className}`}
    >
      <Icon name={tag.icon} className="size-3.5" />
      {tag.label}
      {detail ? <span className="font-normal">· {detail}</span> : null}
    </span>
  );
}
