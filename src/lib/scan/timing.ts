/**
 * Frame timings for the scanner lab.
 *
 * The lab records how long one decode takes, frame after frame. The number
 * that matters is the tail, not the mean: a desk that is fast most of the time
 * and slow one frame in twenty still feels slow to the person holding the tag.
 * So the page shows p50, p95 and p99, ranked by the ceiling rule below.
 *
 * Straight from the loop, so it holds no state and does no rounding.
 */

/** The three points the lab reports. */
export const frameRankPoints = [0.5, 0.95, 0.99] as const;

/**
 * One percentile of a set of frame times.
 *
 * The list is sorted ascending and the rank is `ceil(p * n)`, counted from one.
 * The value is the sample at index `min(n - 1, max(0, ceil(p * n) - 1))`, so a
 * small list still answers instead of running off the end.
 *
 * @param samples - Frame times in milliseconds, in the order they were read.
 * @param p - The point to report, from 0 to 1.
 * @returns That frame time, or null when nothing has been read yet.
 */
export function percentile(samples: readonly number[], p: number): number | null {
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((left, right) => left - right);
  const rank = Math.ceil(p * sorted.length) - 1;
  const index = Math.min(sorted.length - 1, Math.max(0, rank));
  return sorted[index] ?? null;
}

/** What the lab page shows under the camera button. */
export interface FramePercentiles {
  /** Frames read so far. */
  readonly count: number;
  /** Median frame time in milliseconds. */
  readonly p50: number;
  /** One frame in twenty was slower than this, in milliseconds. */
  readonly p95: number;
  /** One frame in a hundred was slower than this, in milliseconds. */
  readonly p99: number;
}

/**
 * The frame count and the three percentiles, from one list of timings.
 *
 * @param samples - Frame times in milliseconds, in the order they were read.
 * @returns The summary, or null when no frame has been read.
 */
export function framePercentiles(samples: readonly number[]): FramePercentiles | null {
  if (samples.length === 0) return null;
  const p50 = percentile(samples, 0.5);
  const p95 = percentile(samples, 0.95);
  const p99 = percentile(samples, 0.99);
  if (p50 === null || p95 === null || p99 === null) return null;
  return { count: samples.length, p50, p95, p99 };
}
