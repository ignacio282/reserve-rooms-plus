"use client";

import { useEffect, useRef, useState } from "react";
import { getRoomCheckinCode } from "@/app/actions";
import { Icon } from "@/app/_components/Icon";

function CodeDialog({ roomId, roomName, onClose }: { roomId: string; roomName: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nextAt, setNextAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  useEffect(() => {
    if (nextAt !== 0 && now < nextAt) return;
    let cancelled = false;
    getRoomCheckinCode(roomId).then((result) => {
      if (cancelled) return;
      if (result.success) {
        setCode(result.code);
        setError(null);
        setNextAt(Date.now() + result.msUntilNext);
      } else {
        setError(result.error);
        setNextAt(Date.now() + 10_000);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [roomId, nextAt, now]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const seconds = Math.max(0, Math.ceil((nextAt - now) / 1000));

  return (
    <dialog
      ref={ref}
      aria-labelledby="code-title"
      onClose={onClose}
      className="m-auto w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-6 text-center text-ink shadow-pop"
    >
      <h2 id="code-title" className="text-lg font-semibold">
        Check-in code for {roomName}
      </h2>
      {error ? (
        <p role="alert" className="mt-4 text-sm font-medium text-now">
          {error}
        </p>
      ) : code ? (
        <>
          <p className="mt-4 font-mono text-5xl font-semibold tracking-widest" aria-label={code.split("").join(" ")}>
            {code.slice(0, 3)} {code.slice(3)}
          </p>
          <p className="mt-3 text-sm text-muted">New code in {seconds} s</p>
        </>
      ) : (
        <p className="mt-4 text-sm text-muted">Getting the code...</p>
      )}
      <button
        type="button"
        onClick={() => ref.current?.close()}
        className="mt-6 min-h-10 rounded-md border border-line-strong px-4 text-sm font-medium hover:border-accent"
      >
        Done
      </button>
    </dialog>
  );
}

export function CheckinCodeButton({ roomId, roomName }: { roomId: string; roomName: string }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-9 items-center gap-2 rounded-md border border-line-strong bg-surface px-3 text-sm font-medium hover:border-accent"
      >
        <Icon name="key" />
        Show check-in code
      </button>
      {open ? (
        <CodeDialog
          roomId={roomId}
          roomName={roomName}
          onClose={() => {
            setOpen(false);
            buttonRef.current?.focus();
          }}
        />
      ) : null}
    </>
  );
}
