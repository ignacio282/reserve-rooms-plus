import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const migrationsDir = path.join(import.meta.dirname, "..", "supabase", "migrations");

async function main() {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL is not set (see .env.example).");

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await sql`create table if not exists app_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )`;

    const applied = new Set((await sql`select name from app_migrations`).map((r) => r.name));
    const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
    const pending = files.filter((f) => !applied.has(f));

    for (const file of pending) {
      const body = await readFile(path.join(migrationsDir, file), "utf8");
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`insert into app_migrations (name) values (${file})`;
      });
      console.log(`Applied ${file}`);
    }
    if (pending.length === 0) console.log("Migrations: nothing to apply");

    const [{ seeded }] = await sql`select seed_today(false) as seeded`;
    console.log(seeded ? "Seeded today and set the library clock to 1:55 PM" : "Today already has bookings; seed skipped");
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(`db:setup failed: ${error.message}`);
  process.exit(1);
});
