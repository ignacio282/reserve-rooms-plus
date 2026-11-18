import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col items-start gap-4 px-4 py-10">
      <h1 className="text-2xl font-semibold">This link is not valid</h1>
      <p>If you scanned a room&apos;s code, scan it again or ask at the front desk.</p>
      <Link href="/book" className="inline-flex min-h-12 items-center rounded-lg bg-accent px-5 font-semibold text-accent-ink">
        See all rooms
      </Link>
    </main>
  );
}
