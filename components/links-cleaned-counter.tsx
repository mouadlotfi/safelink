"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchStats } from "@/lib/api-client";

export const STATS_UPDATED_EVENT = "safelink:stats-updated";

const numberFormatter = new Intl.NumberFormat("en-US");

export function LinksCleanedCounter() {
  const [linksCleaned, setLinksCleaned] = useState<number | null>(null);

  const refreshStats = useCallback(async () => {
    try {
      const stats = await fetchStats();
      setLinksCleaned(stats.linksCleaned);
    } catch {
      setLinksCleaned((current) => current ?? 0);
    }
  }, []);

  useEffect(() => {
    let active = true;

    const refreshIfActive = async () => {
      try {
        const stats = await fetchStats();
        if (active) {
          setLinksCleaned(stats.linksCleaned);
        }
      } catch {
        if (active) {
          setLinksCleaned((current) => current ?? 0);
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshIfActive();
      }
    };

    void refreshIfActive();
    window.addEventListener(STATS_UPDATED_EVENT, refreshStats);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      active = false;
      window.removeEventListener(STATS_UPDATED_EVENT, refreshStats);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshStats]);

  return (
    <aside
      aria-label="Links cleaned site-wide"
      className="card relative isolate flex w-full items-center gap-3 overflow-hidden p-3 sm:w-[200px] lg:w-[220px] animate-slide-up"
    >
      <div className="absolute right-3 top-3 h-2 w-2 rounded-full bg-blue-500 shadow-[0_0_0_4px_rgba(59,130,246,0.15)] animate-pulse" />
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-500/10">
        <div className="h-6 w-6 rounded-full bg-[radial-gradient(circle_at_35%_30%,rgba(96,165,250,0.45),rgba(30,41,59,0.35)_58%,rgba(15,23,42,0.75))]" />
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Links cleaned</p>
        <p aria-live="polite" className="mt-0.5 text-2xl font-bold leading-none tracking-tight text-white drop-shadow-md">
          {linksCleaned === null ? "..." : numberFormatter.format(linksCleaned)}
        </p>
      </div>
    </aside>
  );
}
