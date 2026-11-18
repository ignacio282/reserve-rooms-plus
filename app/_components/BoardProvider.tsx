"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { BookingDialog, type BookingRequest } from "@/app/_components/BookingDialog";
import { BookingPanel } from "@/app/_components/BookingPanel";
import type { BookingSummary } from "@/app/_components/booking-summary";
import { MoveDialog } from "@/app/_components/MoveDialog";
import { Toast, type ToastMessage, type ToastTone } from "@/app/_components/Toast";

export interface BoardRoom {
  id: string;
  name: string;
  type: "study" | "meeting" | "community";
  capacity: number;
}

export interface BoardInfo {
  date: string;
  isToday: boolean;
  timeZone: string;
  openISO: string | null;
  closeISO: string | null;
  nowISO: string;
  selectedRoomId: string;
  rooms: BoardRoom[];
}

interface BoardContextValue {
  info: BoardInfo;
  openBooking: (request: BookingRequest, opener: HTMLElement | null) => void;
  openPanel: (booking: BookingSummary, opener: HTMLElement | null) => void;
  openMove: (booking: BookingSummary, opener: HTMLElement | null) => void;
  announce: (message: string, tone?: ToastTone) => void;
}

type Overlay =
  | { kind: "book"; request: BookingRequest }
  | { kind: "panel"; booking: BookingSummary }
  | { kind: "move"; booking: BookingSummary }
  | null;

const BoardContext = createContext<BoardContextValue | null>(null);

export function useBoard(): BoardContextValue {
  const value = useContext(BoardContext);
  if (!value) throw new Error("useBoard must be used inside BoardProvider");
  return value;
}

export function BoardProvider({ info, children }: { info: BoardInfo; children: ReactNode }) {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [session, setSession] = useState(0);
  const openerRef = useRef<HTMLElement | null>(null);

  const show = useCallback((next: Overlay, opener: HTMLElement | null) => {
    // Keep the first opener when one overlay leads to another (panel -> move).
    if (!openerRef.current || !document.contains(openerRef.current) || opener?.closest("dialog") === null) {
      openerRef.current = opener;
    }
    setOverlay(next);
    setSession((s) => s + 1);
  }, []);

  const announce = useCallback(
    (text: string, tone: ToastTone = "success") => setToast((prev) => ({ id: (prev?.id ?? 0) + 1, text, tone })),
    [],
  );
  const dismiss = useCallback(() => setToast(null), []);
  const openBooking = useCallback((request: BookingRequest, opener: HTMLElement | null) => show({ kind: "book", request }, opener), [show]);
  const openPanel = useCallback((booking: BookingSummary, opener: HTMLElement | null) => show({ kind: "panel", booking }, opener), [show]);
  const openMove = useCallback((booking: BookingSummary, opener: HTMLElement | null) => show({ kind: "move", booking }, opener), [show]);

  const close = useCallback((restoreFocus: boolean) => {
    setOverlay(null);
    if (restoreFocus) openerRef.current?.focus();
    openerRef.current = null;
  }, []);

  return (
    <BoardContext.Provider value={{ info, openBooking, openPanel, openMove, announce }}>
      {children}
      <Toast toast={toast} onDismiss={dismiss} />
      {overlay?.kind === "book" ? (
        <BookingDialog key={session} request={overlay.request} onClose={(booked) => close(!booked)} />
      ) : null}
      {overlay?.kind === "panel" ? <BookingPanel key={session} booking={overlay.booking} onClose={() => close(true)} /> : null}
      {overlay?.kind === "move" ? <MoveDialog key={session} booking={overlay.booking} onClose={() => close(true)} /> : null}
    </BoardContext.Provider>
  );
}
