import type { MarketDataProvider } from "@/lib/market/provider";
import type { ChainRow, MarketQuote, SymbolLookupItem } from "@/types/options";

const MOCK_SYMBOLS: SymbolLookupItem[] = [
  { symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ", type: "equity" },
  { symbol: "MSFT", name: "Microsoft Corporation", exchange: "NASDAQ", type: "equity" },
  { symbol: "SPY", name: "SPDR S&P 500 ETF Trust", exchange: "ARCA", type: "etf" },
  { symbol: "QQQ", name: "Invesco QQQ Trust", exchange: "NASDAQ", type: "etf" },
  { symbol: "TSLA", name: "Tesla, Inc.", exchange: "NASDAQ", type: "equity" }
];

const MOCK_QUOTES: Record<string, number> = {
  AAPL: 199.42,
  MSFT: 468.11,
  SPY: 515.37,
  QQQ: 443.26,
  TSLA: 237.9
};

function buildExpirations(): string[] {
  const now = new Date();
  const expirations: string[] = [];
  for (let i = 1; i <= 6; i += 1) {
    const next = new Date(now);
    next.setDate(now.getDate() + i * 7);
    expirations.push(next.toISOString().slice(0, 10));
  }
  return expirations;
}

function buildChain(price: number): ChainRow[] {
  const rows: ChainRow[] = [];
  const base = Math.round(price / 5) * 5;

  for (let i = -6; i <= 6; i += 1) {
    const strike = base + i * 5;
    const distance = Math.abs(strike - price);
    const mid = Math.max(0.35, 8 - distance * 0.08);
    const spread = 0.1 + Math.min(0.35, distance * 0.01);

    rows.push({
      strike,
      call: {
        contractId: `${strike}-C`,
        bid: Number((mid - spread / 2).toFixed(2)),
        ask: Number((mid + spread / 2).toFixed(2)),
        mid: Number(mid.toFixed(2)),
        iv: Number((0.18 + distance * 0.0015).toFixed(4)),
        openInterest: 1000 - Math.min(900, Math.round(distance * 4)),
        volume: 500 - Math.min(450, Math.round(distance * 2))
      },
      put: {
        contractId: `${strike}-P`,
        bid: Number((mid - spread / 2).toFixed(2)),
        ask: Number((mid + spread / 2).toFixed(2)),
        mid: Number(mid.toFixed(2)),
        iv: Number((0.19 + distance * 0.0016).toFixed(4)),
        openInterest: 950 - Math.min(850, Math.round(distance * 3)),
        volume: 450 - Math.min(400, Math.round(distance * 2))
      }
    });
  }

  return rows;
}

export class MockProvider implements MarketDataProvider {
  async searchSymbols(query: string): Promise<SymbolLookupItem[]> {
    const normalized = query.trim().toUpperCase();
    if (!normalized) {
      return [];
    }

    return MOCK_SYMBOLS.filter(
      (item) =>
        item.symbol.includes(normalized) || (item.name ?? "").toUpperCase().includes(normalized)
    ).slice(0, 12);
  }

  async getQuote(symbol: string): Promise<MarketQuote> {
    const normalized = symbol.trim().toUpperCase();
    const price = MOCK_QUOTES[normalized] ?? 100;
    const bid = Number((price - 0.05).toFixed(2));
    const ask = Number((price + 0.05).toFixed(2));

    return {
      symbol: normalized,
      bid,
      ask,
      last: price,
      midpoint: Number(((bid + ask) / 2).toFixed(2))
    };
  }

  async getOptionExpirations(_symbol: string): Promise<string[]> {
    return buildExpirations();
  }

  async getOptionChain(symbol: string, _expiry: string): Promise<ChainRow[]> {
    const normalized = symbol.trim().toUpperCase();
    const price = MOCK_QUOTES[normalized] ?? 100;
    return buildChain(price);
  }
}
