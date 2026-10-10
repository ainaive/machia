import { describe, expect, test } from "bun:test";
import { fitScale } from "./FitToWidth";

describe("fitScale", () => {
  test("shrinks content wider than the space to fit it exactly", () => {
    expect(fitScale(360, 720)).toBe(0.5);
    expect(556 * fitScale(343, 556)).toBeCloseTo(343);
  });

  test("never enlarges content that already fits", () => {
    expect(fitScale(1024, 556)).toBe(1);
    expect(fitScale(556, 556)).toBe(1);
  });

  test("leaves content alone before the layout has a width", () => {
    expect(fitScale(0, 556)).toBe(1);
  });
});
