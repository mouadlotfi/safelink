import { NextRequest, NextResponse } from "next/server";
import { createRateLimiter } from "@/lib/rate-limit";

export const MAX_URL_LENGTH = 8192;

const PUBLIC_RATE_LIMIT = 60;
const KEYED_RATE_LIMIT = 600;
const RATE_LIMIT_WINDOW_MS = 60_000;

const apiKeySet = new Set(
  (process.env.API_KEYS ?? "")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean)
);

const publicLimiter = createRateLimiter(PUBLIC_RATE_LIMIT, RATE_LIMIT_WINDOW_MS);
const keyedLimiter = createRateLimiter(KEYED_RATE_LIMIT, RATE_LIMIT_WINDOW_MS);

const rateLimitResponse = (retryAfterSeconds: number): NextResponse =>
  NextResponse.json(
    { error: "Rate limit exceeded" },
    {
      status: 429,
      headers: { ...CORS_HEADERS, "Retry-After": String(retryAfterSeconds) }
    }
  );

export function enforceRateLimit(request: NextRequest): NextResponse | null {
  const apiKey = request.headers.get("x-api-key")?.trim();

  if (apiKey) {
    if (!apiKeySet.has(apiKey)) {
      return errorResponse("Invalid API key", 401);
    }
    const result = keyedLimiter(apiKey);
    return result.allowed ? null : rateLimitResponse(result.retryAfterSeconds);
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const result = publicLimiter(`ip:${ip}`);
  return result.allowed ? null : rateLimitResponse(result.retryAfterSeconds);
}

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*"
};

export const OPTIONS_HEADERS = {
  ...CORS_HEADERS,
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400"
};

export const errorResponse = (message: string, status: number): NextResponse =>
  NextResponse.json({ error: message }, { status, headers: CORS_HEADERS });

export const successResponse = (body: unknown): NextResponse =>
  NextResponse.json(body, {
    headers: {
      ...CORS_HEADERS,
      "Cache-Control": "no-store, no-cache, must-revalidate"
    }
  });

export const serviceErrorResponse = (error: unknown, fallback: string): NextResponse => {
  if (
    error instanceof Error &&
    "status" in error &&
    typeof error.status === "number" &&
    error.status >= 400 &&
    error.status < 600
  ) {
    return errorResponse(error.message, error.status);
  }
  return errorResponse(error instanceof Error ? error.message : fallback, 500);
};

export type UrlSource = "query" | "body";

export const validateUrl = (candidate: string | null, source: UrlSource): string | NextResponse => {
  if (!candidate) {
    const message = source === "query" ? "Missing 'url' query parameter" : "Missing 'url' string in request body";
    return errorResponse(message, 400);
  }

  if (candidate.length > MAX_URL_LENGTH) {
    return errorResponse(`URL exceeds maximum length of ${MAX_URL_LENGTH} characters`, 400);
  }

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return errorResponse("Only HTTP and HTTPS URLs are supported", 400);
    }
  } catch {
    return errorResponse("Invalid URL format", 400);
  }

  return candidate;
};
