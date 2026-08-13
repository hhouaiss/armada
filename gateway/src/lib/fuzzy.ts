// Accent-insensitive, case-insensitive normalization for fuzzy matching
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fraction of the query's words found in `text`, tolerating typos on the tail
 * of a word (prefix match on the first 4 characters).
 */
export function matchScore(query: string, text: string): number {
  const queryTokens = normalize(query).split(' ').filter(Boolean);
  if (queryTokens.length === 0) return 0;
  const normalized = normalize(text ?? '');
  const words = normalized.split(' ');
  const matched = queryTokens.filter(
    (t) => normalized.includes(t) || words.some((w) => w.startsWith(t.slice(0, 4)))
  );
  return matched.length / queryTokens.length;
}

/** Rank candidates by how well one of their text fields matches the query. */
export function fuzzyRank<T>(
  query: string,
  items: T[],
  fields: (item: T) => (string | undefined | null)[],
  { threshold = 0.5, limit = 10 }: { threshold?: number; limit?: number } = {}
): T[] {
  return items
    .map((item) => ({
      item,
      score: Math.max(0, ...fields(item).map((f) => matchScore(query, f ?? ''))),
    }))
    .filter((s) => s.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.item);
}
