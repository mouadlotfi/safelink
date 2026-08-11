"use client";

import { useCallback, useMemo, useState } from "react";
import clsx from "clsx";
import { clearHistory, readHistory, type HistoryEntry } from "@/lib/history";
import { IconDownload, IconTrash } from "./icons";
import { useToast } from "./toast";

function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function HistoryView() {
  const { showToast } = useToast();
  const [entries, setEntries] = useState<HistoryEntry[]>(() => {
    if (typeof window === "undefined") return [];
    return readHistory();
  });

  const handleExport = useCallback((): void => {
    if (!entries.length) {
      return;
    }
    const payload = JSON.stringify(entries, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `safelink-history-${new Date().toISOString()}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }, [entries]);

  const handleClear = useCallback((): void => {
    clearHistory();
    setEntries([]);
  }, []);

  const hasEntries = entries.length > 0;

  const topDomains = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of entries) {
      try {
        const domain = new URL(entry.cleanedUrl).hostname.replace(/^www\./, "");
        if (domain) counts.set(domain, (counts.get(domain) ?? 0) + 1);
      } catch {}
    }
    return [...counts.entries()]
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [entries]);

  return (
    <>
      <div className="card grid gap-4 p-6 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <p className="text-sm font-medium text-slate-300">Your cleaning activity</p>
          {topDomains.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {topDomains.map((stat) => (
                <span
                  key={stat.domain}
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-white/5 px-2 py-0.5 text-[0.65rem] font-medium text-slate-300"
                >
                  {stat.domain}
                  <span className="text-slate-500">×{stat.count}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-slate-300">
            URLs you have cleaned on this device are saved locally. Export or clear them at any time.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            disabled={!hasEntries}
            className={clsx("btn btn-secondary", !hasEntries && "pointer-events-none opacity-40")}
          >
            <IconDownload className="h-4 w-4" />
            Export JSON
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={!hasEntries}
            className={clsx(
              "inline-flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:border-red-500/50 hover:bg-red-500/20",
              !hasEntries && "pointer-events-none opacity-40"
            )}
          >
            <IconTrash className="h-4 w-4" />
            Clear History
          </button>
        </div>
      </div>

      <div className="card min-w-0 p-4 sm:p-6">
        {!hasEntries ? (
          <p className="text-sm text-slate-300">
            No entries yet. Clean a URL from the main screen to populate your local history.
          </p>
        ) : (
          <ul className="grid min-w-0 gap-4">
            {entries.map((entry) => {
              const cleanedIsSafe = isSafeUrl(entry.cleanedUrl);
              const altIsSafe = entry.alternativeFrontend ? isSafeUrl(entry.alternativeFrontend) : false;

              return (
                <li
                  key={entry.id}
                  className="min-w-0 rounded-lg border border-[var(--border)] bg-white/5 p-5 transition-colors hover:border-blue-500/30 hover:bg-white/10"
                >
                  <div className="flex flex-col gap-2 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
                    <span>{new Date(entry.createdAt).toLocaleString()}</span>
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[0.65rem] text-slate-500">Stored locally only</span>
                    </span>
                  </div>
                  <div className="mt-3 grid min-w-0 gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-500">Original</p>
                      <p className="mt-1 break-all font-mono text-xs text-slate-200">{entry.originalUrl}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-500">Cleaned</p>
                      <a
                        href={cleanedIsSafe ? entry.cleanedUrl : "#"}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="mt-1 block break-all font-mono text-xs text-blue-400 transition-colors hover:text-blue-300 hover:underline"
                        onClick={(event) => {
                          if (!cleanedIsSafe) {
                            event.preventDefault();
                            showToast("This URL uses an unsafe protocol and cannot be opened", "error");
                          }
                        }}
                      >
                        {entry.cleanedUrl}
                      </a>
                    </div>
                    {entry.alternativeFrontend ? (
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-500">Alternative</p>
                        <a
                          href={altIsSafe ? entry.alternativeFrontend : "#"}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="mt-1 block break-all font-mono text-xs text-blue-400 transition-colors hover:text-blue-300 hover:underline"
                          onClick={(event) => {
                            if (!altIsSafe) {
                              event.preventDefault();
                            showToast("This URL uses an unsafe protocol and cannot be opened", "error");
                            }
                          }}
                        >
                          {entry.alternativeFrontend}
                        </a>
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
