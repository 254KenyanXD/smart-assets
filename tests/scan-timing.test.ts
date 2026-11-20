import { describe, expect, test } from "bun:test";

import { framePercentiles, percentile } from "@/lib/scan/timing";

describe("percentile", () => {
  test("ranks the known row at the ceiling point", () => {
    const samples = [10, 20, 30, 40, 50];
    expect(percentile(samples, 0.5)).toBe(30);
    expect(percentile(samples, 0.95)).toBe(50);
    expect(percentile(samples, 0.99)).toBe(50);
  });

  test("sorts a list that arrives out of order", () => {
    expect(percentile([50, 10, 40, 20, 30], 0.5)).toBe(30);
  });

  test("does not change the list it was given", () => {
    const samples = [50, 10, 40, 20, 30];
    percentile(samples, 0.5);
    expect(samples).toEqual([50, 10, 40, 20, 30]);
  });

  test("a single frame is its own every percentile", () => {
    expect(percentile([37], 0.5)).toBe(37);
    expect(percentile([37], 0.99)).toBe(37);
  });

  test("a small list clamps to the last sample instead of running off the end", () => {
    expect(percentile([10, 20], 0.99)).toBe(20);
    expect(percentile([10, 20, 30], 0.99)).toBe(30);
  });

  test("the ceiling point skips a sample below it", () => {
    expect(percentile([10, 20, 30, 40], 0.5)).toBe(20);

    const many = Array.from({ length: 21 }, (_, index) => index + 1);
    expect(percentile(many, 0.95)).toBe(20);
  });

  test("no frames means no percentile", () => {
    expect(percentile([], 0.5)).toBeNull();
    expect(percentile([], 0.99)).toBeNull();
  });

  test("keeps fractional timings as measured", () => {
    expect(percentile([1.4, 2.6, 3.9], 0.5)).toBe(2.6);
  });
});

describe("framePercentiles", () => {
  test("reports the count with the three points", () => {
    expect(framePercentiles([10, 20, 30, 40, 50])).toEqual({
      count: 5,
      p50: 30,
      p95: 50,
      p99: 50,
    });
  });

  test("no frames yet", () => {
    expect(framePercentiles([])).toBeNull();
  });

  test("a run where every frame hit a tag counts the same as a run with none", () => {
    const samples = [12, 13, 12, 400];
    expect(framePercentiles(samples)).toEqual({
      count: 4,
      p50: 12,
      p95: 400,
      p99: 400,
    });
  });
});
