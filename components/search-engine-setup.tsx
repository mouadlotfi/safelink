"use client";

import { useState } from "react";
import { copyText } from "@/lib/clipboard";

const engines = [
  { name: "Clean URL", path: "/go/clean?url=%s" },
  { name: "Privacy-friendly alternative", path: "/go/alt?url=%s" }
] as const;

export function SearchEngineSetup() {
  const [copied, setCopied] = useState<string | null>(null);

  const copyTemplate = async (name: string, path: string) => {
    try {
      await copyText(`${window.location.origin}${path}`);
      setCopied(name);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  };

  return (
    <section className="card p-6">
      <h2 className="text-xl font-semibold text-white">Use Safelink from your browser address bar</h2>
      <p className="mt-3 text-sm text-slate-300">
        Safelink publishes OpenSearch definitions for browsers that discover search engines from websites.
        If your browser does not offer automatic discovery, add either URL below as a site-search shortcut.
      </p>

      <div className="mt-4 space-y-3">
        {engines.map((engine) => (
          <div key={engine.name} className="rounded-lg border border-[var(--border)] bg-white/5 p-4">
            <h3 className="text-sm font-semibold text-slate-100">{engine.name}</h3>
            <code className="mt-2 block [overflow-wrap:anywhere] text-xs text-slate-300">
              https://safelink.mouadlotfi.com{engine.path}
            </code>
            <button
              type="button"
              onClick={() => void copyTemplate(engine.name, engine.path)}
              className="mt-3 rounded-md border border-[var(--border)] px-3 py-1.5 text-xs text-slate-200 transition-colors hover:bg-white/10"
            >
              {copied === engine.name ? "Copied" : "Copy URL"}
            </button>
          </div>
        ))}
      </div>

      <ol className="mt-5 list-decimal space-y-2 pl-5 text-sm text-slate-300">
        <li>
          In Chrome or another Chromium browser, open <strong>Settings → Search engine → Manage search engines and site search</strong>, then add a site search. In Edge, open <strong>Settings → Privacy, search, and services → Address bar and search</strong>.
        </li>
        <li>Paste one URL above, choose a shortcut such as <code>clean</code> or <code>alt</code>, and save.</li>
        <li>Type the shortcut, press Space or Tab, enter an HTTP(S) URL, then press Enter.</li>
      </ol>
      <p className="mt-4 text-xs text-slate-400">
        Copy URL uses this site’s address, including for self-hosted deployments. In Firefox, use the search-engine discovery option in the address bar when available, or add the URL as a custom search engine. The alternative shortcut opens the cleaned URL if no alternative frontend is found.
      </p>
    </section>
  );
}
