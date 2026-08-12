import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  appendHistory,
  clearHistory,
  findByOriginalUrl,
  readHistory,
  type HistoryEntry,
} from "./history";

const DAY_MS = 24 * 60 * 60 * 1000;

const makeEntry = (overrides: Partial<HistoryEntry> = {}): HistoryEntry => ({
  id: "id-1",
  originalUrl: "https://example.com/?utm_source=newsletter",
  cleanedUrl: "https://example.com/",
  createdAt: Date.now(),
  ...overrides,
});

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("readHistory", () => {
  it("returns an empty list when nothing is stored", () => {
    expect(readHistory()).toEqual([]);
  });

  it("ignores corrupt JSON", () => {
    localStorage.setItem("safelink-history", "{not json");
    expect(readHistory()).toEqual([]);
  });

  it("ignores a stored non-array value", () => {
    localStorage.setItem("safelink-history", JSON.stringify({ url: "nope" }));
    expect(readHistory()).toEqual([]);
  });

  it("filters out entries older than the 30-day expiry", () => {
    localStorage.setItem(
      "safelink-history",
      JSON.stringify([
        makeEntry({ id: "old", createdAt: Date.now() - 31 * DAY_MS }),
        makeEntry({ id: "fresh", createdAt: Date.now() - 1 * DAY_MS }),
      ])
    );

    expect(readHistory().map((entry) => entry.id)).toEqual(["fresh"]);
  });
});

describe("appendHistory", () => {
  it("prepends new entries and reads them back newest-first", () => {
    appendHistory(makeEntry({ id: "first" }));
    appendHistory(makeEntry({ id: "second" }));

    expect(readHistory().map((entry) => entry.id)).toEqual(["second", "first"]);
  });

  it("caps the list at 400 entries", () => {
    for (let i = 0; i < 410; i++) {
      appendHistory(makeEntry({ id: `entry-${i}` }));
    }

    expect(readHistory()).toHaveLength(400);
  });

  it("reduces the list when localStorage quota is exceeded", () => {
    // Inject a controllable storage instead of spying the ambient one: which
    // implementation the test runtime exposes (Node's webstorage accessor,
    // Bun's global, jsdom's) varies by environment.
    const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    const stored: string[] = [];
    const fakeStorage = {
      get length() {
        return 0;
      },
      clear: vi.fn(),
      getItem: vi.fn((key: string) =>
        key === "safelink-history"
          ? (stored.length > 0 ? stored[stored.length - 1] : null)
          : null
      ),
      key: vi.fn(() => null),
      removeItem: vi.fn(),
      setItem: vi.fn((key: string, value: string) => {
        stored.push(value);
      })
    };
    Object.defineProperty(globalThis, "localStorage", {
      value: fakeStorage,
      writable: true,
      configurable: true
    });

    try {
      for (let i = 0; i < 100; i++) {
        appendHistory(makeEntry({ id: `entry-${i}` }));
      }

      // 101st write exceeds the quota → persistHistory halves the list.
      fakeStorage.setItem.mockImplementationOnce(() => {
        const quotaError = new Error("quota");
        quotaError.name = "QuotaExceededError";
        throw quotaError;
      });
      appendHistory(makeEntry({ id: "overflow" }));

      expect(readHistory().length).toBeLessThan(100);
    } finally {
      if (original) {
        Object.defineProperty(globalThis, "localStorage", original);
      } else {
        delete (globalThis as { localStorage?: unknown }).localStorage;
      }
    }
  });
});

describe("clearHistory / findByOriginalUrl", () => {
  it("clears all stored entries", () => {
    appendHistory(makeEntry());
    clearHistory();
    expect(readHistory()).toEqual([]);
  });

  it("finds an entry by its original URL", () => {
    appendHistory(makeEntry({ originalUrl: "https://example.com/tracked" }));
    const found = findByOriginalUrl("https://example.com/tracked");

    expect(found).not.toBeNull();
    expect(found?.cleanedUrl).toBe("https://example.com/");
  });

  it("returns null when no entry matches", () => {
    expect(findByOriginalUrl("https://nope.example")).toBeNull();
  });
});
