import { NextRequest } from "next/server";
import { getMarketProvider } from "@/lib/market/provider";
import { withMarketGuards } from "@/lib/server/marketApi";

const TTL_MS = 15_000;

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol")?.trim().toUpperCase() ?? "";
  if (!symbol) {
    return Response.json({ error: "symbol is required" }, { status: 400 });
  }

  return withMarketGuards(request, `quote:${symbol}`, TTL_MS, async () => {
    const provider = await getMarketProvider();
    const quote = await provider.getQuote(symbol);
    return { quote };
  });
}