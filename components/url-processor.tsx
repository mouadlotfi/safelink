"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { appendHistory } from "@/lib/history";
import { cleanUrl as cleanUrlViaApi, fetchAlternativeFrontend } from "@/lib/api-client";
import { copyText } from "@/lib/clipboard";
import { extractUrls, replaceUrlsInText } from "@/lib/url-extract";
import { STATS_UPDATED_EVENT } from "./links-cleaned-counter";
import { IconArrowUpRight, IconClipboardPaste, IconCopy, IconCheck, IconLoader, IconX } from "./icons";
import { useToast } from "./toast";

const COPY_FEEDBACK_DURATION_MS = 2000;

type InputMode = "urls" | "text";

type AlternativeFrontendMatch = {
  service: string;
  frontendUrl: string;
  isCustomOverride: boolean;
};

type CleanLineResult = {
  original: string;
  cleaned: string;
  altFrontend: string | null;
  service?: string;
  isCustomFrontend?: boolean;
};

type FailedLineResult = {
  original: string;
  error: string;
};

const parseInputUrls = (raw: string): string[] =>
  raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

const getInvalidUrls = (urls: string[]): string[] =>
  urls.filter((url) => {
    try {
      new URL(url);
      return false;
    } catch {
      return true;
    }
  });

const createEntryId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `entry-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const formatInvalidUrlMessage = (invalidUrls: string[], total: number): string => {
  if (invalidUrls.length === total) {
    return "Please enter a valid URL";
  }
  const suffix = invalidUrls.length > 1 ? "s" : "";
  return `Invalid URL${suffix}: ${invalidUrls.join(", ")}`;
};

export function UrlProcessor() {
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<InputMode>("urls");
  const [output, setOutput] = useState("");
  const [results, setResults] = useState<CleanLineResult[]>([]);
  const [failures, setFailures] = useState<FailedLineResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [altFrontend, setAltFrontend] = useState<AlternativeFrontendMatch | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [lastCleanCount, setLastCleanCount] = useState(0);

  const { showToast } = useToast();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const allowFocusAfterCopyRef = useRef(true);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    // On touch devices (pointer: coarse), skip auto-focusing the textarea after
    // copying to prevent the mobile virtual keyboard from popping open.
    const mediaQuery = window.matchMedia("(pointer: coarse)");
    const updateAllowFocus = (matches: boolean) => {
      allowFocusAfterCopyRef.current = !matches;
    };

    updateAllowFocus(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      updateAllowFocus(event.matches);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  const resetResults = useCallback((): void => {
    setOutput("");
    setResults([]);
    setFailures([]);
    setAltFrontend(null);
    setLastCleanCount(0);
  }, []);

  useEffect(() => {
    if (allowFocusAfterCopyRef.current) {
      textareaRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    if (!copiedUrl) {
      return;
    }
    const timeoutId = setTimeout(() => setCopiedUrl(null), COPY_FEEDBACK_DURATION_MS);
    return () => clearTimeout(timeoutId);
  }, [copiedUrl]);


  const handleCopy = useCallback(async (value: string, label = "URL"): Promise<void> => {
    if (!value) {
      return;
    }
    try {
      await copyText(value);
      showToast(`${label} copied to clipboard`, "success");
      setCopiedUrl(value);
    } catch {
      showToast("Failed to copy to clipboard", "error");
      return;
    }
    if (allowFocusAfterCopyRef.current) {
      textareaRef.current?.focus();
    }
  }, [showToast]);

  const pushHistory = useCallback(
    (originalUrl: string, cleanedUrl: string, alternativeUrl: string | null) => {
      try {
        appendHistory({
          id: createEntryId(),
          originalUrl,
          cleanedUrl,
          createdAt: Date.now(),
          alternativeFrontend: alternativeUrl
        });
      } catch {}
    },
    []
  );

  const cleanUrls = useCallback(
    async (urls: string[]): Promise<{ results: CleanLineResult[]; failures: FailedLineResult[] }> => {
      const outcomes = await Promise.all(
        urls.map(async (url) => {
          try {
            const data = await cleanUrlViaApi(url);
            return {
              ok: true as const,
              value: {
                original: url,
                cleaned: data.cleaned,
                altFrontend: null
              }
            };
          } catch (error) {
            return {
              ok: false as const,
              value: { original: url, error: error instanceof Error ? error.message : "Failed to clean URL" }
            };
          }
        })
      );

      const results: CleanLineResult[] = [];
      const failures: FailedLineResult[] = [];
      for (const outcome of outcomes) {
        if (outcome.ok) {
          results.push(outcome.value);
        } else {
          failures.push(outcome.value);
        }
      }
      return { results, failures };
    },
    []
  );

  const clean = useCallback(
    async (raw: string): Promise<void> => {
      const urls = mode === "text" ? extractUrls(raw) : parseInputUrls(raw);

      if (urls.length === 0) {
        showToast(mode === "text" ? "No URLs found in text" : "Please enter a URL", "error");
        resetResults();
        return;
      }

      const invalidUrls = getInvalidUrls(urls);
      if (invalidUrls.length > 0) {
        showToast(formatInvalidUrlMessage(invalidUrls, urls.length), "error");
        resetResults();
        return;
      }

      setLoading(true);
      setAltFrontend(null);
      try {
        const { results: cleanedResults, failures: failedResults } = await cleanUrls(urls);

        let match: AlternativeFrontendMatch | null = null;
        if (urls.length === 1 && cleanedResults.length === 1) {
          try {
            const alt = await fetchAlternativeFrontend(urls[0]);
            if (alt.alternative) {
              match = {
                service: alt.service ?? "unknown",
                frontendUrl: alt.alternative,
                isCustomOverride: alt.isCustomFrontend
              };
              cleanedResults[0].altFrontend = match.frontendUrl;
              cleanedResults[0].service = match.service;
              cleanedResults[0].isCustomFrontend = match.isCustomOverride;
            }
          } catch {
            // Alternative lookup is non-critical; cleaning should still succeed.
          }
        }

        if (mode === "text") {
          const replacements = new Map(
            cleanedResults.map((result) => [result.original, result.cleaned])
          );
          setOutput(replaceUrlsInText(raw, replacements));
        } else {
          setOutput("");
        }

        setResults(cleanedResults);
        setFailures(failedResults);
        setLastCleanCount(cleanedResults.length);

        setInput("");

        setAltFrontend(match);

        cleanedResults.forEach((result) => {
          const alternativeUrl = urls.length === 1 && match ? match.frontendUrl : null;
          pushHistory(result.original, result.cleaned, alternativeUrl);
        });

        if (failedResults.length > 0) {
          const detail = failedResults.map((failure) => `${failure.original}: ${failure.error}`).join("; ");
          showToast(`${failedResults.length} URL${failedResults.length > 1 ? "s" : ""} failed — ${detail}`, "error");
        }

        window.dispatchEvent(new Event(STATS_UPDATED_EVENT));
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Failed to clean URL", "error");
      } finally {
        setLoading(false);
      }
    },
    [cleanUrls, mode, pushHistory, resetResults, showToast]
  );

  const handlePasteClean = useCallback(async (): Promise<void> => {
    if (!navigator.clipboard?.readText) {
      textareaRef.current?.focus();
      showToast("Clipboard not supported. Paste manually to clean automatically.", "info");
      return;
    }

    try {
      const pasted = await navigator.clipboard.readText();
      setInput(pasted);
      await clean(pasted);
    } catch {
      textareaRef.current?.focus();
      showToast("Failed to read from clipboard. Paste manually to clean automatically.", "info");
    }
  }, [clean, showToast]);


  const handleInputChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value);
    resetResults();
  }, [resetResults]);

  const handleInputPaste = useCallback(
    (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const pasted = event.clipboardData.getData("text");
      if (!pasted) {
        return;
      }
      event.preventDefault();

      setInput(pasted);
      resetResults();
      void clean(pasted);
    },
    [resetResults, clean]
  );

  const handleModeChange = useCallback(
    (nextMode: InputMode) => {
      setMode(nextMode);
      resetResults();
    },
    [resetResults]
  );

  const hasResults = results.length > 0 || failures.length > 0;
  const joinedCleaned = results.map((result) => result.cleaned).join("\n");
  const copyTarget = mode === "text" ? output : joinedCleaned;


  return (
    <div className="space-y-6">
      <div className="card p-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <label htmlFor="url-input" className="block text-sm font-medium text-slate-300">
            {mode === "text" ? "Paste text" : "Enter URLs"}
          </label>
          <div className="inline-flex rounded-lg border border-[var(--border)] bg-white/5 p-0.5">
            <button
              type="button"
              onClick={() => handleModeChange("urls")}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                mode === "urls" ? "bg-blue-500/20 text-blue-300" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              URLs
            </button>
            <button
              type="button"
              onClick={() => handleModeChange("text")}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                mode === "text" ? "bg-blue-500/20 text-blue-300" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Text
            </button>
          </div>
        </div>
        <textarea
          id="url-input"
          placeholder={
            mode === "text"
              ? "Paste any text containing links…"
              : "https://example.com/?utm_source=newsletter\nhttps://other.example/?ref=x"
          }
          value={input}
          onChange={handleInputChange}
          onPaste={handleInputPaste}
          ref={textareaRef}
          className="input w-full min-h-[120px] resize-y"
        />

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={handlePasteClean} disabled={loading} className="btn btn-primary">
            {loading ? <IconLoader className="h-4 w-4 animate-spin" /> : <IconClipboardPaste className="h-4 w-4" />}
            Paste & Clean
          </button>
        </div>

      </div>

      {hasResults && (
        <div className="card p-6 animate-slide-up">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm font-medium text-slate-300">
              {mode === "text" ? "Cleaned text" : lastCleanCount > 1 ? `Cleaned URLs (${lastCleanCount})` : "Cleaned URL"}
            </span>
            {copyTarget && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleCopy(copyTarget, mode === "text" ? "Text" : "URLs")}
                  className="btn btn-secondary !px-3 !py-2 text-xs"
                >
                  {copiedUrl === copyTarget && copyTarget ? (
                    <>
                      <IconCheck className="h-3.5 w-3.5" />
                      Copied
                    </>
                  ) : (
                    <>
                      <IconCopy className="h-3.5 w-3.5" />
                      Copy
                    </>
                  )}
                </button>
                {mode === "urls" && lastCleanCount === 1 && results[0] && (
                  <a href={results[0].cleaned} target="_blank" rel="noreferrer" className="btn btn-secondary !px-3 !py-2 text-xs">
                    Open
                    <IconArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            )}
          </div>

          {copyTarget && <div className="code-block">{copyTarget}</div>}

          {failures.length > 0 && (
            <ul className="mt-4 grid min-w-0 gap-2">
              {failures.map((failure) => (
                <li
                  key={failure.original}
                  className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3"
                >
                  <p className="break-all font-mono text-xs text-red-300">{failure.original}</p>
                  <p className="mt-1 text-xs text-red-400/70">{failure.error}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {altFrontend && (
        <div className="card p-6 animate-slide-up">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-slate-300">Alternative Frontend</span>
              <span className="badge">{altFrontend.service}</span>
              {altFrontend.isCustomOverride && (
                <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-400">
                  Custom
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleCopy(altFrontend.frontendUrl, "Alternative URL")}
                className="btn btn-secondary !px-3 !py-2 text-xs"
              >
                {copiedUrl === altFrontend.frontendUrl ? (
                  <>
                    <IconCheck className="h-3.5 w-3.5" />
                    Copied
                  </>
                ) : (
                  <>
                    <IconCopy className="h-3.5 w-3.5" />
                    Copy
                  </>
                )}
              </button>
              <a
                href={altFrontend.frontendUrl}
                target="_blank"
                rel="noreferrer"
                className="btn btn-secondary !px-3 !py-2 text-xs"
              >
                Open
                <IconArrowUpRight className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
          <div className="code-block">{altFrontend.frontendUrl}</div>
        </div>
      )}
    </div>
  );
}
