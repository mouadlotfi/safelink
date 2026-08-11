import { NextResponse } from "next/server";
import { OPTIONS_HEADERS, serviceErrorResponse, successResponse } from "@/app/api/_shared";
import { getStats } from "@/lib/url-service";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: OPTIONS_HEADERS
  });
}

export async function GET() {
  try {
    const payload = await getStats();
    return successResponse(payload);
  } catch (error) {
    return serviceErrorResponse(error, "Failed to load stats");
  }
}
