import { afterEach, describe, expect, it, vi } from "vitest";

const BASE = "http://backend.test";

const jsonResponse = (body: unknown, init: Partial<Response> = {}) =>
  new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json" },
  });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("getCleanedUrl", () => {
  it("posts the URL to /api/clean and maps null expanded to undefined", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ original: "u", expanded: null, cleaned: "c", wasExpanded: false })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { getCleanedUrl } = await import("./url-service");

    await expect(getCleanedUrl("u")).resolves.toEqual({
      original: "u",
      expanded: undefined,
      cleaned: "c",
      wasExpanded: false,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/api/clean`,
      expect.objectContaining({ method: "POST", body: JSON.stringify({ url: "u" }) })
    );
  });

  it("throws BackendRequestError on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 502 })));

    const { getCleanedUrl, BackendRequestError } = await import("./url-service");

    await expect(getCleanedUrl("u")).rejects.toBeInstanceOf(BackendRequestError);
    await expect(getCleanedUrl("u")).rejects.toMatchObject({ status: 502 });
  });
});

describe("getAlternativeFrontend", () => {
  it("posts the URL to /api/alt and maps null fields to undefined", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        original: "u",
        expanded: null,
        cleaned: "c",
        service: null,
        alternative: "a",
        isCustomFrontend: true,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { getAlternativeFrontend } = await import("./url-service");

    await expect(getAlternativeFrontend("u")).resolves.toEqual({
      original: "u",
      expanded: undefined,
      cleaned: "c",
      service: undefined,
      alternative: "a",
      isCustomFrontend: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/api/alt`,
      expect.objectContaining({ method: "POST" })
    );
  });
});

describe("getStats", () => {
  it("GETs /api/stats", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ linksCleaned: 7 }));
    vi.stubGlobal("fetch", fetchMock);

    const { getStats } = await import("./url-service");

    await expect(getStats()).resolves.toEqual({ linksCleaned: 7 });
    expect(fetchMock).toHaveBeenCalledWith(`${BASE}/api/stats`, expect.objectContaining({ method: "GET" }));
  });
});

describe("missing backend URL", () => {
  it("throws when SAFELINK_BACKEND_URL is not configured", async () => {
    vi.stubEnv("SAFELINK_BACKEND_URL", "");

    const { getCleanedUrl } = await import("./url-service");

    await expect(getCleanedUrl("u")).rejects.toThrow("Missing SAFELINK_BACKEND_URL");
  });
});
