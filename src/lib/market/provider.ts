import type { ChainRow, MarketQuote, SymbolLookupItem } from "@/types/options";

export interface MarketDataProvider {
  searchSymbols(query: string): Promise<SymbolLookupItem[]>;
  getQuote(symbol: string): Promise<MarketQuote>;
  getOptionExpirations(symbol: string): Promise<string[]>;
  getOptionChain(symbol: string, expiry: string): Promise<ChainRow[]>;
}

let providerSingleton: MarketDataProvider | null = null;

export async function getMarketProvider(): Promise<MarketDataProvider> {
  if (providerSingleton) {
    return providerSingleton;
  }

  const providerName = (process.env.MARKET_DATA_PROVIDER ?? "tradier_sandbox").toLowerCase();

  switch (providerName) {
    case "mock": {
      const { MockProvider } = await import("./mockProvider");
      providerSingleton = new MockProvider();
      return providerSingleton;
    }
    case "tradier":
    case "tradier_sandbox": {
      const { TradierSandboxProvider } = await import("./tradierSandboxProvider");
      providerSingleton = new TradierSandboxProvider();
      return providerSingleton;
    }
    default:
      throw new Error(`Unsupported MARKET_DATA_PROVIDER: ${providerName}`);
  }
}
