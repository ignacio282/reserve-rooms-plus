"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { CheckinField, ROOM_CODE_INPUT } from "@/app/_components/CheckinField";
import { checkInAtRoom, walkIn, type RoomResult } from "@/app/r/actions";

type Values = Record<"code" | "identifier" | "patronName" | "cardLast4" | "partySize", string>;
const FIELD_ORDER: (keyof Values)[] = ["code", "identifier", "patronName", "cardLast4", "partySize"];

const BUTTON = "min-h-14 rounded-xl px-5 text-lg font-semibold disabled:opacity-60";

/** Check-in and walk-in forms for one room, with one announced result region. */
export function RoomCheckIn({
  roomToken,
  initialCode,
  walkInUntil,
  capacity,
}: {
  roomToken: string;
  initialCode: string;
  walkInUntil: string | null;
  capacity: number;
}) {
  const [checkState, checkAction, checking] = useActionState<RoomResult, FormData>(checkInAtRoom, null);
  const [walkState, walkAction, walking] = useActionState<RoomResult, FormData>(walkIn, null);
  const [values, setValues] = useState<Values>({ code: initialCode, identifier: "", patronName: "", cardLast4: "", partySize: "1" });
  const [edited, setEdited] = useState<Set<string>>(new Set());
  const [last, setLast] = useState<"check" | "walk" | null>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const handled = useRef<RoomResult>(null);

  const state = last === "walk" ? walkState : last === "check" ? checkState : null;

  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    const prefix = last === "walk" ? "w" : "c";
    if (!state.success && state.kind === "invalid") {
      const first = FIELD_ORDER.find((f) => state.fieldErrors[f]);
      rootRef.current?.querySelector<HTMLElement>(`#${prefix}-${first}`)?.focus();
    } else if (!state.success && state.kind === "wrong_code") {
      // A prefilled code may have expired: select it so typing the new one replaces it.
      const input = rootRef.current?.querySelector<HTMLInputElement>(`#${prefix}-code`);
      input?.focus();
      input?.select();
    } else {
      statusRef.current?.focus();
    }
  }, [state, last]);

  const change = (name: keyof Values, value: string) => {
    setValues((v) => ({ ...v, [name]: value }));
    setEdited((e) => new Set(e).add(name));
  };
  const submitted = (which: "check" | "walk") => () => {
    setLast(which);
    setEdited(new Set());
  };
  const errorFor = (form: "check" | "walk", name: keyof Values): string | undefined => {
    if (last !== form || !state || state.success || edited.has(name)) return undefined;
    if (state.kind === "invalid") return state.fieldErrors[name];
    if (state.kind === "wrong_code" && name === "code") return state.error;
    return undefined;
  };
  const field = (form: "check" | "walk", name: keyof Values, label: string, extra: Record<string, unknown> = {}) => (
    <CheckinField
      id={`${form === "walk" ? "w" : "c"}-${name}`}
      name={name}
      label={label}
      value={values[name]}
      onChange={(e) => change(name, e.target.value)}
      error={errorFor(form, name)}
      {...extra}
    />
  );

  const done = state?.success ? state : null;
  const notice = state && !state.success && state.kind !== "invalid" && state.kind !== "wrong_code" ? state : null;
  const codeField = (form: "check" | "walk") =>
    field(form, "code", "Room code", {
      ...ROOM_CODE_INPUT,
      hint: "The 6-digit code on the room's door display.",
    });

  const checkInForm = (
    <form action={checkAction} onSubmit={submitted("check")} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="roomToken" value={roomToken} />
      {codeField("check")}
      {field("check", "identifier", "Booking code or last 4 digits of your library card", {
        type: "text",
        autoComplete: "off",
        autoCapitalize: "characters",
        maxLength: 6,
        spellCheck: false,
      })}
      <button
        type="submit"
        disabled={checking}
        className={`${BUTTON} ${walkInUntil ? "border border-line-strong bg-surface text-ink hover:border-accent" : "bg-accent text-accent-ink hover:bg-accent-hover"}`}
      >
        {checking ? "Checking in..." : "Check in"}
      </button>
    </form>
  );

  return (
    <div ref={rootRef} className="flex flex-col gap-6">
      <div ref={statusRef} tabIndex={-1} role="status" className="outline-offset-4 empty:hidden">
        {done ? (
          <div className="flex flex-col gap-3 rounded-xl border border-checked-edge bg-checked-bg p-5 text-checked">
            <p className="text-lg font-semibold">{done.message}</p>
            {done.kind === "walk_in" ? (
              <>
                <p className="text-ink">
                  Booking code{" "}
                  <span className="font-mono text-2xl font-semibold tracking-[0.2em]" aria-label={done.bookingCode.split("").join(" ")}>
                    {done.bookingCode}
                  </span>
                </p>
                <Link href={`/book/done/${done.bookingId}`} className="font-semibold text-ink underline underline-offset-4">
                  See your booking
                </Link>
              </>
            ) : null}
          </div>
        ) : notice ? (
          <div className="flex flex-col gap-3 rounded-xl border border-now bg-surface p-5">
            <p className="font-semibold text-now">{notice.error}</p>
            {notice.kind === "taken" ? (
              <>
                <p>{notice.nextFree ? `It is free next at ${notice.nextFree}.` : "It is not free again today."}</p>
                {notice.otherRooms.length > 0 ? (
                  <>
                    <p>These rooms are free now:</p>
                    <ul className="flex flex-col gap-2">
                      {notice.otherRooms.map((r) => (
                        <li key={r.id}>
                          <Link
                            href={`/book/${r.id}`}
                            className="flex min-h-12 items-center rounded-lg border border-line-strong bg-surface px-4 font-medium hover:border-accent"
                          >
                            {r.name} - free until {r.until}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p>No other rooms are free right now. Ask at the front desk.</p>
                )}
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      {done ? null : walkInUntil ? (
        <>
          <section aria-labelledby="walkin-title" className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5">
            <h2 id="walkin-title" className="text-xl font-semibold">
              Use this room now until {walkInUntil}
            </h2>
            <form action={walkAction} onSubmit={submitted("walk")} noValidate className="flex flex-col gap-4">
              <input type="hidden" name="roomToken" value={roomToken} />
              {codeField("walk")}
              {field("walk", "patronName", "Your name", { type: "text", autoComplete: "name", maxLength: 80 })}
              {field("walk", "cardLast4", "Last 4 digits of your library card", {
                type: "text",
                inputMode: "numeric",
                autoComplete: "off",
                maxLength: 4,
              })}
              {field("walk", "partySize", "How many people?", { type: "number", inputMode: "numeric", min: 1, max: capacity })}
              <button type="submit" disabled={walking} className={`${BUTTON} bg-accent text-accent-ink hover:bg-accent-hover`}>
                {walking ? "Booking..." : `Book now until ${walkInUntil}`}
              </button>
            </form>
          </section>
          <section aria-labelledby="have-booking-title" className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5">
            <h2 id="have-booking-title" className="text-lg font-semibold">
              Have a booking? Check in
            </h2>
            {checkInForm}
          </section>
        </>
      ) : (
        <section aria-labelledby="checkin-title" className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5">
          <h2 id="checkin-title" className="text-xl font-semibold">
            Check in
          </h2>
          {checkInForm}
        </section>
      )}
    </div>
  );
}
