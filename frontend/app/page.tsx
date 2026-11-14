"use client";

import { useEffect, useState } from "react";

export default function Home() {
  const [status, setStatus] = useState<"checking" | "ok" | "down">("checking");

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/health`)
      .then((res) => res.json())
      .then((data) => setStatus(data.status === "ok" ? "ok" : "down"))
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
