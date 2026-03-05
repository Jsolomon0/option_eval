"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChainRow, OptionType } from "@/types/options";

type Props = {
  rows: ChainRow[];
  onAddLeg: (params: {
    optionType: OptionType;
    strike: number;
    contractId: string | number | null;
    bid: number | null;
    ask: number | null;
    mid: number | null;
    iv: number | null;
  }) => void;
};

export function ChainPicker({ rows, onAddLeg }: Props) {
  const [view, setView] = useState<OptionType | "both">("both");
  const strikes = rows.map((r) => r.strike);
  const minStrike = strikes.length ? Math.min(...strikes) : 0;
  const maxStrike = strikes.length ? Math.max(...strikes) : 0;

  const [rangeMin, setRangeMin] = useState(minStrike);
  const [rangeMax, setRangeMax] = useState(maxStrike);

  useEffect(() => {
    setRangeMin(minStrike);
    setRangeMax(maxStrike);
  }, [minStrike, maxStrike]);

  const filteredRows = useMemo(
    () => rows.filter((r) => r.strike >= rangeMin && r.strike <= rangeMax),
    [rows, rangeMin, rangeMax]
  );

  return (
    <section className="rounded border bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="text-sm">View</label>
        <select
          value={view}
          onChange={(e) => setView(e.target.value as OptionType | "both")}
          className="rounded border px-2 py-1 text-sm"
        >
          <option value="both">Calls + Puts</option>
          <option value="call">Calls</option>
          <option value="put">Puts</option>
        </select>

        <label className="ml-2 text-sm">Strike min</label>
        <input
          type="number"
          value={rangeMin}
          onChange={(e) => setRangeMin(Number(e.target.value))}
          className="w-24 rounded border px-2 py-1 text-sm"
        />

        <label className="text-sm">max</label>
        <input
          type="number"
          value={rangeMax}
          onChange={(e) => setRangeMax(Number(e.target.value))}
          className="w-24 rounded border px-2 py-1 text-sm"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-gray-50">
              <th className="border p-2 text-left">Strike</th>
              {(view === "both" || view === "call") && <th className="border p-2 text-left">Call</th>}
              {(view === "both" || view === "put") && <th className="border p-2 text-left">Put</th>}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => (
              <tr key={row.strike}>
                <td className="border p-2">{row.strike}</td>
                {(view === "both" || view === "call") && (
                  <td className="border p-2">
                    {row.call ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span>B {row.call.bid ?? "-"}</span>
                        <span>A {row.call.ask ?? "-"}</span>
                        <span>M {row.call.mid ?? "-"}</span>
                        <span>IV {row.call.iv ?? "-"}</span>
                        <button
                          className="rounded bg-blue-700 px-2 py-1 text-xs text-white"
                          onClick={() =>
                            onAddLeg({
                              optionType: "call",
                              strike: row.strike,
                              contractId: row.call!.contractId,
                              bid: row.call!.bid,
                              ask: row.call!.ask,
                              mid: row.call!.mid,
                              iv: row.call!.iv
                            })
                          }
                        >
                          Add as leg
                        </button>
                      </div>
                    ) : (
                      "-"
                    )}
                  </td>
                )}
                {(view === "both" || view === "put") && (
                  <td className="border p-2">
                    {row.put ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span>B {row.put.bid ?? "-"}</span>
                        <span>A {row.put.ask ?? "-"}</span>
                        <span>M {row.put.mid ?? "-"}</span>
                        <span>IV {row.put.iv ?? "-"}</span>
                        <button
                          className="rounded bg-blue-700 px-2 py-1 text-xs text-white"
                          onClick={() =>
                            onAddLeg({
                              optionType: "put",
                              strike: row.strike,
                              contractId: row.put!.contractId,
                              bid: row.put!.bid,
                              ask: row.put!.ask,
                              mid: row.put!.mid,
                              iv: row.put!.iv
                            })
                          }
                        >
                          Add as leg
                        </button>
                      </div>
                    ) : (
                      "-"
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
