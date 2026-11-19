import "server-only";
import { after } from "next/server";
import { LIVE_CHANNEL, LIVE_EVENT } from "@/lib/live";
import { supabaseAdmin } from "@/lib/server/supabase";

/**
 * Broadcasts a "something changed" ping; screens refetch from the server.
 * Never throws: the change is already committed and polling covers a missed ping.
 */
export async function notifyChange(): Promise<void> {
  const db = supabaseAdmin();
  const channel = db.channel(LIVE_CHANNEL);
  try {
    const result = await channel.httpSend(LIVE_EVENT, {});
    if (!result.success) console.error(`Live update ping failed (${result.status}): ${result.error}`);
  } catch (error) {
    console.error("Live update ping failed:", error);
  } finally {
    await db.removeChannel(channel);
  }
}

/** Call on a mutation's success path; the ping is sent after the response. */
export function announceChange(): void {
  after(notifyChange);
}
