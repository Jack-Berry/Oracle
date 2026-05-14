/**
 * Normalises trigger phrases and questions for fuzzy matching.
 * Lowercases, strips punctuation, collapses whitespace.
 */
function normaliseForMatch(str) {
  if (typeof str !== 'string') return '';
  return str
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Returns the best-matching invocation for the given question, or null.
 *
 * Matching rules:
 *   - case-insensitive
 *   - punctuation ignored
 *   - whitespace collapsed
 *   - normalised trigger must appear as a contiguous substring of the normalised question
 *
 * Tie-breakers:
 *   - longest normalised trigger phrase wins
 *   - if still tied, most recently updated wins
 */
function matchInvocation(question, invocations) {
  if (!question || !Array.isArray(invocations) || invocations.length === 0) return null;

  const normQ = normaliseForMatch(question);
  if (!normQ) return null;

  const candidates = [];

  for (const inv of invocations) {
    if (!inv || inv.is_enabled === false || inv.isEnabled === false) continue;
    const trigger = inv.trigger_phrase || inv.triggerPhrase;
    const normT = normaliseForMatch(trigger);
    if (!normT) continue;
    if (normQ.includes(normT)) {
      candidates.push({ inv, normTLen: normT.length });
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (b.normTLen !== a.normTLen) return b.normTLen - a.normTLen;
    const ta = new Date(a.inv.updated_at || a.inv.updatedAt || 0).getTime();
    const tb = new Date(b.inv.updated_at || b.inv.updatedAt || 0).getTime();
    return tb - ta;
  });

  return candidates[0].inv;
}

module.exports = { normaliseForMatch, matchInvocation };
