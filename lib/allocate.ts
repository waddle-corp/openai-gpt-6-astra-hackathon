/** Largest remainder: shares follow the weights and the cents always add up to the pool. */
export function allocate(weights: number[], poolCents: number): number[] {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (!total) throw new Error('Nothing to allocate the pool across.');
  const exact = weights.map((weight) => (poolCents * weight) / total);
  const cents = exact.map(Math.floor);
  let left = poolCents - cents.reduce((sum, value) => sum + value, 0);
  for (const index of [...exact.keys()].sort(
    (a, b) => exact[b] - cents[b] - (exact[a] - cents[a]),
  )) {
    if (left <= 0) break;
    cents[index] += 1;
    left -= 1;
  }
  return cents;
}
