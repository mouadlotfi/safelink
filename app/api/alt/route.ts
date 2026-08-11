import { NextRequest, NextResponse } from "next/server";
import { getAlternativeFrontend } from "@/lib/url-service";
import { OPTIONS_HEADERS, enforceRateLimit, errorResponse, serviceErrorResponse, successResponse, validateUrl } from "@/app/api/_shared";

export const dynamic = "force-dynamic";


export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: OPTIONS_HEADERS
  });
}

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request);
  if (limited) {
    return limited;
  }

  const candidate = request.nextUrl.searchParams.get("url");
  const validated = validateUrl(candidate, "query");
  if (validated instanceof NextResponse) {
    return validated;
  }

  try {
    const payload = await getAlternativeFrontend(validated);
    return successResponse(payload);
  } catch (error) {
    return serviceErrorResponse(error, "Failed to find alternative");
  }
}

export async function POST(request: NextRequest) {
  const limited = enforceRateLimit(request);
  if (limited) {
    return limited;
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON in request body", 400);
  }

  if (!body || typeof body !== "object") {
    return errorResponse("Request body must be a JSON object", 400);
  }

  const { url } = body as { url?: unknown };
  if (typeof url !== "string") {
    return errorResponse("Missing 'url' string in request body", 400);
  }

  const validated = validateUrl(url, "body");
  if (validated instanceof NextResponse) {
    return validated;
  }

  try {
    const payload = await getAlternativeFrontend(validated);
    return successResponse(payload);
  } catch (error) {
    return serviceErrorResponse(error, "Failed to find alternative");
  }
}
