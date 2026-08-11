
export type CleanUrlResult = {
  original: string;
  expanded?: string;
  cleaned: string;
  wasExpanded: boolean;
};

export type AlternativeUrlResult = {
  original: string;
  expanded?: string;
  cleaned: string;
  service?: string;
  alternative: string | null;
  isCustomFrontend: boolean;
};

export type StatsResult = {
  linksCleaned: number;
};

type BackendCleanResponse = {
  original: string;
  expanded?: string | null;
  cleaned: string;
  wasExpanded: boolean;
};

type BackendAltResponse = {
  original: string;
  expanded?: string | null;
  cleaned: string;
  service?: string | null;
  alternative: string | null;
  isCustomFrontend: boolean;
};

type BackendStatsResponse = {
  linksCleaned: number;
};

const BACKEND_BASE_URL = process.env.SAFELINK_BACKEND_URL?.replace(/\/$/, "");

export class BackendRequestError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "BackendRequestError";
  }
}

const fetchBackend = async <T>(path: string, body: { url: string }): Promise<T> => {
  if (!BACKEND_BASE_URL) {
    throw new Error("Missing SAFELINK_BACKEND_URL");
  }

  const response = await fetch(`${BACKEND_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(45_000),
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new BackendRequestError(response.status, response.statusText || "Backend request failed");
  }

  return (await response.json()) as T;
};

const fetchBackendGet = async <T>(path: string): Promise<T> => {
  if (!BACKEND_BASE_URL) {
    throw new Error("Missing SAFELINK_BACKEND_URL");
  }

  const response = await fetch(`${BACKEND_BASE_URL}${path}`, {
    method: "GET",
    cache: "no-store",
    signal: AbortSignal.timeout(45_000)
  });

  if (!response.ok) {
    throw new BackendRequestError(response.status, response.statusText || "Backend request failed");
  }

  return (await response.json()) as T;
};

export async function getCleanedUrl(url: string): Promise<CleanUrlResult> {
  const data = await fetchBackend<BackendCleanResponse>("/api/clean", { url });
  return {
    original: data.original,
    expanded: data.expanded ?? undefined,
    cleaned: data.cleaned,
    wasExpanded: data.wasExpanded
  };
}

export async function getAlternativeFrontend(url: string): Promise<AlternativeUrlResult> {
  const data = await fetchBackend<BackendAltResponse>("/api/alt", { url });
  return {
    original: data.original,
    expanded: data.expanded ?? undefined,
    cleaned: data.cleaned,
    service: data.service ?? undefined,
    alternative: data.alternative,
    isCustomFrontend: data.isCustomFrontend
  };
}

export async function getStats(): Promise<StatsResult> {
  const data = await fetchBackendGet<BackendStatsResponse>("/api/stats");
  return {
    linksCleaned: data.linksCleaned
  };
}
