import { normalizeTradierChain } from "@/lib/market/normalize";
import type { MarketDataProvider } from "@/lib/market/provider";
import type { ChainRow, MarketQuote, SymbolLookupItem } from "@/types/options";

const TRADIER_BASE_URL = "https://sandbox.tradier.com/v1";

type TradierLookupResponse = {
  securities?: {
    security?:
      | {
          symbol?: string;
          description?: string;
          exchange?: string;
        }
      | Array<{
          symbol?: string;
          description?: string;
          exchange?: string;
        }>;
  };
};

type TradierQuoteResponse = {
  quotes?: {
    quote?: {
      symbol?: string;
      bid?: number | string;
      ask?: number | string;
      last?: number | string;
    };
  };
};

type TradierExpirationsResponse = {
  expirations?: {
    date?: string[];
  };
};

type TradierChainResponse = {
  options?: {
    option?: Array<Record<string, unknown>> | Record<string, unknown>;
  };
};

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

async function tradierRequest<T>(path: string, params: Record<string, string>): Promise<T> {
  const token = process.env.TRADIER_SANDBOX_TOKEN;
  if (!token) {
    throw new Error("TRADIER_SANDBOX_TOKEN is not set");
  }

  const url = new URL(`${TRADIER_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json"
    },
    next: { revalidate: 0 }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Tradier request failed (${response.status}): ${body}`);
  }

  return (await response.json()) as T;
}

export class TradierSandboxProvider implements MarketDataProvider {
  async searchSymbols(query: string): Promise<SymbolLookupItem[]> {
    const payload = await tradierRequest<TradierLookupResponse>("/markets/lookup", { query });
    return toArray(payload.securities?.security)
      .filter((s) => Boolean(s.symbol))
      .map((s) => ({
        symbol: s.symbol as string,
        description: s.description,
        exchange: s.exchange
      }));
  }

  async getQuote(symbol: string): Promise<MarketQuote> {
    const payload = await tradierRequest<TradierQuoteResponse>("/markets/quotes", { symbols: symbol });
    const quote = payload.quotes?.quote;

    if (!quote || !quote.symbol) {
      throw new Error(`No quote returned for ${symbol}`);
    }

    const bid = toNumber(quote.bid);
    const ask = toNumber(quote.ask);
    const last = toNumber(quote.last);

    return {
      symbol: quote.symbol,
      bid,
      ask,
      last,
      midpoint: bid !== null && ask !== null ? (bid + ask) / 2 : null
    };
  }

  async getOptionExpirations(symbol: string): Promise<string[]> {
    const payload = await tradierRequest<TradierExpirationsResponse>("/markets/options/expirations", {
      symbol
    });

    return payload.expirations?.date ?? [];
  }

  async getOptionChain(symbol: string, expiry: string): Promise<ChainRow[]> {
    const payload = await tradierRequest<TradierChainResponse>("/markets/options/chains", {
      symbol,
      expiration: expiry
    });

    const contracts = toArray(payload.options?.option) as Array<Record<string, unknown>>;
    return normalizeTradierChain(contracts);
  }
}