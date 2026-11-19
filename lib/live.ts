/** Shared by the server ping and the browser subscription. */
export const LIVE_CHANNEL = "library-changes";
export const LIVE_EVENT = "changed";

/** Polling while Realtime is connected picks up clock-driven changes (releases, the time line). */
export const LIVE_POLL_MS = 60_000;
/** Polling while Realtime is down or not configured. */
export const FALLBACK_POLL_MS = 10_000;
export const HIGHLIGHT_MS = 2_400;

export type LiveMode = "live" | "fallback";

/** Maps a Realtime channel status to the indicator mode and polling period. */
export function liveMode(status: string | null, hasConfig: boolean): { mode: LiveMode; pollMs: number } {
  return hasConfig && status === "SUBSCRIBED"
    ? { mode: "live", pollMs: LIVE_POLL_MS }
    : { mode: "fallback", pollMs: FALLBACK_POLL_MS };
}

/**
 * Pages that must not refresh live. The patron confirm form keeps what was typed;
 * submitting a taken slot shows free alternatives instead.
 */
export function isLivePaused(pathname: string): boolean {
  return /^\/book\/[^/]+\/confirm\/?$/.test(pathname);
}

/** Keys that are new or whose version changed; removed keys are ignored. An empty `before` means first render. */
export function changedLiveKeys(before: ReadonlyMap<string, string>, after: ReadonlyMap<string, string>): string[] {
  if (before.size === 0) return [];
  const changed: string[] = [];
  for (const [key, version] of after) {
    if (before.get(key) !== version) changed.push(key);
  }
  return changed;
}
