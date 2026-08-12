import { describe, expect, it } from "vitest";
import { extractUrls, replaceUrlsInText } from "./url-extract";

describe("extractUrls", () => {
  it("extracts URLs from plain text", () => {
    expect(extractUrls("Check https://example.com/?utm_source=x and https://other.example/?ref=y please")).toEqual([
      "https://example.com/?utm_source=x",
      "https://other.example/?ref=y"
    ]);
  });

  it("strips trailing sentence punctuation", () => {
    expect(extractUrls("See https://example.com/a, then https://example.com/b.")).toEqual([
      "https://example.com/a",
      "https://example.com/b"
    ]);
  });

  it("does not split URLs that contain query strings with commas", () => {
    expect(extractUrls("https://example.com/?a=1,2")).toEqual(["https://example.com/?a=1,2"]);
  });

  it("returns an empty array when there are no URLs", () => {
    expect(extractUrls("nothing here")).toEqual([]);
  });
});

describe("replaceUrlsInText", () => {
  it("replaces each extracted URL with its cleaned version", () => {
    const replacements = new Map([
      ["https://example.com/?utm_source=x", "https://example.com/"],
      ["https://other.example/?ref=y", "https://other.example/"]
    ]);

    expect(
      replaceUrlsInText("Check https://example.com/?utm_source=x and https://other.example/?ref=y please", replacements)
    ).toBe("Check https://example.com/ and https://other.example/ please");
  });

  it("preserves trailing punctuation after replaced URLs", () => {
    const replacements = new Map([["https://example.com/a", "https://example.com/clean"]]);
    expect(replaceUrlsInText("See https://example.com/a.", replacements)).toBe("See https://example.com/clean.");
  });

  it("keeps the original URL when no replacement exists", () => {
    const replacements = new Map<string, string>();
    expect(replaceUrlsInText("Keep https://example.com/", replacements)).toBe("Keep https://example.com/");
  });

  it("replaces repeated occurrences of the same URL", () => {
    const replacements = new Map([["https://example.com/x", "https://example.com/clean"]]);
    expect(replaceUrlsInText("https://example.com/x and https://example.com/x", replacements)).toBe(
      "https://example.com/clean and https://example.com/clean"
    );
  });
});
