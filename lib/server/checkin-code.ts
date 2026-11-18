import "server-only";
import { checkinCode, msUntilNextCode, verifyCheckinCode } from "@/lib/checkin-code";
import { requireEnv } from "@/lib/server/supabase";

/** Codes always run on real time, never the library clock offset. */
export function currentCheckinCode(roomId: string): { code: string; msUntilNext: number } {
  const now = Date.now();
  return { code: checkinCode(requireEnv("CHECKIN_CODE_SECRET"), roomId, now), msUntilNext: msUntilNextCode(now) };
}

export function isValidCheckinCode(roomId: string, input: string): boolean {
  return verifyCheckinCode(requireEnv("CHECKIN_CODE_SECRET"), roomId, input, Date.now());
}
