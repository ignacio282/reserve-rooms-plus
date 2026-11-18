import "server-only";
import { supabaseAdmin } from "@/lib/server/supabase";
import type { LibraryRow } from "@/types/domain";

export interface LibraryContext {
  library: LibraryRow;
  now: Date;
  realNow: Date;
}

/** Library settings and clock. Time comes from the database so app rules and SQL rules agree. */
export async function getLibraryContext(): Promise<LibraryContext> {
  const db = supabaseAdmin();
  const [libraryResult, nowResult] = await Promise.all([
    db.from("library").select("*").single<LibraryRow>(),
    db.rpc("library_now"),
  ]);
  if (libraryResult.error) throw new Error(`Could not load the library: ${libraryResult.error.message}`);
  if (nowResult.error) throw new Error(`Could not read the library clock: ${nowResult.error.message}`);
  const library = libraryResult.data;
  const now = new Date(nowResult.data as string);
  return { library, now, realNow: new Date(now.getTime() - library.clock_offset_seconds * 1000) };
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
  // A fresh start also lifts any check-in pause from wrong room codes.
  const { error } = await supabaseAdmin().from("checkin_failure").delete().not("id", "is", null);
  if (error) throw new Error(`Could not reset check-in attempts: ${error.message}`);
}

/** Persists every no-show past its check-in window; returns how many were released. */
export async function releaseOverdue(): Promise<number> {
  const { data, error } = await supabaseAdmin().rpc("release_overdue");
  if (error) throw new Error(`Could not release overdue bookings: ${error.message}`);
  return data as number;
}
