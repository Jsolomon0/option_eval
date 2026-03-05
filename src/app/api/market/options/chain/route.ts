import { NextRequest } from "next/server";
import { getMarketProvider } from "@/lib/market/provider";
import { withMarketGuards } from "@/lib/server/marketApi";

const TTL_MS = 30_000;

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol")?.trim().toUpperCase() ?? "";
  const expiry = request.nextUrl.searchParams.get("expiry")?.trim() ?? "";

  if (!symbol || !expiry) {
    return Response.json({ error: "symbol and expiry are required" }, { status: 400 });
  }

  return withMarketGuards(request, `chain:${symbol}:${expiry}`, TTL_MS, async () => {
    const provider = await getMarketProvider();
    const rows = await provider.getOptionChain(symbol, expiry);
    return { rows };
  });
}