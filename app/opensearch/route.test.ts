import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as cleanGet } from "./clean.xml/route";
import { GET as altGet } from "./alt.xml/route";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("OpenSearch definitions", () => {
  it("uses the configured public origin instead of the internal request origin", async () => {
    vi.stubEnv("NEXT_PUBLIC_WEBSITE_URL", "https://safelink.mouadlotfi.com/");
    const request = new NextRequest("https://0.0.0.0:3000/opensearch/clean.xml");

    const response = cleanGet(request);
    const xml = await response.text();

    expect(xml).toContain(
      'template="https://safelink.mouadlotfi.com/go/clean?url={searchTerms}"'
    );
    expect(xml).toContain("<SearchForm>https://safelink.mouadlotfi.com</SearchForm>");
    expect(xml).not.toContain("0.0.0.0");
  });

  it("uses the configured public origin for the alternative engine too", async () => {
    vi.stubEnv("NEXT_PUBLIC_WEBSITE_URL", "https://safelink.mouadlotfi.com");
    const request = new NextRequest("https://0.0.0.0:3000/opensearch/alt.xml");

    const response = altGet(request);
    const xml = await response.text();

    expect(xml).toContain(
      'template="https://safelink.mouadlotfi.com/go/alt?url={searchTerms}"'
    );
    expect(xml).not.toContain("0.0.0.0");
  });
});
