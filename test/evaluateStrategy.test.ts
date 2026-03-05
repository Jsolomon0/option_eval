import { describe, expect, test } from "vitest";
import { evaluateStrategy } from "@/lib/options/evaluateStrategy";

describe("evaluateStrategy", () => {
  test("uses provided premium when present", () => {
    const result = evaluateStrategy({
      spot: 100,
      rate: 0.03,
      legs: [
        {
          id: "leg1",
          side: "long",
          optionType: "call",
          strike: 100,
          expiry: "2026-12-18",
          quantity: 1,
          iv: 0.2,
          premium: 5
        }
      ]
    });

    expect(result.perLeg[0].premiumPerOption).toBe(5);
    expect(result.combinedPremium).toBe(500);
  });

  test("long + short identical leg net payoff near zero", () => {
    const result = evaluateStrategy({
      spot: 100,
      rate: 0.01,
      legs: [
        {
          id: "long1",
          side: "long",
          optionType: "call",
          strike: 100,
          expiry: "2026-12-18",
          quantity: 1,
          iv: 0.25,
          premium: 4
        },
        {
          id: "short1",
          side: "short",
          optionType: "call",
          strike: 100,
          expiry: "2026-12-18",
          quantity: 1,
          iv: 0.25,
          premium: 4
        }
      ]
    });

    const maxAbs = Math.max(...result.payoffCurve.map((p) => Math.abs(p.pnl)));
    expect(maxAbs).toBeLessThan(1e-9);
    expect(Math.abs(result.combinedPremium)).toBeLessThan(1e-9);
  });

  test("rejects leg missing iv", () => {
    expect(() =>
      evaluateStrategy({
        spot: 100,
        rate: 0.03,
        legs: [
          {
            id: "leg-no-iv",
            side: "long",
            optionType: "put",
            strike: 95,
            expiry: "2026-12-18",
            quantity: 1,
            iv: null
          }
        ]
      })
    ).toThrow(/missing iv/i);
  });
});