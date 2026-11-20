
export const frameRankPoints = [0.5, 0.95, 0.99] as const;

export function percentile(samples: readonly number[], p: number): number | null {
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((left, right) => left - right);
  const rank = Math.ceil(p * sorted.length) - 1;
  const index = Math.min(sorted.length - 1, Math.max(0, rank));
  return sorted[index] ?? null;
}

export interface FramePercentiles {
  readonly count: number;

  readonly p50: number;

  readonly p95: number;

  readonly p99: number;
}

export function framePercentiles(samples: readonly number[]): FramePercentiles | null {
  if (samples.length === 0) return null;
  const p50 = percentile(samples, 0.5);
  const p95 = percentile(samples, 0.95);
  const p99 = percentile(samples, 0.99);
  if (p50 === null || p95 === null || p99 === null) return null;
  return { count: samples.length, p50, p95, p99 };
}
