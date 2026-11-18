"use client";

import { useEffect, useRef } from "react";

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  pending,
  onConfirm,
  onClose,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  pending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby="confirm-title"
      aria-describedby="confirm-body"
      onClose={onClose}
      className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-6 text-ink shadow-pop"
    >
      <h2 id="confirm-title" className="text-lg font-semibold">
        {title}
      </h2>
      <p id="confirm-body" className="mt-2 text-sm text-muted">
        {body}
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => ref.current?.close()}
          className="min-h-10 rounded-md px-4 text-sm font-medium text-muted hover:bg-surface-2"
        >
          Keep it
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onConfirm}
          className="min-h-10 rounded-md bg-accent px-4 text-sm font-semibold text-accent-ink hover:bg-accent-hover disabled:opacity-60"
        >
          {pending ? "Working..." : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
