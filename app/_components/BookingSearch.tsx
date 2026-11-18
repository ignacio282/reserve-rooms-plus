"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/app/_components/Icon";

export function BookingSearch({ initialQuery, baseHref }: { initialQuery: string; baseHref: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const update = (value: string) => {
    setQuery(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const q = value.trim();
      router.replace(q ? `${baseHref}&q=${encodeURIComponent(q)}` : baseHref, { scroll: false });
    }, 300);
  };

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="booking-search" className="text-sm font-medium">
        Find a booking
      </label>
      <div className="relative w-full max-w-sm">
        <input
          id="booking-search"
          type="search"
          value={query}
          onChange={(e) => update(e.target.value)}
          placeholder="Patron name or card last 4"
          autoComplete="off"
          className="w-full rounded-md border border-line-strong bg-surface py-2 pr-9 pl-3 text-sm"
        />
        {query ? (
          <button
            type="button"
            onClick={() => update("")}
            aria-label="Clear search"
            className="absolute top-1/2 right-1 grid size-7 -translate-y-1/2 place-items-center rounded text-muted hover:bg-surface-2"
          >
            <Icon name="x" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
