// Ranking used by the command palette and the search suggestions.

const WORD_CHAR = /[a-z0-9]/;

function isBoundary(text, index) {
  return index === 0 || !WORD_CHAR.test(text[index - 1]);
}

/**
 * Score how well `query` matches `text`.
 * Returns a number; -1 means no match. Higher is better.
 */
export function fuzzyScore(query, text) {
  const needle = query.trim().toLowerCase();
  const haystack = (text ?? '').toLowerCase();
  if (!needle) return 0;
  if (!haystack) return -1;

  const direct = haystack.indexOf(needle);
  if (direct !== -1) {
    let score = 120 - Math.min(direct, 40);
    if (direct === 0) score += 60;
    else if (isBoundary(haystack, direct)) score += 35;
    score += Math.max(0, 25 - (haystack.length - needle.length) / 3);
    return score;
  }

  // Fall back to a subsequence match: every query char in order.
  let cursor = 0;
  let score = 0;
  let streak = 0;
  for (const char of needle) {
    const found = haystack.indexOf(char, cursor);
    if (found === -1) return -1;
    if (found === cursor && cursor > 0) {
      streak += 1;
      score += 6 + streak * 2;
    } else {
      streak = 0;
      score += Math.max(1, 6 - (found - cursor));
    }
    if (isBoundary(haystack, found)) score += 8;
    cursor = found + 1;
  }
  return score / 2;
}

/** Best score across several fields, each with its own weight. */
export function scoreFields(query, fields) {
  let best = -1;
  for (const [text, weight = 1] of fields) {
    const score = fuzzyScore(query, text);
    if (score >= 0) best = Math.max(best, score * weight);
  }
  return best;
}

/** Sort items by score, dropping the ones that do not match. */
export function rank(query, items, getFields, { limit = Infinity } = {}) {
  const scored = [];
  for (const item of items) {
    const score = scoreFields(query, getFields(item));
    if (score < 0) continue;
    scored.push({ item, score: score + (item.boost ?? 0) });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
