/**
 * In-memory window limiter for the university resolve route.
 * One process, one map. A restart clears it, which is enough for a campus server.
 */
export function createWindowLimiter(limit: number, windowMs: number): (key: string, now: number) => boolean {
  const hits = new Map<string, number[]>();
  return (key, now) => {
    const recent = (hits.get(key) ?? []).filter((at) => now - at < windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    return true;
  };
}
