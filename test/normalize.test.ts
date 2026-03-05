import { describe, expect, test } from "vitest";
import { normalizeTradierChain } from "@/lib/market/normalize";

describe("normalizeTradierChain", () => {
  test("computes mid only when bid and ask exist and sorts by strike", () => {
    const rows = normalizeTradierChain([
      {
        id: "P110",
        option_type: "put",
        strike: 110,
        bid: 5,
        ask: 7,
        greeks: { mid_iv: 0.25 },
        open_interest: 100,
        volume: 11
      },
      {
        id: "C100",
        option_type: "call",
        strike: 100,
        bid: 3,
        ask: 4,
        greeks: { mid_iv: 0.2 },
        open_interest: 200,
        volume: 33
      },
      {
        id: "P100",
        option_type: "put",
        strike: 100,
        bid: 2,
        ask: null,
        greeks: { mid_iv: 0.21 },
        open_interest: 150,
        volume: 12
      }
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[0].strike).toBe(100);
    expect(rows[1].strike).toBe(110);

    expect(rows[0].call?.mid).toBe(3.5);
    expect(rows[0].put?.mid).toBeNull();
    expect(rows[1].put?.mid).toBe(6);
  });
});