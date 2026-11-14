"use client";

import { useEffect, useRef } from "react";
import { mount } from "@/lib/codesprout/app";

/**
 * Mounts the Codelingo learning app (lessons, editor, code runners, playground).
 * All data comes from the FastAPI backend at NEXT_PUBLIC_API_URL.
 */
export default function Codelingo() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!rootRef.current) return;
    // mount() returns its own cleanup, which also makes React Strict Mode's double-mount safe.
    return mount(rootRef.current, { apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "" });
  }, []);

  return <div ref={rootRef} className="cs-root" />;
}
