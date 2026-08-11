export type CleanApiResponse = {
  original: string;
  expanded?: string;
  cleaned: string;
  wasExpanded: boolean;
};

export type AlternativeApiResponse = {
  original: string;
  expanded?: string;
  cleaned: string;
  service?: string;
  alternative: string | null;
  isCustomFrontend: boolean;
};

export type StatsApiResponse = {
  linksCleaned: number;
};

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

const inflight = new Map<string, Promise<unknown>>();

const fetchJson = async <T extends JsonValue>(input: RequestInfo, init?: RequestInit): Promise<T> => {
  const response = await fetch(input, init);
  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json") ? await response.json() : null;

  if (!response.ok) {
    const message = typeof payload === "object" && payload && "error" in payload ? String(payload.error) : response.statusText;
    throw new Error(message || "Request failed");
  }

  return payload as T;
};

const withInflight = <T>(key: string, factory: () => Promise<T>): Promise<T> => {
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const promise = factory().finally(() => inflight.delete(key));

  inflight.set(key, promise as Promise<unknown>);
  return promise;
};

export const cleanUrl = async (url: string): Promise<CleanApiResponse> =>
  withInflight(`clean:${url}`, () =>
    fetchJson<CleanApiResponse>("/api/clean", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    })
  );

export const fetchAlternativeFrontend = async (url: string): Promise<AlternativeApiResponse> =>
  withInflight(`alt:${url}`, () =>
    fetchJson<AlternativeApiResponse>("/api/alt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    })
  );

export const fetchStats = async (): Promise<StatsApiResponse> => fetchJson<StatsApiResponse>("/api/stats");
