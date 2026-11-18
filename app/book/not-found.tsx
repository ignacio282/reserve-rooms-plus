import Link from "next/link";

export default function BookNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col items-start gap-4 px-4 py-10">
      <h1 className="text-2xl font-semibold">We could not find that</h1>
      <p>The room or booking may no longer exist.</p>
      <Link href="/book" className="inline-flex min-h-12 items-center rounded-lg bg-accent px-5 font-semibold text-accent-ink">
        See all rooms
      </Link>
    </main>
  );
}
