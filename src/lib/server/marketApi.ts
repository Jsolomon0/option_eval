import { NextRequest, NextResponse } from "next/server";
import { getCached, setCached } from "@/lib/server/cache";
import { allowRequest } from "@/lib/server/rateLimit";

const RATE_LIMIT_PER_MINUTE = 90;
const RATE_WINDOW_MS = 60_000;

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

export async function withMarketGuards<T>(
  request: NextRequest,
  cacheKey: string,
  ttlMs: number,
  producer: () => Promise<T>
): Promise<NextResponse> {
  const ip = getClientIp(request);
  const routeKey = `${ip}:${request.nextUrl.pathname}`;

  if (!allowRequest(routeKey, RATE_LIMIT_PER_MINUTE, RATE_WINDOW_MS)) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const cached = getCached<T>(cacheKey);
  if (cached !== null) {
    return NextResponse.json(cached);
  }

  try {
    const payload = await producer();
    setCached(cacheKey, payload, ttlMs);
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected error" },
      { status: 502 }
    );
  }
}