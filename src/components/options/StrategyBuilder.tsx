"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChainPicker } from "@/components/options/ChainPicker";
import { TickerSearch } from "@/components/options/TickerSearch";
import type { ChainRow, StrategyLeg } from "@/types/options";

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

type QuoteResponse = {
  symbol?: string;
  price?: number | null;
  asOf?: string;
  quote?: { last: number | null; midpoint: number | null };
  error?: string;
};

export function StrategyBuilder() {
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [spot, setSpot] = useState(100);
  const userEditedSpotRef = useRef(false);
  const [rate, setRate] = useState(0);
  const [expirations, setExpirations] = useState<string[]>([]);
  const [selectedExpiry, setSelectedExpiry] = useState("");
  const [chainRows, setChainRows] = useState<ChainRow[]>([]);
  const [chainError, setChainError] = useState<string | null>(null);
  const [symbolLoadError, setSymbolLoadError] = useState<string | null>(null);
  const [isSymbolLoading, setIsSymbolLoading] = useState(false);
  const [legs, setLegs] = useState<StrategyLeg[]>([EMPTY_LEG()]);
  const [evalResult, setEvalResult] = useState<Record<string, unknown> | null>(null);
  const [evalError, setEvalError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedSymbol) {
      setIsSymbolLoading(false);
      return;
    }

    const controller = new AbortController();

    const loadSymbolData = async () => {
      setIsSymbolLoading(true);
      setSymbolLoadError(null);
      setChainError(null);
      setChainRows([]);
      setExpirations([]);
      setSelectedExpiry("");
      setRate(0.045);
      userEditedSpotRef.current = false;

      let quoteError: string | null = null;
      let expirationError: string | null = null;

      try {
        const quoteRes = await fetch(`/api/market/quote?symbol=${encodeURIComponent(selectedSymbol)}`, {
          signal: controller.signal
        });
        const quotePayload = (await quoteRes.json()) as QuoteResponse;
        if (!quoteRes.ok) {
          throw new Error(quotePayload.error ?? "Unable to fetch quote");
        }

        const spotValue =
          typeof quotePayload.price === "number"
            ? quotePayload.price
            : quotePayload.quote?.last ?? quotePayload.quote?.midpoint ?? null;
        if (!userEditedSpotRef.current && typeof spotValue === "number") {
          setSpot(spotValue);
        }
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return;
        }
        quoteError = error instanceof Error ? error.message : "Unable to fetch quote";
      }

      try {
        const expRes = await fetch(
          `/api/market/options/expirations?symbol=${encodeURIComponent(selectedSymbol)}`,
          { signal: controller.signal }
        );
        const expPayload = (await expRes.json()) as string[] | { expirations?: string[]; error?: string };
        if (!expRes.ok) {
          throw new Error((expPayload as { error?: string }).error ?? "Unable to fetch expirations");
        }

        const values = Array.isArray(expPayload) ? expPayload : expPayload.expirations ?? [];
        setExpirations(values);
        setSelectedExpiry(values[0] ?? "");
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return;
        }
        expirationError = error instanceof Error ? error.message : "Unable to fetch expirations";
      }

      if (!controller.signal.aborted) {
        const combinedError = [quoteError, expirationError].filter(Boolean).join(" ");
        setSymbolLoadError(combinedError || null);
        setIsSymbolLoading(false);
      }
    };

    loadSymbolData();

    return () => controller.abort();
  }, [selectedSymbol]);

  useEffect(() => {
    if (!selectedSymbol || !selectedExpiry || isSymbolLoading) {
      return;
    }

    const controller = new AbortController();

    const loadChain = async () => {
      try {
        setChainError(null);
        const response = await fetch(
          `/api/market/options/chain?symbol=${encodeURIComponent(selectedSymbol)}&expiry=${encodeURIComponent(
            selectedExpiry
          )}`,
          { signal: controller.signal }
        );
        const payload = (await response.json()) as { rows?: ChainRow[]; error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to fetch option chain");
        }
        setChainRows(payload.rows ?? []);
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return;
        }

        setChainError(
          `Chain unavailable: ${error instanceof Error ? error.message : "unknown error"}. Manual editing remains enabled.`
        );
        setChainRows([]);
      }
    };

    loadChain();
    return () => controller.abort();
  }, [selectedSymbol, selectedExpiry, isSymbolLoading]);

  const isBuilderUnlocked = Boolean(selectedSymbol) && !isSymbolLoading;

  const canEvaluate = useMemo(
    () =>
      isBuilderUnlocked &&
      legs.length > 0 &&
      legs.every((leg) => leg.expiry && leg.strike > 0 && leg.quantity > 0),
    [isBuilderUnlocked, legs]
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
        <TickerSearch
          selectedSymbol={selectedSymbol}
          onSelect={(item) => {
            setSelectedSymbol(item.symbol);
          }}
        />
        {!selectedSymbol && (
          <p className="mt-2 text-sm text-gray-600">Select a ticker to load quote and expirations.</p>
        )}
        {selectedSymbol && isSymbolLoading && (
          <p className="mt-2 text-sm text-gray-600">Loading quote and expirations for {selectedSymbol}...</p>
        )}
      </section>

      {isBuilderUnlocked && (
        <>
          <section className="rounded border bg-white p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
                {selectedSymbol}
              </span>

              <label className="text-sm">Spot S</label>
              <input
                type="number"
                value={spot}
                onChange={(e) => {
                  setSpot(Number(e.target.value));
                  userEditedSpotRef.current = true;
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
          </section>

          {symbolLoadError && (
            <p className="rounded border border-amber-300 bg-amber-50 p-2 text-sm">{symbolLoadError}</p>
          )}

          {chainError && <p className="rounded border border-amber-300 bg-amber-50 p-2 text-sm">{chainError}</p>}

          {chainRows.length > 0 && <ChainPicker rows={chainRows} onAddLeg={addFromChain} />}

          <section className="rounded border bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-lg font-medium">Legs</h2>
              <button
                onClick={() =>
                  setLegs((prev) => [...prev, { ...EMPTY_LEG(), symbol: selectedSymbol, expiry: selectedExpiry }])
                }
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
        </>
      )}

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
