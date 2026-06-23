// Bounded-concurrency worker pool — lifted verbatim from ClinicPro.
// Used by scorer + cohort-scanner + RAG ingest. Historical backfill handled
// by the same cron sweep (picks rows where evaluated_at IS NULL regardless of age).

export async function withConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, idx: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(1, concurrency), items.length) },
    async () => {
      while (true) {
        const idx = cursor++;
        if (idx >= items.length) return;
        results[idx] = await fn(items[idx], idx);
      }
    },
  );
  await Promise.all(workers);
  return results;
}
