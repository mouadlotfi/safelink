import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCleanedUrl: vi.fn(),
  getAlternativeFrontend: vi.fn()
}));

vi.mock("@/lib/url-service", () => ({
  getCleanedUrl: mocks.getCleanedUrl,
  getAlternativeFrontend: mocks.getAlternativeFrontend
}));

import { GET as cleanGet } from "./clean/route";
import { GET as altGet } from "./alt/route";

const request = (path: string) =>
  new NextRequest(`http://localhost:3000${path}`);

describe("browser URL redirects", () => {
  beforeEach(() => {
    mocks.getCleanedUrl.mockReset();
    mocks.getAlternativeFrontend.mockReset();
  });

  it("redirects clean requests to the cleaned URL without caching or referrer", async () => {
    mocks.getCleanedUrl.mockResolvedValue({ cleaned: "https://example.com/article" });

    const response = await cleanGet(
      request("/go/clean?url=https%3A%2F%2Fexample.com%2Farticle%3Futm_source%3Dmail")
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://example.com/article");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("ignores trailing text after the URL in browser redirect requests", async () => {
    const url = "https://social.example/user/status/1234567890?s=20";
    mocks.getCleanedUrl.mockResolvedValue({ cleaned: url });

    const response = await cleanGet(
      request(`/go/clean?url=${encodeURIComponent(`${url} asdjla`)}`)
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(url);
    expect(mocks.getCleanedUrl).toHaveBeenCalledWith(url);
  });

  it("preserves percent-encoded spaces in browser redirect requests", async () => {
    const url = "https://example.com/search?q=hello%20world";
    mocks.getCleanedUrl.mockResolvedValue({ cleaned: url });

    const response = await cleanGet(
      request(`/go/clean?url=${encodeURIComponent(url)}`)
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(url);
    expect(mocks.getCleanedUrl).toHaveBeenCalledWith(url);
  });

  it("redirects alternative requests to the alternative when available", async () => {
    mocks.getAlternativeFrontend.mockResolvedValue({
      cleaned: "https://youtube.com/watch?v=abc",
      alternative: "https://invidious.example/watch?v=abc"
    });

    const response = await altGet(
      request("/go/alt?url=https%3A%2F%2Fyoutube.com%2Fwatch%3Fv%3Dabc")
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://invidious.example/watch?v=abc");
  });

  it("falls back to the cleaned URL when no alternative is available", async () => {
    mocks.getAlternativeFrontend.mockResolvedValue({
      cleaned: "https://example.com/article",
      alternative: null
    });

    const response = await altGet(request("/go/alt?url=https%3A%2F%2Fexample.com%2Farticle"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://example.com/article");
  });

  it("rejects invalid input before calling the processing service", async () => {
    const response = await cleanGet(request("/go/clean?url=file%3A%2F%2F%2Fetc%2Fpasswd"));

    expect(response.status).toBe(400);
    expect(mocks.getCleanedUrl).not.toHaveBeenCalled();
  });
});
