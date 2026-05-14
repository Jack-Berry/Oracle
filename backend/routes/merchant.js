const { Router } = require('express');
const { estimateCustomItem, suggestExistingItem } = require('../services/merchantService');

const router = Router();

const MAX_DESC = 500;
const VALID_MODES = new Set(['custom']);
const isDev = process.env.NODE_ENV !== 'production';

router.post('/merchant/estimate', async (req, res) => {
  const { itemDescription, mode } = req.body || {};

  if (!VALID_MODES.has(mode)) {
    return res.status(400).json({ error: 'Invalid mode.' });
  }
  if (!itemDescription || typeof itemDescription !== 'string' || !itemDescription.trim()) {
    return res.status(400).json({ error: 'Item description is required.' });
  }
  const desc = itemDescription.trim().slice(0, MAX_DESC);

  try {
    const result = await estimateCustomItem({ itemDescription: desc });
    return res.json(result);
  } catch (err) {
    console.error('Merchant estimate error:', err.message);
    return res.status(500).json({ error: 'Pricing assistant unavailable. Please try again shortly.' });
  }
});

// AI fallback for the Existing item flow. Called by the frontend only when
// local matching is empty or below the confidence threshold.
router.post('/merchant/existing-fallback', async (req, res) => {
  const { itemDescription, weakLocalMatches } = req.body || {};

  if (!itemDescription || typeof itemDescription !== 'string' || !itemDescription.trim()) {
    return res.status(400).json({ error: 'Item description is required.' });
  }
  const desc = itemDescription.trim().slice(0, MAX_DESC);

  const safeWeak = Array.isArray(weakLocalMatches)
    ? weakLocalMatches.slice(0, 5).map(m => ({
        name: typeof m?.name === 'string' ? m.name.slice(0, 120) : '',
        category: typeof m?.category === 'string' ? m.category.slice(0, 40) : '',
        confidence: Number.isFinite(Number(m?.confidence)) ? Number(m.confidence) : 0,
      })).filter(m => m.name)
    : [];

  try {
    const result = await suggestExistingItem({ itemDescription: desc, weakLocalMatches: safeWeak });
    if (isDev) {
      console.log(
        `[merchant fallback] desc="${desc.slice(0, 60)}" weakCount=${safeWeak.length} aiMatches=${result.matches.length}`
      );
    }
    return res.json({ source: 'ai-fallback', matches: result.matches });
  } catch (err) {
    console.error('Merchant existing-fallback error:', err.message);
    return res.status(500).json({ error: 'Pricing assistant unavailable. Please try again shortly.' });
  }
});

module.exports = router;
