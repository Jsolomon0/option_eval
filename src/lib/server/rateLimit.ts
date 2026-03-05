const hits = new Map<string, number[]>();

export function allowRequest(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;

  const kept = (hits.get(key) ?? []).filter((ts) => ts >= cutoff);
  if (kept.length >= limit) {
    hits.set(key, kept);
    return false;
  }

  kept.push(now);
  hits.set(key, kept);
  return true;
}