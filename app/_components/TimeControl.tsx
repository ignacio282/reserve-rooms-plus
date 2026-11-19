"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { advanceLibraryClock, setLibraryTime, startOverAction, type SimpleResult } from "@/app/actions";
import { useBoard } from "@/app/_components/BoardProvider";
import { ConfirmDialog } from "@/app/_components/ConfirmDialog";
import { Icon } from "@/app/_components/Icon";

const quiet =
  "inline-flex min-h-9 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 text-sm font-medium hover:border-accent disabled:opacity-60";

function SetTimeDialog({
  defaultDate,
  defaultTime,
  onDone,
  onClose,
}: {
  defaultDate: string;
  defaultTime: string;
  onDone: (message: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [state, formAction, pending] = useActionState<SimpleResult | null, FormData>(setLibraryTime, null);
  const handled = useRef<SimpleResult | null>(null);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  useEffect(() => {
    if (state?.success && handled.current !== state) {
      handled.current = state;
      onDone(state.message);
      ref.current?.close();
    }
  }, [state, onDone]);

  const err = (name: string) => (state && !state.success ? state.fieldErrors?.[name] : undefined);
  const generalError = state && !state.success && !state.fieldErrors ? state.error : undefined;

  return (
    <dialog
      ref={ref}
      aria-labelledby="time-title"
      onClose={onClose}
      className="m-auto w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-6 text-ink shadow-pop"
    >
      <form action={formAction} noValidate className="flex flex-col gap-4">
        <h2 id="time-title" className="text-lg font-semibold">
          Set library time
        </h2>
        {generalError ? (
          <p role="alert" className="text-sm font-medium text-now">
            {generalError}
          </p>
        ) : null}
        {(["date", "time"] as const).map((name) => (
          <div key={name}>
            <label htmlFor={`t-${name}`} className="mb-1 block text-sm font-medium">
              {name === "date" ? "Date" : "Time"}
            </label>
            <input
              id={`t-${name}`}
              name={name}
              type={name}
              required
              defaultValue={name === "date" ? defaultDate : defaultTime}
              aria-invalid={err(name) ? true : undefined}
              aria-describedby={err(name) ? `t-${name}-error` : undefined}
              className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm"
            />
            {err(name) ? (
              <p id={`t-${name}-error`} className="mt-1 text-xs font-medium text-now">
                {err(name)}
              </p>
            ) : null}
          </div>
        ))}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => ref.current?.close()}
            className="min-h-10 rounded-md px-4 text-sm font-medium text-muted hover:bg-surface-2"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="min-h-10 rounded-md bg-accent px-4 text-sm font-semibold text-accent-ink hover:bg-accent-hover disabled:opacity-60"
          >
            {pending ? "Saving..." : "Set time"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

export function TimeControl({
  nowLabel,
  nowDate,
  nowTime,
  todayHref,
}: {
  nowLabel: string;
  nowDate: string;
  nowTime: string;
  todayHref: string;
}) {
  const { announce } = useBoard();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<"set" | "reset" | null>(null);

  const afterChange = (message: string) => {
    announce(message);
    router.replace(todayHref);
  };

  const run = (action: () => Promise<SimpleResult>) =>
    startTransition(async () => {
      const result = await action();
      if (result.success) afterChange(result.message);
      else announce(result.error, "error");
      setDialog(null);
    });

  return (
    <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
      <p className="text-sm sm:pb-2">
        <span className="text-muted">Library time </span>
        <span className="font-semibold" data-testid="library-time">
          {nowLabel}
        </span>
      </p>
      {/* Not part of the product: these move the shared library clock for trying the app out. */}
      <div role="group" aria-labelledby="testing-tools-label" className="flex flex-col gap-1">
        <p id="testing-tools-label" className="text-[11px] font-semibold tracking-wide text-muted uppercase">
          Testing tools
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={quiet} disabled={isPending} onClick={() => run(advanceLibraryClock)}>
            <Icon name="forward" />
            +15 min
          </button>
          <button type="button" className={quiet} disabled={isPending} onClick={() => setDialog("set")}>
            <Icon name="clock" />
            Set time
          </button>
          <button type="button" className={quiet} disabled={isPending} onClick={() => setDialog("reset")}>
            <Icon name="reset" />
            Start over
          </button>
        </div>
      </div>
      {dialog === "set" ? (
        <SetTimeDialog
          defaultDate={nowDate}
          defaultTime={nowTime}
          onDone={afterChange}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog === "reset" ? (
        <ConfirmDialog
          title="Start over?"
          body="Reset today's bookings and set the time to 1:55 PM?"
          confirmLabel="Start over"
          pending={isPending}
          onConfirm={() => run(startOverAction)}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </div>
  );
}
