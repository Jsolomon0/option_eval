export type OptionType = "call" | "put";
export type LegSide = "long" | "short";
export type IvSource = "market" | "manual" | "unknown";

export type StrategyLeg = {
  id: string;
  symbol?: string;
  contractId?: string | number | null;
  side: LegSide;
  optionType: OptionType;
  strike: number;
  expiry: string;
  quantity: number;
  iv?: number | null;
  ivSource?: IvSource;
  premium?: number | null;
  bid?: number | null;
  ask?: number | null;
  mid?: number | null;
  manualMode?: boolean;
};

export type OptionCell = {
  contractId: string | number | null;
  bid: number | null;
  ask: number | null;
  mid: number | null;
  iv: number | null;
  openInterest: number | null;
  volume: number | null;
};

export type ChainRow = {
  strike: number;
  call: OptionCell | null;
  put: OptionCell | null;
};

export type SymbolLookupItem = {
  symbol: string;
  name?: string;
  exchange?: string;
  type?: string;
};

export type MarketQuote = {
  symbol: string;
  bid: number | null;
  ask: number | null;
  last: number | null;
  midpoint: number | null;
};

export type EvaluateRequest = {
  spot: number;
  rate: number;
  daysToExpiry?: number;
  legs: StrategyLeg[];
};

export type PayoffPoint = {
  spot: number;
  pnl: number;
};

export type LegMetrics = {
  legId: string;
  premiumPerOption: number;
  premiumDollars: number;
  intrinsicNow: number;
  extrinsicNow: number;
  breakeven: number | null;
  maxProfit: number | "unlimited";
  maxLoss: number | "unlimited";
};

export type StrategyMetrics = {
  maxProfit: number | "unlimited";
  maxLoss: number | "unlimited";
};
