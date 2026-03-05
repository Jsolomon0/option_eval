import type {
  EvaluateRequest,
  LegMetrics,
  PayoffPoint,
  StrategyLeg,
  StrategyMetrics
} from "@/types/options";

type Greeks = {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
};

type EvaluatedLeg = {
  leg: StrategyLeg;
  premiumUsed: number;
  greeks: Greeks;
  metrics: LegMetrics;
};

export type EvaluateResult = {
  combinedPremium: number;
  combinedGreeks: Greeks;
  payoffCurve: PayoffPoint[];
  perLeg: LegMetrics[];
  strategyMetrics: StrategyMetrics;
};

const SQRT_2PI = Math.sqrt(2 * Math.PI);

function normalCdf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * absX);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const erf =
    1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX));
  return 0.5 * (1 + sign * erf);
}

function normalPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / SQRT_2PI;
}

function optionIntrinsic(spot: number, strike: number, optionType: "call" | "put"): number {
  if (optionType === "call") {
    return Math.max(spot - strike, 0);
  }
  return Math.max(strike - spot, 0);
}

function timeToMaturityYears(leg: StrategyLeg, fallbackDays = 30): number {
  if (leg.expiry) {
    const expiry = new Date(`${leg.expiry}T00:00:00Z`);
    const ms = expiry.getTime() - Date.now();
    const days = Math.max(ms / 86_400_000, 0.0001);
    return days / 365;
  }
  return Math.max(fallbackDays, 0.0001) / 365;
}

function d1d2(spot: number, strike: number, rate: number, vol: number, t: number): [number, number] {
  const sigmaSqrtT = vol * Math.sqrt(t);
  const d1 = (Math.log(spot / strike) + (rate + 0.5 * vol * vol) * t) / sigmaSqrtT;
  const d2 = d1 - sigmaSqrtT;
  return [d1, d2];
}

function bsPrice(
  spot: number,
  strike: number,
  rate: number,
  vol: number,
  t: number,
  optionType: "call" | "put"
): number {
  const [d1, d2] = d1d2(spot, strike, rate, vol, t);
  if (optionType === "call") {
    return spot * normalCdf(d1) - strike * Math.exp(-rate * t) * normalCdf(d2);
  }
  return strike * Math.exp(-rate * t) * normalCdf(-d2) - spot * normalCdf(-d1);
}

function bsGreeks(
  spot: number,
  strike: number,
  rate: number,
  vol: number,
  t: number,
  optionType: "call" | "put"
): Greeks {
  const [d1, d2] = d1d2(spot, strike, rate, vol, t);
  const pdfD1 = normalPdf(d1);

  const delta =
    optionType === "call" ? normalCdf(d1) : normalCdf(d1) - 1;
  const gamma = pdfD1 / (spot * vol * Math.sqrt(t));
  const thetaCommon = -(spot * pdfD1 * vol) / (2 * Math.sqrt(t));
  const theta =
    optionType === "call"
      ? thetaCommon - rate * strike * Math.exp(-rate * t) * normalCdf(d2)
      : thetaCommon + rate * strike * Math.exp(-rate * t) * normalCdf(-d2);
  const vega = spot * pdfD1 * Math.sqrt(t);
  const rho =
    optionType === "call"
      ? strike * t * Math.exp(-rate * t) * normalCdf(d2)
      : -strike * t * Math.exp(-rate * t) * normalCdf(-d2);

  return { delta, gamma, theta, vega, rho };
}

function addGreeks(a: Greeks, b: Greeks): Greeks {
  return {
    delta: a.delta + b.delta,
    gamma: a.gamma + b.gamma,
    theta: a.theta + b.theta,
    vega: a.vega + b.vega,
    rho: a.rho + b.rho
  };
}

function getLegMaxProfile(
  leg: StrategyLeg,
  premium: number
): Pick<LegMetrics, "maxProfit" | "maxLoss" | "breakeven"> {
  const q = Math.max(1, leg.quantity);
  const totalPremium = premium * 100 * q;

  if (leg.side === "long" && leg.optionType === "call") {
    return {
      maxProfit: "unlimited",
      maxLoss: totalPremium,
      breakeven: leg.strike + premium
    };
  }

  if (leg.side === "short" && leg.optionType === "call") {
    return {
      maxProfit: totalPremium,
      maxLoss: "unlimited",
      breakeven: null
    };
  }

  if (leg.side === "long" && leg.optionType === "put") {
    return {
      maxProfit: Math.max((leg.strike - premium) * 100 * q, 0),
      maxLoss: totalPremium,
      breakeven: leg.strike - premium
    };
  }

  return {
    maxProfit: totalPremium,
    maxLoss: Math.max((leg.strike - premium) * 100 * q, 0),
    breakeven: null
  };
}

function legPnlAtSpot(leg: StrategyLeg, premium: number, spotAtExpiry: number): number {
  const intrinsic = optionIntrinsic(spotAtExpiry, leg.strike, leg.optionType);
  const side = leg.side === "long" ? 1 : -1;
  const q = Math.max(1, leg.quantity);
  return side * (intrinsic - premium) * 100 * q;
}

function toFiniteNumber(value: number | undefined | null): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function evaluateLeg(spot: number, rate: number, leg: StrategyLeg): EvaluatedLeg {
  if (leg.iv === null || leg.iv === undefined) {
    throw new Error(
      `Leg ${leg.id} is missing iv. Add IV manually for this leg before evaluation.`
    );
  }

  const t = timeToMaturityYears(leg);
  const vol = leg.iv;
  const theoretical = bsPrice(spot, leg.strike, rate, vol, t, leg.optionType);
  const greeksRaw = bsGreeks(spot, leg.strike, rate, vol, t, leg.optionType);

  const premiumUsed = leg.premium ?? theoretical;
  const sideMultiplier = leg.side === "long" ? 1 : -1;
  const qty = Math.max(1, leg.quantity);

  const intrinsicNow = optionIntrinsic(spot, leg.strike, leg.optionType);
  const extrinsicNow = Math.max(premiumUsed - intrinsicNow, 0);
  const profile = getLegMaxProfile(leg, premiumUsed);

  const metrics: LegMetrics = {
    legId: leg.id,
    premiumPerOption: premiumUsed,
    premiumDollars: sideMultiplier * premiumUsed * 100 * qty,
    intrinsicNow,
    extrinsicNow,
    breakeven: profile.breakeven,
    maxProfit: profile.maxProfit,
    maxLoss: profile.maxLoss
  };

  return {
    leg,
    premiumUsed,
    greeks: {
      delta: greeksRaw.delta * sideMultiplier * qty,
      gamma: greeksRaw.gamma * sideMultiplier * qty,
      theta: greeksRaw.theta * sideMultiplier * qty,
      vega: greeksRaw.vega * sideMultiplier * qty,
      rho: greeksRaw.rho * sideMultiplier * qty
    },
    metrics
  };
}

function payoffCurve(
  legs: EvaluatedLeg[],
  spot: number
): PayoffPoint[] {
  const minSpot = Math.max(spot * 0.2, 0.01);
  const maxSpot = Math.max(spot * 1.8, minSpot + 1);
  const points = 121;

  return Array.from({ length: points }, (_, idx) => {
    const s = minSpot + (idx / (points - 1)) * (maxSpot - minSpot);
    const pnl = legs.reduce((acc, item) => acc + legPnlAtSpot(item.leg, item.premiumUsed, s), 0);
    return { spot: s, pnl };
  });
}

function strategyMetricsFromCurve(
  curve: PayoffPoint[]
): StrategyMetrics {
  const pnls = curve.map((p) => p.pnl);
  const maxProfitFinite = Math.max(...pnls);
  const maxLossFinite = Math.min(...pnls);

  const n = curve.length;
  const highSlope = curve[n - 1].pnl - curve[n - 2].pnl;
  const highSlope2 = curve[n - 2].pnl - curve[n - 3].pnl;
  const highTrend = (highSlope + highSlope2) / 2;

  const unlimitedProfit = highTrend > 10;
  const unlimitedLoss = highTrend < -10;

  return {
    maxProfit: unlimitedProfit ? "unlimited" : maxProfitFinite,
    maxLoss: unlimitedLoss ? "unlimited" : maxLossFinite
  };
}

export function evaluateStrategy(request: EvaluateRequest): EvaluateResult {
  if (!request.legs.length) {
    throw new Error("At least one leg is required.");
  }

  if (!Number.isFinite(request.spot) || request.spot <= 0) {
    throw new Error("Spot must be a positive number.");
  }

  const rate = toFiniteNumber(request.rate);

  const evaluated = request.legs.map((leg) => evaluateLeg(request.spot, rate, leg));

  const combinedPremium = evaluated.reduce((acc, item) => acc + item.metrics.premiumDollars, 0);
  const combinedGreeks = evaluated.reduce(
    (acc, item) => addGreeks(acc, item.greeks),
    { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 }
  );
  const curve = payoffCurve(evaluated, request.spot);
  const strategyMetrics = strategyMetricsFromCurve(curve);

  return {
    combinedPremium,
    combinedGreeks,
    payoffCurve: curve,
    perLeg: evaluated.map((e) => e.metrics),
    strategyMetrics
  };
}