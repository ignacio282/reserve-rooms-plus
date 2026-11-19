"use client";

import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { changedLiveKeys, HIGHLIGHT_MS, isLivePaused, LIVE_CHANNEL, LIVE_EVENT, liveMode, type LiveMode } from "@/lib/live";

// Inlined at build time; used only for Realtime.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const HAS_CONFIG = Boolean(SUPABASE_URL && SUPABASE_KEY);

interface LiveState {
  mode: LiveMode;
  /** True until the first subscription result arrives. */
  connecting: boolean;
}

const LiveContext = createContext<LiveState>({ mode: "fallback", connecting: true });

export function useLive(): LiveState {
  return useContext(LiveContext);
}

function readLiveVersions(): Map<string, string> {
  const versions = new Map<string, string>();
  for (const el of document.querySelectorAll<HTMLElement>("[data-live-key]")) {
    versions.set(el.dataset.liveKey!, el.dataset.liveVersion ?? "");
  }
  return versions;
}

function highlight(keys: string[]): void {
  for (const key of keys) {
    for (const el of document.querySelectorAll<HTMLElement>(`[data-live-key="${CSS.escape(key)}"]`)) {
      el.setAttribute("data-live-changed", "");
      setTimeout(() => el.removeAttribute("data-live-changed"), HIGHLIGHT_MS);
    }
  }
}

/** Refetches the current route when anything changes elsewhere, and highlights what changed. */
export function LiveProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const pendingRef = useRef(false);
  const queuedRef = useRef(false);
  const snapshotRef = useRef<Map<string, string> | null>(null);
  const { mode, pollMs } = liveMode(status, HAS_CONFIG);

  const refreshNow = useCallback(() => {
    if (isLivePaused(window.location.pathname)) return;
    if (pendingRef.current) {
      queuedRef.current = true;
      return;
    }
    pendingRef.current = true;
    snapshotRef.current = readLiveVersions();
    startTransition(() => router.refresh());
  }, [router]);

  const refreshRef = useRef(refreshNow);
  useEffect(() => {
    refreshRef.current = refreshNow;
  }, [refreshNow]);

  // The transition ends once the refreshed tree is committed.
  useEffect(() => {
    if (isPending || !pendingRef.current) return;
    pendingRef.current = false;
    const before = snapshotRef.current;
    snapshotRef.current = null;
    if (before) highlight(changedLiveKeys(before, readLiveVersions()));
    if (queuedRef.current) {
      queuedRef.current = false;
      refreshRef.current();
    }
  }, [isPending]);

  useEffect(() => {
    if (!HAS_CONFIG) return;
    const client = createClient(SUPABASE_URL!, SUPABASE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    let connectedBefore = false;
    const channel = client
      .channel(LIVE_CHANNEL)
      .on("broadcast", { event: LIVE_EVENT }, () => refreshRef.current())
      .subscribe((next) => {
        setStatus(next);
        if (next === "SUBSCRIBED") {
          // Catch up on anything missed while disconnected.
          if (connectedBefore) refreshRef.current();
          connectedBefore = true;
        }
      });
    return () => {
      void client.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refreshRef.current();
    }, pollMs);
    return () => clearInterval(timer);
  }, [pollMs]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshRef.current();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  return (
    <LiveContext.Provider value={{ mode, connecting: HAS_CONFIG && status === null }}>{children}</LiveContext.Provider>
  );
}
