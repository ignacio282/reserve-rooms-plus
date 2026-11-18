"use client";

export default function BoardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col items-start gap-3 px-6 py-12">
      <h1 className="text-2xl font-semibold">Rooms</h1>
      <p role="alert" className="text-sm">
        The room schedule could not be loaded. Check the connection and try again.
      </p>
      <button
        type="button"
        onClick={reset}
        className="min-h-10 rounded-md bg-accent px-4 text-sm font-semibold text-accent-ink hover:bg-accent-hover"
      >
        Try again
      </button>
    </main>
  );
}
