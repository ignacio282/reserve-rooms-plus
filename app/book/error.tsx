"use client";

export default function BookError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col items-start gap-4 px-4 py-10">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p role="alert">We could not load the rooms. Check your connection and try again.</p>
      <button
        type="button"
        onClick={reset}
        className="min-h-12 rounded-lg bg-accent px-5 font-semibold text-accent-ink hover:bg-accent-hover"
      >
        Try again
      </button>
    </main>
  );
}
