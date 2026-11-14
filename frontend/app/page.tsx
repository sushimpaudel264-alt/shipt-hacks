"use client";

import { useEffect, useState } from "react";

export default function Home() {
  const [status, setStatus] = useState<"checking" | "ok" | "down">("checking");

  useEffect(() => {
    // Same-origin Next.js route (frontend/app/api/health); returns { ok: true, time }.
    fetch("/api/health", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => setStatus(data.ok === true ? "ok" : "down"))
      .catch(() => setStatus("down"));
  }, []);

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <h1 className="text-2xl font-semibold">
        {status === "checking"
          ? "Backend: checking..."
          : status === "ok"
            ? "Backend: ok"
            : "Backend: not reachable"}
      </h1>
    </main>
  );
}
