import { createHmac, timingSafeEqual } from "node:crypto";

const MINUTE_MS = 60_000;

function codeForMinute(secret: string, roomId: string, minute: number): string {
  const digest = createHmac("sha256", secret).update(`${roomId}:${minute}`, "utf8").digest();
  // RFC 4226 dynamic truncation.
  const offset = digest[digest.length - 1] & 0x0f;
  const value = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(value % 1_000_000).padStart(6, "0");
}

/** The room's 6-digit code for the current real-time minute. Never stored. */
export function checkinCode(secret: string, roomId: string, realNowMs: number): string {
  return codeForMinute(secret, roomId, Math.floor(realNowMs / MINUTE_MS));
}

/** Accepts the current minute's code or the previous minute's (grace). */
export function verifyCheckinCode(secret: string, roomId: string, input: string, realNowMs: number): boolean {
  const candidate = input.replace(/[\s-]/g, "");
  if (!/^\d{6}$/.test(candidate)) return false;
  const minute = Math.floor(realNowMs / MINUTE_MS);
  const given = Buffer.from(candidate);
  let ok = false;
  for (const m of [minute, minute - 1]) {
    if (timingSafeEqual(given, Buffer.from(codeForMinute(secret, roomId, m)))) ok = true;
  }
  return ok;
}

export function msUntilNextCode(realNowMs: number): number {
  return MINUTE_MS - (realNowMs % MINUTE_MS);
}
