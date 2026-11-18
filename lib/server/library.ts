import "server-only";
import { libraryNow } from "@/lib/clock";
import { supabaseAdmin } from "@/lib/server/supabase";
import type { LibraryRow } from "@/types/domain";

export interface LibraryContext {
  library: LibraryRow;
  now: Date;
  realNow: Date;
}

export async function getLibraryContext(): Promise<LibraryContext> {
  const { data, error } = await supabaseAdmin().from("library").select("*").single<LibraryRow>();
  if (error) throw new Error(`Could not load the library: ${error.message}`);
  const realNowMs = Date.now();
  return { library: data, now: libraryNow(realNowMs, data.clock_offset_seconds), realNow: new Date(realNowMs) };
}

async function seedToday(force: boolean): Promise<boolean> {
  const { data, error } = await supabaseAdmin().rpc("seed_today", { p_force: force });
  if (error) throw new Error(`Could not seed today: ${error.message}`);
  return data as boolean;
}

/** Seeds today and resets the clock to 1:55 PM only when today has no bookings. */
export function ensureTodaySeeded(): Promise<boolean> {
  return seedToday(false);
}

/** Replaces today's bookings with the seed day and resets the clock to 1:55 PM. */
export async function startOver(): Promise<void> {
  await seedToday(true);
}

/** Persists every no-show past its check-in window; returns how many were released. */
export async function releaseOverdue(): Promise<number> {
  const { data, error } = await supabaseAdmin().rpc("release_overdue");
  if (error) throw new Error(`Could not release overdue bookings: ${error.message}`);
  return data as number;
}
