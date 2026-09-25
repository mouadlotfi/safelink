import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit, serviceErrorResponse, validateUrl } from "@/app/api/_shared";
import { extractUrls } from "@/lib/url-extract";
import { getAlternativeFrontend } from "@/lib/url-service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request);
  if (limited) return limited;

  const candidate = request.nextUrl.searchParams.get("url");
  const url = candidate ? extractUrls(candidate)[0] ?? candidate : candidate;
  const validated = validateUrl(url, "query");
  if (validated instanceof NextResponse) return validated;

  try {
    const result = await getAlternativeFrontend(validated);
    return redirectTo(result.alternative ?? result.cleaned);
  } catch (error) {
    return serviceErrorResponse(error, "Failed to find alternative");
  }
}

function redirectTo(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return NextResponse.json({ error: "Only HTTP and HTTPS URLs are supported" }, { status: 502 });
  }

  return NextResponse.redirect(parsed, {
    status: 307,
    headers: {
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer"
    }
  });
}
