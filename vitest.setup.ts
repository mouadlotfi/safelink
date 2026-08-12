import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement matchMedia; UrlProcessor uses it for
// pointer-coarseness detection on mount.
if (typeof window !== "undefined" && !window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// Node 25+ ships a built-in `localStorage` accessor on globalThis that
// returns `undefined` unless the process is started with
// `--localstorage-file`, shadowing jsdom's real storage. Install a working
// in-memory implementation so storage-dependent code (history, ...) can be
// tested without runtime flags.
if (typeof localStorage === "undefined" || localStorage === null) {
  class MemoryStorage {
    private store = new Map<string, string>();

    get length(): number {
      return this.store.size;
    }

    clear(): void {
      this.store.clear();
    }

    getItem(key: string): string | null {
      return this.store.has(key) ? (this.store.get(key) as string) : null;
    }

    key(index: number): string | null {
      return [...this.store.keys()][index] ?? null;
    }

    removeItem(key: string): void {
      this.store.delete(key);
    }

    setItem(key: string, value: string): void {
      this.store.set(String(key), String(value));
    }
  }

  Object.defineProperty(globalThis, "localStorage", {
    value: new MemoryStorage(),
    writable: true,
    configurable: true,
  });
}
