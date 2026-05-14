import { useCallback, useState } from 'react';
import { EQUIPMENT, SYNONYMS } from '../data/equipmentPrices.js';
import { apiFetch } from '../utils/apiClient.js';

// If the best local match scores below this (0–1), the existing flow falls
// back to the AI pricing assistant for a smarter identification.
const LOCAL_CONFIDENCE_THRESHOLD = 0.6;
const isDev = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV;

// ── Text normalisation ────────────────────────────────────────────────────

function normalise(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[’']/g, '')          // strip apostrophes
    .replace(/[^a-z0-9\s]+/g, ' ') // punctuation → space
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(s) {
  return normalise(s).split(' ').filter(Boolean);
}

// ── Fuzzy-ish scoring ─────────────────────────────────────────────────────
//
// Lightweight scoring: token overlap with partial-prefix credit. Avoids
// pulling in a fuzzy-match library.

function similarity(queryNorm, itemNorm) {
  if (!queryNorm) return 0;
  if (queryNorm === itemNorm) return 1;

  const qTokens = queryNorm.split(' ');
  const iTokens = itemNorm.split(' ');

  let matched = 0;
  for (const qt of qTokens) {
    for (const it of iTokens) {
      if (it === qt) { matched += 1; break; }
      if (it.startsWith(qt) || qt.startsWith(it)) { matched += 0.7; break; }
      if (it.includes(qt) && qt.length >= 3) { matched += 0.5; break; }
    }
  }

  // Substring boost: full query appears inside item name
  if (itemNorm.includes(queryNorm) && queryNorm.length >= 3) {
    matched += 0.5;
  }

  return Math.min(1, matched / Math.max(qTokens.length, 1));
}

// ── Resale estimate ──────────────────────────────────────────────────────
//
// Standard guidelines:
//   - Mundane (weapon/armor/gear/ammunition/mount/vehicle): ~50% resale
//   - Trade goods: near full value (~95%)
//   - Services: not resalable — return purchase price
//   - Potions / magic: 50% default unless caller overrides
//
// For higher-value mundane items, we keep 50% — the user asked for a clear,
// consistent baseline rather than tiered logic.

function estimateResale(priceGp, category) {
  const cat = String(category || '').toLowerCase();
  if (cat === 'trade-good') return Math.round(priceGp * 0.95 * 100) / 100;
  if (cat === 'service') return priceGp;
  return Math.round(priceGp * 0.5 * 100) / 100;
}

function resaleReason(category) {
  const cat = String(category || '').toLowerCase();
  if (cat === 'trade-good') return 'Trade good — sells near full value';
  if (cat === 'service') return 'Service — consumed, no resale';
  if (cat === 'potion') return 'Consumable — typical 50% resale';
  return 'Typical 50% resale estimate';
}

// ── Public API ────────────────────────────────────────────────────────────

// Baseline score given to every item in a category when the query contains
// that category as a standalone token (e.g. "potion" surfaces Antitoxin too).
const CATEGORY_BROADEN_SCORE = 0.7;

export function findMatches(query, limit = 5) {
  const qNorm = normalise(query);
  if (!qNorm) return [];
  const qTokens = tokens(qNorm);

  // Synonym short-circuit: if the query (or a normalised variant) matches a
  // known synonym, prioritise that canonical item to the top of results.
  const synonymTarget = SYNONYMS[qNorm];
  const synonymHit = synonymTarget
    ? EQUIPMENT.find(e => e.name === synonymTarget)
    : null;

  const scored = EQUIPMENT.map(item => {
    const iNorm = normalise(item.name);
    let score = similarity(qNorm, iNorm);
    let matchReason = score >= 0.85 ? 'name match' : 'fuzzy match';

    // Per-item aliases: e.g. "haste potion" → Potion of Speed.
    if (Array.isArray(item.aliases)) {
      for (const alias of item.aliases) {
        const s = similarity(qNorm, normalise(alias));
        if (s > score) {
          score = s;
          matchReason = 'alias match';
        }
      }
    }

    // Free-text synonym map (legacy/global overrides).
    for (const [key, target] of Object.entries(SYNONYMS)) {
      if (target === item.name) {
        const s = similarity(qNorm, normalise(key));
        if (s > score) {
          score = s;
          matchReason = 'synonym match';
        }
      }
    }

    // Category broadening: a single query token equal to the item's category
    // surfaces every item in that category at a moderate baseline. Lets
    // "potion" reach all potions, "scroll" reach all scrolls, etc.
    const catNorm = normalise(item.category);
    if (catNorm && qTokens.some(qt => qt === catNorm) && score < CATEGORY_BROADEN_SCORE) {
      score = CATEGORY_BROADEN_SCORE;
      matchReason = 'category match';
    }

    return { item, score, matchReason };
  });

  scored.sort((a, b) => b.score - a.score);

  const results = [];
  const seen = new Set();

  if (synonymHit) {
    results.push({
      item: synonymHit,
      score: 1,
      matchReason: 'synonym match',
    });
    seen.add(synonymHit.name);
  }

  for (const { item, score, matchReason } of scored) {
    if (results.length >= limit) break;
    if (seen.has(item.name)) continue;
    if (score <= 0) continue;
    results.push({ item, score, matchReason });
    seen.add(item.name);
  }

  return results;
}

export function buildExistingRow(item, score, matchReason) {
  const purchaseGp = item.priceGp;
  const sellGp = estimateResale(purchaseGp, item.category);
  return {
    name: item.name,
    category: item.category,
    confidence: Math.round((score || 0) * 100),
    matchReason: matchReason || '',
    purchaseGp,
    sellGp,
    resaleNote: resaleReason(item.category),
    description: item.description || '',
    aliases: Array.isArray(item.aliases) ? item.aliases : [],
    pricingBasis: item.pricingBasis || 'official',
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────

export function useMerchantPricing() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null); // { mode: 'existing'|'custom', rows }

  const reset = useCallback(() => {
    setResults(null);
    setError(null);
    setLoading(false);
  }, []);

  const priceExisting = useCallback(async (description) => {
    setError(null);
    setLoading(true);
    setResults(null);
    try {
      const matches = findMatches(description, 10);
      const bestScore = matches[0]?.score ?? 0;
      const useFallback = matches.length === 0 || bestScore < LOCAL_CONFIDENCE_THRESHOLD;

      if (isDev) {
        // eslint-disable-next-line no-console
        console.log(
          `[merchant] local lookup desc="${description}" bestScore=${bestScore.toFixed(2)} fallback=${useFallback}`
        );
      }

      if (!useFallback) {
        const rows = matches.map(m => buildExistingRow(m.item, m.score, m.matchReason));
        if (isDev) console.log(`[merchant] source=local totalRows=${rows.length}`);
        setResults({ mode: 'existing', source: 'local', rows });
        return;
      }

      // Local confidence weak — call AI fallback.
      const weakLocalMatches = matches.slice(0, 5).map(m => ({
        name: m.item.name,
        category: m.item.category,
        confidence: Math.round((m.score || 0) * 100),
      }));

      let aiData = null;
      try {
        aiData = await apiFetch('POST', '/api/merchant/existing-fallback', {
          itemDescription: description,
          weakLocalMatches,
        });
      } catch (fetchErr) {
        // If the fallback fails, fall back to whatever weak local matches we had.
        if (isDev) console.warn('[merchant] AI fallback failed, using local results:', fetchErr.message);
        const rows = matches.map(m => buildExistingRow(m.item, m.score, m.matchReason));
        setResults({ mode: 'existing', source: 'local', rows });
        return;
      }

      const aiMatches = Array.isArray(aiData?.matches) ? aiData.matches : [];
      if (aiMatches.length === 0) {
        // No useful AI suggestions — show whatever weak local matches we have.
        const rows = matches.map(m => buildExistingRow(m.item, m.score, m.matchReason));
        if (isDev) console.log('[merchant] source=local (AI returned no matches)');
        setResults({ mode: 'existing', source: 'local', rows });
        return;
      }

      const rows = aiMatches.map(m => ({
        name: m.name,
        category: m.category || 'unknown',
        confidence: Number.isFinite(m.confidence) ? m.confidence : 0,
        matchReason: 'AI-assisted match',
        purchaseGp: Number(m.purchasePriceGp) || 0,
        sellGp: Number.isFinite(Number(m.sellingPriceGp))
          ? Number(m.sellingPriceGp)
          : estimateResale(Number(m.purchasePriceGp) || 0, m.category || ''),
        resaleNote: m.reasoning || resaleReason(m.category || ''),
        description: m.reasoning || '',
        aliases: [],
        pricingBasis: 'ai-estimated',
      }));

      if (isDev) console.log(`[merchant] source=ai-fallback totalRows=${rows.length}`);
      setResults({ mode: 'existing', source: 'ai-fallback', rows });
    } catch (e) {
      setError(e.message || 'Failed to look up item');
    } finally {
      setLoading(false);
    }
  }, []);

  const priceCustom = useCallback(async (description) => {
    setError(null);
    setLoading(true);
    setResults(null);
    try {
      const data = await apiFetch('POST', '/api/merchant/estimate', {
        itemDescription: description,
        mode: 'custom',
      });

      const purchaseGp = Number(data.purchasePriceGp) || 0;
      const sellGp = Number(data.sellingPriceGp);
      const finalSell = Number.isFinite(sellGp) && sellGp >= 0
        ? sellGp
        : estimateResale(purchaseGp, data.rarityOrCategory || '');

      setResults({
        mode: 'custom',
        row: {
          name: data.itemName || description.slice(0, 60),
          rarityOrCategory: data.rarityOrCategory || '',
          purchaseGp,
          sellGp: finalSell,
          reasoning: data.reasoning || '',
          description: data.reasoning || '',
          pricingBasis: 'ai-estimated',
        },
      });
    } catch (e) {
      setError(e.message || 'Estimate failed');
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, results, priceExisting, priceCustom, reset };
}
