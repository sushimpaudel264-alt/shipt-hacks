/**
 * Offline fallback served by the service worker when a page was never cached.
 * Backend-owned placeholder: frontend teammate, feel free to restyle (keep the route at /offline).
 */
export const metadata = { title: "Offline · LearnLoop" };

export default function OfflinePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-5xl" aria-hidden>
        📡
      </p>
      <h1 className="text-2xl font-semibold">You&apos;re offline</h1>
      <p className="max-w-md text-zinc-600 dark:text-zinc-400">
        This page isn&apos;t saved on your device yet. Your downloaded courses still work. Your progress is saved and will
        sync when you&apos;re back online.
      </p>
      {/* Plain <a> on purpose: a full navigation lets the service worker serve the cached home page offline. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/" className="rounded-full bg-black px-5 py-2 font-medium text-white dark:bg-white dark:text-black">
        Go to my courses
      </a>
    </main>
  );
}
