import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit, serviceErrorResponse, validateUrl } from "@/app/api/_shared";
import { getCleanedUrl } from "@/lib/url-service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request);
  if (limited) return limited;

  const validated = validateUrl(request.nextUrl.searchParams.get("url"), "query");
  if (validated instanceof NextResponse) return validated;

  try {
    const result = await getCleanedUrl(validated);
    return redirectTo(result.cleaned);
  } catch (error) {
    return serviceErrorResponse(error, "Failed to clean URL");
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
