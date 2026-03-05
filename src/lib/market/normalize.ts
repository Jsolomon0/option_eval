import type { ChainRow } from "@/types/options";

type TradierContract = {
  symbol?: string;
  option_type?: "call" | "put";
  strike?: number | string;
  bid?: number | string | null;
  ask?: number | string | null;
  open_interest?: number | string | null;
  volume?: number | string | null;
  greeks?: {
    mid_iv?: number | string | null;
    iv?: number | string | null;
  };
  id?: string | number;
};

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function calcMid(bid: number | null, ask: number | null): number | null {
  if (bid === null || ask === null) {
    return null;
  }
  return (bid + ask) / 2;
}

export function normalizeTradierChain(contracts: TradierContract[]): ChainRow[] {
  const byStrike = new Map<number, ChainRow>();

  for (const contract of contracts) {
    const strike = toNumber(contract.strike);
    if (strike === null) {
      continue;
    }

    if (!byStrike.has(strike)) {
      byStrike.set(strike, { strike, call: null, put: null });
    }

    const bid = toNumber(contract.bid);
    const ask = toNumber(contract.ask);
    const iv = toNumber(contract.greeks?.mid_iv ?? contract.greeks?.iv);
    const cell = {
      contractId: contract.id ?? contract.symbol ?? null,
      bid,
      ask,
      mid: calcMid(bid, ask),
      iv,
      openInterest: toNumber(contract.open_interest),
      volume: toNumber(contract.volume)
    };

    if (contract.option_type === "call") {
      byStrike.get(strike)!.call = cell;
    }

    if (contract.option_type === "put") {
      byStrike.get(strike)!.put = cell;
    }
  }

  return Array.from(byStrike.values()).sort((a, b) => a.strike - b.strike);
}