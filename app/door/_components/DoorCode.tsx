"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getDoorCode } from "@/app/door/actions";
import type { DoorCode as DoorCodeData } from "@/lib/server/checkin";

const RETRY_MS = 10_000;

function spaced(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

/** The rotating code, its QR and a countdown; fetches the next code at each minute boundary. */
export function DoorCode({ roomToken, initial }: { roomToken: string; initial: DoorCodeData }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [stale, setStale] = useState(false);
  const [nextAt, setNextAt] = useState(() => Date.now() + initial.msUntilNext);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    // A short delay past the boundary keeps the server on the new minute.
    const timer = setTimeout(async () => {
      const result = await getDoorCode(roomToken);
      if (cancelled) return;
      if (result.success) {
        const { code, msUntilNext, checkInUrl, qrDataUrl } = result;
        setData({ code, msUntilNext, checkInUrl, qrDataUrl });
        setStale(false);
        setNextAt(Date.now() + msUntilNext);
        router.refresh();
      } else {
        setStale(true);
        setNextAt(Date.now() + RETRY_MS);
      }
    }, Math.max(0, nextAt - Date.now()) + 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [nextAt, roomToken, router]);

  const seconds = Math.max(0, Math.ceil((nextAt - now) / 1000));

  return (
    <div className={`flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-10 ${stale ? "opacity-50" : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- generated data URI, nothing to optimize */}
      <img
        src={data.qrDataUrl}
        alt="QR code that opens this room's check-in page with the current code"
        width={288}
        height={288}
        className="size-64 rounded-xl bg-white p-2 sm:size-72"
      />
      <div className="flex flex-col items-center gap-2 sm:items-start">
        <p className="text-xl font-medium text-muted">Check-in code</p>
        <p
          data-testid="door-code"
          data-code={data.code}
          aria-label={data.code.split("").join(" ")}
          className="font-mono text-7xl font-semibold tracking-widest sm:text-8xl"
        >
          {spaced(data.code)}
        </p>
        <p className="text-xl text-muted">
          {stale ? "Reconnecting..." : `New code in ${seconds} s`}
        </p>
      </div>
    </div>
  );
}
