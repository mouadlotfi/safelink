"use client";

import { useState } from "react";
import { IconCopy, IconCheck } from "@/components/icons";
import { copyText } from "@/lib/clipboard";

const API_BASE = process.env.NEXT_PUBLIC_WEBSITE_URL || "http://localhost:3000";

export default function ApiDocsPage() {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = async (text: string, id: string) => {
    try {
      await copyText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      return;
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <div className="mb-3 flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-blue-500"></div>
          <span className="text-sm font-medium text-slate-400">Safelink</span>
        </div>
        <h1 className="mb-2 text-4xl font-bold tracking-tight text-white sm:text-5xl">API</h1>
        <p className="text-lg text-slate-400">Use Safelink programmatically</p>
      </header>

      <section className="card p-6">
        <h2 className="text-xl font-semibold text-white">Clean URLs</h2>
        <p className="mt-3 text-sm text-slate-300">Remove tracking parameters from any URL.</p>

        <div className="mt-4 space-y-4">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-200">GET Request</h3>
              <button
                onClick={() => handleCopy(`curl --get --data-urlencode "url=https://example.com/?utm_source=newsletter" "${API_BASE}/api/clean"`, "clean-get")}
                className="text-xs text-slate-400 transition-colors hover:text-white"
              >
                {copiedId === "clean-get" ? <IconCheck className="h-4 w-4" /> : <IconCopy className="h-4 w-4" />}
              </button>
            </div>
            <pre className="code-block overflow-x-auto text-xs">
{`curl --get \
  --data-urlencode "url=https://example.com/?utm_source=newsletter" \
  "${API_BASE}/api/clean"`}
            </pre>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-200">POST Request</h3>
              <button
                onClick={() =>
                  handleCopy(
                    `curl -X POST ${API_BASE}/api/clean -H "Content-Type: application/json" -d '{"url": "https://example.com/?utm_source=newsletter"}'`,
                    "clean-post"
                  )
                }
                className="text-xs text-slate-400 transition-colors hover:text-white"
              >
                {copiedId === "clean-post" ? <IconCheck className="h-4 w-4" /> : <IconCopy className="h-4 w-4" />}
              </button>
            </div>
            <pre className="code-block overflow-x-auto text-xs">
{`curl -X POST ${API_BASE}/api/clean \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/?utm_source=newsletter"}'`}
            </pre>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-200">Response</h3>
            <pre className="code-block overflow-x-auto text-xs">
{`{
  "original": "https://example.com/?utm_source=newsletter",
  "expanded": null,
  "cleaned": "https://example.com/",
  "wasExpanded": false
}`}
            </pre>
          </div>
        </div>
      </section>

      <section className="card p-6">
        <h2 className="text-xl font-semibold text-white">Find Alternative Frontends</h2>
        <p className="mt-3 text-sm text-slate-300">
          Get privacy-friendly alternative frontends for popular services like YouTube, Twitter, and Reddit.
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-200">GET Request</h3>
              <button
                onClick={() => handleCopy(`curl --get --data-urlencode "url=https://www.youtube.com/watch?v=dQw4w9WgXcQ" "${API_BASE}/api/alt"`, "alt-get")}
                className="text-xs text-slate-400 transition-colors hover:text-white"
              >
                {copiedId === "alt-get" ? <IconCheck className="h-4 w-4" /> : <IconCopy className="h-4 w-4" />}
              </button>
            </div>
            <pre className="code-block overflow-x-auto text-xs">
{`curl --get \
  --data-urlencode "url=https://www.youtube.com/watch?v=dQw4w9WgXcQ" \
  "${API_BASE}/api/alt"`}
            </pre>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-200">POST Request</h3>
              <button
                onClick={() =>
                  handleCopy(
                    `curl -X POST ${API_BASE}/api/alt -H "Content-Type: application/json" -d '{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'`,
                    "alt-post"
                  )
                }
                className="text-xs text-slate-400 transition-colors hover:text-white"
              >
                {copiedId === "alt-post" ? <IconCheck className="h-4 w-4" /> : <IconCopy className="h-4 w-4" />}
              </button>
            </div>
            <pre className="code-block overflow-x-auto text-xs">
{`curl -X POST ${API_BASE}/api/alt \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'`}
            </pre>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-200">Response (when found)</h3>
            <pre className="code-block overflow-x-auto text-xs">
{`{
  "original": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "expanded": null,
  "cleaned": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "service": "YouTube",
  "alternative": "https://invidious.example/watch?v=dQw4w9WgXcQ",
  "isCustomFrontend": true
}`}
            </pre>
            <p className="mt-2 text-xs text-slate-400">
              <code className="rounded bg-white/5 px-1.5 py-0.5">isCustomFrontend</code> is <code className="rounded bg-white/5 px-1.5 py-0.5">true</code>
              when the result comes from a custom override rather than the LibRedirect dataset.
            </p>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-200">Response (when not found)</h3>
            <pre className="code-block overflow-x-auto text-xs">
{`{
  "original": "https://example.com",
  "expanded": null,
  "cleaned": "https://example.com",
  "service": null,
  "alternative": null,
  "isCustomFrontend": false
}`}
            </pre>
          </div>
        </div>
      </section>

      <section className="card p-6">
        <h2 className="text-xl font-semibold text-white">JavaScript Example</h2>
        <div className="mt-4 space-y-4">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-200">Clean a URL</h3>
              <button
                onClick={() =>
                  handleCopy(
                    `async function cleanUrl(url) {\n  const response = await fetch(\n    '${API_BASE}/api/clean?url=' + encodeURIComponent(url)\n  );\n  const data = await response.json();\n  return data.cleaned;\n}\n\n// Usage\nconst cleaned = await cleanUrl('https://example.com/?utm_source=test');\nconsole.log(cleaned);`,
                    "js-clean"
                  )
                }
                className="text-xs text-slate-400 transition-colors hover:text-white"
              >
                {copiedId === "js-clean" ? <IconCheck className="h-4 w-4" /> : <IconCopy className="h-4 w-4" />}
              </button>
            </div>
            <pre className="code-block overflow-x-auto text-xs">
{`async function cleanUrl(url) {
  const response = await fetch(
    '${API_BASE}/api/clean?url=' + encodeURIComponent(url)
  );
  const data = await response.json();
  return data.cleaned;
}

// Usage
const cleaned = await cleanUrl('https://example.com/?utm_source=test');
console.log(cleaned);`}
            </pre>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-200">Find alternative frontend</h3>
              <button
                onClick={() =>
                  handleCopy(
                    `async function findAlternative(url) {\n  const response = await fetch('${API_BASE}/api/alt', {\n    method: 'POST',\n    headers: { 'Content-Type': 'application/json' },\n    body: JSON.stringify({ url })\n  });\n  const data = await response.json();\n  return data.alternative;\n}\n\n// Usage\nconst altUrl = await findAlternative('https://youtube.com/watch?v=...');\nif (altUrl) console.log(altUrl);`,
                    "js-alt"
                  )
                }
                className="text-xs text-slate-400 transition-colors hover:text-white"
              >
                {copiedId === "js-alt" ? <IconCheck className="h-4 w-4" /> : <IconCopy className="h-4 w-4" />}
              </button>
            </div>
            <pre className="code-block overflow-x-auto text-xs">
{`async function findAlternative(url) {
  const response = await fetch('${API_BASE}/api/alt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  });
  const data = await response.json();
  return data.alternative;
}

// Usage
const altUrl = await findAlternative('https://youtube.com/watch?v=...');
if (altUrl) console.log(altUrl);`}
            </pre>
          </div>
        </div>
      </section>

      <section className="card border-blue-500/20 bg-blue-500/5 p-6">
        <h2 className="text-lg font-semibold text-blue-400">CORS Enabled</h2>
        <p className="mt-2 text-sm text-slate-300">
          All API endpoints send <code className="rounded bg-white/5 px-1.5 py-0.5">Access-Control-Allow-Origin: *</code>, so you can
          call them directly from any website or application.
        </p>
      </section>

    </div>
  );
}
