"use client";

// Persists cleaned URL history in localStorage with size safeguards.
export type HistoryEntry = {
  id: string;
  originalUrl: string;
  cleanedUrl: string;
  createdAt: number;
  alternativeFrontend?: string | null;
};

const STORAGE_KEY = "safelink-history";
const MAX_HISTORY_ENTRIES = 400;
const HISTORY_STORAGE_LIMIT_BYTES = 4 * 1024 * 1024;
// Privacy: Auto-expire entries older than 30 days
const HISTORY_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

const getWindow = (): Window | undefined => (typeof window === "undefined" ? undefined : window);

const parseEntries = (raw: string | null): HistoryEntry[] => {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as HistoryEntry[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    const now = Date.now();
    return parsed
      .map((entry) => ({
        ...entry,
        createdAt: Number(entry.createdAt)
      }))
      .filter((entry) => now - entry.createdAt < HISTORY_EXPIRY_MS)
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
};

export function readHistory(): HistoryEntry[] {
  const win = getWindow();
  if (!win) {
    return [];
  }
  return parseEntries(win.localStorage.getItem(STORAGE_KEY));
}

const persistHistory = (entries: HistoryEntry[]): void => {
  const win = getWindow();
  if (!win) {
    return;
  }

  try {
    win.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch (error) {
    if (error instanceof Error && error.name === "QuotaExceededError") {
      const reduced = entries.slice(0, Math.floor(entries.length / 2));
      try {
        win.localStorage.setItem(STORAGE_KEY, JSON.stringify(reduced));
      } catch {
        try {
          win.localStorage.removeItem(STORAGE_KEY);
        } catch {
          return;
        }
      }
      return;
    }

  }
};

export function appendHistory(entry: HistoryEntry): void {
  const list = readHistory();
  list.unshift(entry);

  let trimmed = list.slice(0, MAX_HISTORY_ENTRIES);
  let serialized = JSON.stringify(trimmed);

  while (serialized.length > HISTORY_STORAGE_LIMIT_BYTES && trimmed.length > 1) {
    const nextLength = Math.max(1, Math.floor(trimmed.length * 0.9));
    trimmed = trimmed.slice(0, nextLength);
    serialized = JSON.stringify(trimmed);
  }

  persistHistory(trimmed);
}

export function clearHistory(): void {
  const win = getWindow();
  if (!win) {
    return;
  }
  try {
    win.localStorage.removeItem(STORAGE_KEY);
  } catch {
    return;
  }
}

export function findByOriginalUrl(originalUrl: string): HistoryEntry | null {
  const entries = readHistory();
  return entries.find((entry) => entry.originalUrl === originalUrl) ?? null;
}
