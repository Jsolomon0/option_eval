import { NextRequest } from "next/server";
import { getMarketProvider } from "@/lib/market/provider";
import { withMarketGuards } from "@/lib/server/marketApi";

const TTL_MS = 20_000;

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) {
    return Response.json({ error: "q is required" }, { status: 400 });
  }

  return withMarketGuards(request, `symbols:${q.toUpperCase()}`, TTL_MS, async () => {
    const provider = await getMarketProvider();
    const items = await provider.searchSymbols(q);
    return items;
  });
}
