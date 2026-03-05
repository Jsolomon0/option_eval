"use client";

import { useEffect, useMemo, useState } from "react";
import { ChainPicker } from "@/components/options/ChainPicker";
import type { ChainRow, StrategyLeg, SymbolLookupItem } from "@/types/options";

const EMPTY_LEG = (): StrategyLeg => ({
  id: crypto.randomUUID(),
  side: "long",
  optionType: "call",
  strike: 100,
  expiry: "",
  quantity: 1,
  iv: null,
  ivSource: "unknown",
  premium: null,
  bid: null,
  ask: null,
  mid: null,
  manualMode: false
});

export function StrategyBuilder() {
  const [tickerQuery, setTickerQuery] = useState("");
  const [tickerResults, setTickerResults] = useState<SymbolLookupItem[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [spot, setSpot] = useState(100);
  const [spotTouched, setSpotTouched] = useState(false);
  const [rate, setRate] = useState(0.03);
  const [expirations, setExpirations] = useState<string[]>([]);
  const [selectedExpiry, setSelectedExpiry] = useState("");
  const [chainRows, setChainRows] = useState<ChainRow[]>([]);
  const [chainError, setChainError] = useState<string | null>(null);
  const [legs, setLegs] = useState<StrategyLeg[]>([EMPTY_LEG()]);
  const [evalResult, setEvalResult] = useState<Record<string, unknown> | null>(null);
  const [evalError, setEvalError] = useState<string | null>(null);

  useEffect(() => {
    if (!tickerQuery.trim()) {
      setTickerResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/market/symbols/search?q=${encodeURIComponent(tickerQuery)}`);
        const payload = (await response.json()) as { items?: SymbolLookupItem[]; error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to search symbols");
        }
        setTickerResults(payload.items ?? []);
      } catch {
        setTickerResults([]);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [tickerQuery]);

  useEffect(() => {
    if (!selectedSymbol) {
      return;
    }

    const loadSymbolData = async () => {
      try {
        const quoteRes = await fetch(`/api/market/quote?symbol=${encodeURIComponent(selectedSymbol)}`);
        const quotePayload = (await quoteRes.json()) as {
          quote?: { last: number | null; midpoint: number | null };
          error?: string;
        };
        if (!quoteRes.ok) {
          throw new Error(quotePayload.error ?? "Unable to fetch quote");
        }

        const spotValue = quotePayload.quote?.last ?? quotePayload.quote?.midpoint;
        if (!spotTouched && typeof spotValue === "number") {
          setSpot(spotValue);
        }

        const expRes = await fetch(
          `/api/market/options/expirations?symbol=${encodeURIComponent(selectedSymbol)}`
        );
        const expPayload = (await expRes.json()) as { expirations?: string[]; error?: string };
        if (!expRes.ok) {
          throw new Error(expPayload.error ?? "Unable to fetch expirations");
        }

        const values = expPayload.expirations ?? [];
        setExpirations(values);
        if (values.length > 0) {
          setSelectedExpiry((current) => current || values[0]);
        }
      } catch (error) {
        setChainError(error instanceof Error ? error.message : "Unable to load market data");
      }
    };

    loadSymbolData();
  }, [selectedSymbol, spotTouched]);

  useEffect(() => {
    if (!selectedSymbol || !selectedExpiry) {
      return;
    }

    const loadChain = async () => {
      try {
        setChainError(null);
        const response = await fetch(
          `/api/market/options/chain?symbol=${encodeURIComponent(selectedSymbol)}&expiry=${encodeURIComponent(
            selectedExpiry
          )}`
        );
        const payload = (await response.json()) as { rows?: ChainRow[]; error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to fetch option chain");
        }
        setChainRows(payload.rows ?? []);
      } catch (error) {
        setChainError(
          `Chain unavailable: ${error instanceof Error ? error.message : "unknown error"}. Manual editing remains enabled.`
        );
        setChainRows([]);
      }
    };

    loadChain();
  }, [selectedSymbol, selectedExpiry]);

  const canEvaluate = useMemo(
    () => legs.length > 0 && legs.every((l) => l.expiry && l.strike > 0 && l.quantity > 0),
    [legs]
  );

  function addFromChain(params: {
    optionType: "call" | "put";
    strike: number;
    contractId: string | number | null;
    bid: number | null;
    ask: number | null;
    mid: number | null;
    iv: number | null;
  }) {
    setLegs((prev) => {
      const existingIdx = prev.findIndex(
        (leg) =>
          leg.optionType === params.optionType &&
          leg.strike === params.strike &&
          leg.expiry === selectedExpiry &&
          leg.symbol === selectedSymbol
      );

      const patch = {
        symbol: selectedSymbol,
        contractId: params.contractId,
        optionType: params.optionType,
        strike: params.strike,
        expiry: selectedExpiry,
        bid: params.bid,
        ask: params.ask,
        mid: params.mid,
        iv: params.iv,
        ivSource: params.iv !== null ? ("market" as const) : ("unknown" as const),
        premium: params.mid
      };

      if (existingIdx >= 0) {
        const next = [...prev];
        const existing = next[existingIdx];
        next[existingIdx] = existing.manualMode
          ? {
              ...existing,
              symbol: patch.symbol,
              contractId: patch.contractId,
              optionType: patch.optionType,
              strike: patch.strike,
              expiry: patch.expiry
            }
          : { ...existing, ...patch };
        return next;
      }

      return [...prev, { ...EMPTY_LEG(), ...patch }];
    });
  }

  function updateLeg(id: string, updates: Partial<StrategyLeg>) {
    setLegs((prev) => prev.map((leg) => (leg.id === id ? { ...leg, ...updates } : leg)));
  }

  function removeLeg(id: string) {
    setLegs((prev) => prev.filter((leg) => leg.id !== id));
  }

  async function evaluate() {
    setEvalError(null);
    setEvalResult(null);

    try {
      const response = await fetch("/api/options/strategy/evaluate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          spot,
          rate,
          legs
        })
      });

      const payload = (await response.json()) as Record<string, unknown>;
      if (!response.ok) {
        throw new Error((payload as { error?: string }).error ?? "Evaluation failed");
      }

      setEvalResult(payload);
    } catch (error) {
      setEvalError(error instanceof Error ? error.message : "Evaluation failed");
    }
  }

  return (
    <main className="mx-auto max-w-6xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Multi-Leg Strategy Builder</h1>

      <section className="rounded border bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm">Ticker</label>
          <input
            value={tickerQuery}
            onChange={(e) => setTickerQuery(e.target.value.toUpperCase())}
            placeholder="Search symbol"
            className="w-48 rounded border px-2 py-1"
          />

          <label className="text-sm">Spot S</label>
          <input
            type="number"
            value={spot}
            onChange={(e) => {
              setSpot(Number(e.target.value));
              setSpotTouched(true);
            }}
            className="w-24 rounded border px-2 py-1"
          />

          <label className="text-sm">Rate r</label>
          <input
            type="number"
            step="0.001"
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
            className="w-24 rounded border px-2 py-1"
          />

          <label className="text-sm">Expiry</label>
          <select
            value={selectedExpiry}
            onChange={(e) => setSelectedExpiry(e.target.value)}
            className="rounded border px-2 py-1"
          >
            <option value="">Select expiry</option>
            {expirations.map((exp) => (
              <option key={exp} value={exp}>
                {exp}
              </option>
            ))}
          </select>
        </div>

        {tickerResults.length > 0 && (
          <div className="mt-2 max-h-44 overflow-y-auto rounded border">
            {tickerResults.slice(0, 12).map((item) => (
              <button
                key={`${item.symbol}-${item.exchange}`}
                className="block w-full border-b px-2 py-1 text-left text-sm hover:bg-gray-50"
                onClick={() => {
                  setSelectedSymbol(item.symbol);
                  setTickerQuery(item.symbol);
                  setTickerResults([]);
                }}
              >
                {item.symbol} {item.description ? `- ${item.description}` : ""}
              </button>
            ))}
          </div>
        )}
      </section>

      {chainError && <p className="rounded border border-amber-300 bg-amber-50 p-2 text-sm">{chainError}</p>}

      {chainRows.length > 0 && <ChainPicker rows={chainRows} onAddLeg={addFromChain} />}

      <section className="rounded border bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-medium">Legs</h2>
          <button
            onClick={() => setLegs((prev) => [...prev, { ...EMPTY_LEG(), symbol: selectedSymbol, expiry: selectedExpiry }])}
            className="rounded bg-gray-800 px-3 py-1 text-sm text-white"
          >
            Add empty leg
          </button>
        </div>

        <div className="space-y-3">
          {legs.map((leg) => (
            <div key={leg.id} className="rounded border p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <select
                  value={leg.side}
                  onChange={(e) => updateLeg(leg.id, { side: e.target.value as "long" | "short" })}
                  className="rounded border px-2 py-1 text-sm"
                >
                  <option value="long">Long</option>
                  <option value="short">Short</option>
                </select>
                <select
                  value={leg.optionType}
                  onChange={(e) => updateLeg(leg.id, { optionType: e.target.value as "call" | "put" })}
                  className="rounded border px-2 py-1 text-sm"
                >
                  <option value="call">Call</option>
                  <option value="put">Put</option>
                </select>
                <input
                  type="number"
                  value={leg.strike}
                  onChange={(e) => updateLeg(leg.id, { strike: Number(e.target.value) })}
                  className="w-24 rounded border px-2 py-1 text-sm"
                  placeholder="Strike"
                />
                <input
                  type="date"
                  value={leg.expiry}
                  onChange={(e) => updateLeg(leg.id, { expiry: e.target.value })}
                  className="rounded border px-2 py-1 text-sm"
                />
                <input
                  type="number"
                  value={leg.quantity}
                  onChange={(e) => updateLeg(leg.id, { quantity: Number(e.target.value) })}
                  className="w-20 rounded border px-2 py-1 text-sm"
                  placeholder="Qty"
                />
                <label className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(leg.manualMode)}
                    onChange={(e) =>
                      updateLeg(leg.id, {
                        manualMode: e.target.checked,
                        ivSource: e.target.checked ? "manual" : leg.ivSource
                      })
                    }
                  />
                  Manual Mode
                </label>
                <button onClick={() => removeLeg(leg.id)} className="rounded border px-2 py-1 text-xs">
                  Remove
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-sm">
                <label>IV</label>
                <input
                  type="number"
                  step="0.001"
                  value={leg.iv ?? ""}
                  onChange={(e) =>
                    updateLeg(leg.id, {
                      iv: e.target.value === "" ? null : Number(e.target.value),
                      ivSource: "manual"
                    })
                  }
                  className="w-24 rounded border px-2 py-1"
                />
                <label>Premium</label>
                <input
                  type="number"
                  step="0.01"
                  value={leg.premium ?? ""}
                  onChange={(e) =>
                    updateLeg(leg.id, {
                      premium: e.target.value === "" ? null : Number(e.target.value)
                    })
                  }
                  className="w-24 rounded border px-2 py-1"
                />
                <label>Bid</label>
                <input
                  type="number"
                  step="0.01"
                  value={leg.bid ?? ""}
                  onChange={(e) => updateLeg(leg.id, { bid: e.target.value === "" ? null : Number(e.target.value) })}
                  className="w-20 rounded border px-2 py-1"
                />
                <label>Ask</label>
                <input
                  type="number"
                  step="0.01"
                  value={leg.ask ?? ""}
                  onChange={(e) => updateLeg(leg.id, { ask: e.target.value === "" ? null : Number(e.target.value) })}
                  className="w-20 rounded border px-2 py-1"
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <button
        onClick={evaluate}
        disabled={!canEvaluate}
        className="rounded bg-green-700 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        Evaluate Strategy
      </button>

      {evalError && <p className="rounded border border-red-300 bg-red-50 p-2 text-sm">{evalError}</p>}

      {evalResult && (
        <section className="rounded border bg-white p-4">
          <h2 className="mb-2 text-lg font-medium">Evaluation</h2>
          <pre className="overflow-x-auto whitespace-pre-wrap text-xs">{JSON.stringify(evalResult, null, 2)}</pre>
        </section>
      )}
    </main>
  );
}
