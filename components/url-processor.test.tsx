import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cleanUrl: vi.fn(),
  fetchAlternativeFrontend: vi.fn(),
  copyText: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
  cleanUrl: mocks.cleanUrl,
  fetchAlternativeFrontend: mocks.fetchAlternativeFrontend,
  fetchStats: vi.fn(),
}));

vi.mock("@/lib/clipboard", () => ({
  copyText: mocks.copyText,
}));


vi.mock("@/components/toast", () => ({
  useToast: () => ({ showToast: mocks.showToast }),
}));

vi.mock("@/components/links-cleaned-counter", () => ({
  STATS_UPDATED_EVENT: "safelink:stats-updated",
}));

import { UrlProcessor } from "./url-processor";

const CLEANED = "https://example.com/";
const TRACKED = "https://example.com/?utm_source=newsletter";

const pasteInto = (textarea: HTMLElement, text: string) =>
  fireEvent.paste(textarea, {
    clipboardData: { getData: () => text },
  });

beforeEach(() => {
  mocks.cleanUrl.mockReset();
  mocks.fetchAlternativeFrontend.mockReset();
  mocks.copyText.mockReset();
  mocks.showToast.mockReset();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("UrlProcessor", () => {
  it("cleans a single pasted URL, shows the result and alternative frontend", async () => {
    mocks.cleanUrl.mockResolvedValue({
      original: TRACKED,
      cleaned: CLEANED,
      wasExpanded: false,
    });
    mocks.fetchAlternativeFrontend.mockResolvedValue({
      original: TRACKED,
      cleaned: CLEANED,
      service: "Example",
      alternative: "https://alt.example/",
      isCustomFrontend: true,
    });

    render(<UrlProcessor />);
    pasteInto(screen.getByLabelText("Enter URLs"), TRACKED);

    expect(await screen.findByText(CLEANED)).toBeInTheDocument();
    expect(screen.getByText("Alternative Frontend")).toBeInTheDocument();
    expect(screen.getByText("Example")).toBeInTheDocument();
    expect(screen.getByText("Custom")).toBeInTheDocument();
    expect(mocks.fetchAlternativeFrontend).toHaveBeenCalledWith(TRACKED);
    expect(screen.getByLabelText<HTMLTextAreaElement>("Enter URLs").value).toBe("");
  });

  it("cleans multiple pasted URLs line by line without an alternative card", async () => {
    mocks.cleanUrl.mockImplementation(async (url: string) => ({
      original: url,
      cleaned: url.replace(/\?.*$/, ""),
      wasExpanded: false,
    }));

    render(<UrlProcessor />);
    pasteInto(screen.getByLabelText("Enter URLs"), `${TRACKED}\nhttps://other.example/?ref=x`);

    expect(
      await screen.findByText("https://example.com/ https://other.example/")
    ).toBeInTheDocument();
    expect(screen.getByText("Cleaned URLs (2)")).toBeInTheDocument();
    expect(screen.queryByText("Alternative Frontend")).not.toBeInTheDocument();
    expect(mocks.fetchAlternativeFrontend).not.toHaveBeenCalled();
  });

  it("still cleans when the alternative-frontend lookup fails", async () => {
    mocks.cleanUrl.mockResolvedValue({ original: TRACKED, cleaned: CLEANED, wasExpanded: false });
    mocks.fetchAlternativeFrontend.mockRejectedValue(new Error("backend down"));

    render(<UrlProcessor />);
    pasteInto(screen.getByLabelText("Enter URLs"), TRACKED);

    expect(await screen.findByText(CLEANED)).toBeInTheDocument();
    expect(screen.queryByText("Alternative Frontend")).not.toBeInTheDocument();
  });

  it("shows a toast and no output for an invalid URL", async () => {
    render(<UrlProcessor />);
    pasteInto(screen.getByLabelText("Enter URLs"), "not a url");

    await waitFor(() =>
      expect(mocks.showToast).toHaveBeenCalledWith("Please enter a valid URL", "error")
    );
    expect(screen.queryByText("Cleaned URL")).not.toBeInTheDocument();
    expect(mocks.cleanUrl).not.toHaveBeenCalled();
  });

  it("shows a toast for an empty paste", async () => {
    render(<UrlProcessor />);
    pasteInto(screen.getByLabelText("Enter URLs"), "  \n ");

    await waitFor(() =>
      expect(mocks.showToast).toHaveBeenCalledWith("Please enter a URL", "error")
    );
    expect(mocks.cleanUrl).not.toHaveBeenCalled();
  });

  it("writes cleaned results to history and dispatches the stats event", async () => {
    const statsListener = vi.fn();
    window.addEventListener("safelink:stats-updated", statsListener);

    mocks.cleanUrl.mockResolvedValue({ original: TRACKED, cleaned: CLEANED, wasExpanded: false });
    mocks.fetchAlternativeFrontend.mockResolvedValue({
      original: TRACKED,
      cleaned: CLEANED,
      service: "Example",
      alternative: null,
      isCustomFrontend: false,
    });

    render(<UrlProcessor />);
    pasteInto(screen.getByLabelText("Enter URLs"), TRACKED);

    await screen.findByText(CLEANED);

    expect(statsListener).toHaveBeenCalledTimes(1);
    const history = JSON.parse(localStorage.getItem("safelink-history") ?? "[]");
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      originalUrl: TRACKED,
      cleanedUrl: CLEANED,
      alternativeFrontend: null,
    });
  });

  it("keeps cleaning the remaining URLs when one fails", async () => {
    mocks.cleanUrl.mockImplementation(async (url: string) => {
      if (url.includes("bad")) {
        throw new Error("backend down");
      }
      return { original: url, cleaned: url.replace(/\?.*$/, ""), wasExpanded: false };
    });

    render(<UrlProcessor />);
    pasteInto(screen.getByLabelText("Enter URLs"), `https://bad.example/?x=1
https://good.example/?utm_source=y`);

    expect(await screen.findByText("https://good.example/")).toBeInTheDocument();
    expect(screen.getByText("backend down")).toBeInTheDocument();
    expect(mocks.showToast).toHaveBeenCalledWith(expect.stringContaining("1 URL failed"), "error");
  });

  it("cleans URLs inside pasted text and rewrites it", async () => {
    mocks.cleanUrl.mockImplementation(async (url: string) => ({
      original: url,
      cleaned: url.replace(/\?.*$/, ""),
      wasExpanded: false,
    }));

    render(<UrlProcessor />);
    fireEvent.click(screen.getByRole("button", { name: "Text" }));
    pasteInto(
      screen.getByLabelText("Paste text"),
      "Check https://example.com/?utm_source=x and https://other.example/?ref=y please"
    );

    expect(
      await screen.findByText("Check https://example.com/ and https://other.example/ please")
    ).toBeInTheDocument();
  });

  it("suggests cleaning a URL found in the clipboard", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { readText: vi.fn().mockResolvedValue(TRACKED) },
      configurable: true,
    });
    mocks.cleanUrl.mockResolvedValue({ original: TRACKED, cleaned: CLEANED, wasExpanded: false });
    mocks.fetchAlternativeFrontend.mockRejectedValue(new Error("down"));

    render(<UrlProcessor />);

    expect(await screen.findByText(/Copied URL detected/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clean it" }));

    expect(await screen.findByText(CLEANED)).toBeInTheDocument();
    delete (navigator as { clipboard?: unknown }).clipboard;
  });

  it("copies the cleaned URL to the clipboard", async () => {
    mocks.copyText.mockResolvedValue(undefined);
    mocks.cleanUrl.mockResolvedValue({ original: TRACKED, cleaned: CLEANED, wasExpanded: false });
    mocks.fetchAlternativeFrontend.mockRejectedValue(new Error("down"));

    render(<UrlProcessor />);
    pasteInto(screen.getByLabelText("Enter URLs"), TRACKED);

    const copyButton = await screen.findByRole("button", { name: "Copy" });
    fireEvent.click(copyButton);

    expect(mocks.copyText).toHaveBeenCalledWith(CLEANED);
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
  });
});
