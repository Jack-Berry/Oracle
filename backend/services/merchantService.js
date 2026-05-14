const Anthropic = require('@anthropic-ai/sdk');

const MODEL = process.env.MERCHANT_MODEL || process.env.ORACLE_MODEL || 'claude-haiku-4-5';

function getApiKey() {
  const key = process.env.ANTHROPIC_API_KEY || process.env['Anthropic-API-Key'];
  if (!key) throw new Error('Anthropic API key not configured. Set ANTHROPIC_API_KEY in .env');
  return key;
}

let _client = null;
function getClient() {
  if (!_client) _client = new Anthropic({ apiKey: getApiKey() });
  return _client;
}

const EXISTING_FALLBACK_PROMPT = `You are a practical D&D 5e merchant/equipment assistant helping a DM identify and price common 5e items.

Given a player or DM description, return the closest matching standard 5e/SRD items. Examples:
- "health potion" → "Potion of Healing" (50 gp)
- "lock picks" → "Thieves' tools" (25 gp)
- "rope 50ft" → "Rope, hempen (50 feet)" (1 gp)
- "warrior's chain" → likely "Chain mail" (75 gp) or "Chain shirt" (50 gp)

Rules:
- Prefer canonical SRD/5e names (longsword 15 gp, plate armor 1500 gp,
  potion of healing 50 gp, riding horse 75 gp).
- Return 1–3 best candidates, most likely first.
- Resale rule of thumb: mundane 50%, trade goods ~95%, services no resale,
  potions/consumables 50%, magic items based on rarity.
- Confidence is your judged likelihood the candidate matches the user's intent
  (0–100 integer).
- reasoning is at most 1 short sentence per match.
- Output VALID JSON only, no commentary, exactly this shape:
  {
    "matches": [
      {
        "name": string,
        "category": string,
        "confidence": number,
        "purchasePriceGp": number,
        "sellingPriceGp": number,
        "reasoning": string
      }
    ]
  }

Output only the JSON object.`;

const SYSTEM_PROMPT = `You are a practical pricing assistant for a D&D 5e Dungeon Master.

You estimate sensible gold-piece prices for player-described or DM-created items.

Rules:
- Anchor on standard 5e economy (mundane longsword 15 gp, plate armor 1500 gp,
  potion of healing 50 gp, riding horse 75 gp, common inn stay 0.5 gp/day).
- For mundane items, resale is roughly 50% of purchase.
- For trade goods (raw materials), resale is roughly 95% of purchase.
- For magic items, anchor on rarity: common ~100 gp, uncommon ~500 gp,
  rare ~5000 gp, very rare ~50000 gp, legendary ~500000+ gp. Adjust within
  the band for power.
- If the item is unclear, give a conservative midpoint.
- Output VALID JSON only, no commentary, matching exactly this shape:
  {
    "itemName": string,
    "purchasePriceGp": number,
    "sellingPriceGp": number,
    "rarityOrCategory": string,
    "reasoning": string
  }
- itemName is a short canonical-ish name (max 80 chars).
- purchasePriceGp and sellingPriceGp are numbers in gold pieces (gp). Fractions are fine.
- rarityOrCategory is one of: mundane, trade-good, common, uncommon, rare, very rare, legendary, artifact, service, or a short category label.
- reasoning is at most 2 sentences explaining the estimate. No personality, no theatrics.

Output only the JSON object.`;

function extractJson(text) {
  if (!text) return null;
  const trimmed = String(text).trim();
  // Try direct parse first
  try { return JSON.parse(trimmed); } catch {}
  // Fall back: find first {...} block
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const slice = trimmed.slice(start, end + 1);
    try { return JSON.parse(slice); } catch {}
  }
  return null;
}

function clampNum(n, min, max) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(min, Math.min(max, v));
}

function safeString(s, max) {
  if (typeof s !== 'string') return '';
  return s.replace(/\s+/g, ' ').trim().slice(0, max);
}

async function estimateCustomItem({ itemDescription }) {
  const client = getClient();

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 400,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Item description: ${String(itemDescription).slice(0, 500)}\n\nReturn the JSON pricing estimate now.`,
      },
    ],
  });

  const block = message.content.find(b => b.type === 'text');
  if (!block) throw new Error('No text response from model');

  const parsed = extractJson(block.text);

  if (!parsed || typeof parsed !== 'object') {
    // Graceful fallback: surface the raw reasoning, conservative pricing.
    return {
      itemName: safeString(itemDescription, 80) || 'Custom item',
      purchasePriceGp: 0,
      sellingPriceGp: 0,
      rarityOrCategory: 'unknown',
      reasoning: 'Could not parse a structured price. Try a shorter description, or use the existing item lookup.',
    };
  }

  const purchase = clampNum(parsed.purchasePriceGp, 0, 10_000_000);
  let sell = Number(parsed.sellingPriceGp);
  if (!Number.isFinite(sell) || sell < 0) sell = purchase * 0.5;
  sell = clampNum(sell, 0, purchase * 1.05); // never above purchase by much

  return {
    itemName: safeString(parsed.itemName, 80) || safeString(itemDescription, 80) || 'Custom item',
    purchasePriceGp: Math.round(purchase * 100) / 100,
    sellingPriceGp: Math.round(sell * 100) / 100,
    rarityOrCategory: safeString(parsed.rarityOrCategory, 40) || 'unknown',
    reasoning: safeString(parsed.reasoning, 400),
  };
}

async function suggestExistingItem({ itemDescription, weakLocalMatches }) {
  const client = getClient();

  let userContent = `Item description: ${String(itemDescription).slice(0, 500)}`;
  if (Array.isArray(weakLocalMatches) && weakLocalMatches.length > 0) {
    const weakList = weakLocalMatches
      .slice(0, 5)
      .map(m => `- ${m.name} (${m.category || 'unknown'}, local confidence ${m.confidence ?? '?'}%)`)
      .join('\n');
    userContent += `\n\nLocal lookup found these weak candidates — only use if they really fit, otherwise propose better-known 5e items:\n${weakList}`;
  }
  userContent += '\n\nReturn the JSON now.';

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 500,
    system: EXISTING_FALLBACK_PROMPT,
    messages: [{ role: 'user', content: userContent }],
  });

  const block = message.content.find(b => b.type === 'text');
  if (!block) throw new Error('No text response from model');

  const parsed = extractJson(block.text);

  if (!parsed || !Array.isArray(parsed.matches)) {
    return { matches: [] };
  }

  const cleaned = parsed.matches
    .slice(0, 5)
    .map((m) => {
      const purchase = clampNum(m.purchasePriceGp, 0, 10_000_000);
      let sell = Number(m.sellingPriceGp);
      if (!Number.isFinite(sell) || sell < 0) sell = purchase * 0.5;
      sell = clampNum(sell, 0, purchase * 1.05);
      const confidenceRaw = Number(m.confidence);
      const confidence = Number.isFinite(confidenceRaw)
        ? Math.max(0, Math.min(100, Math.round(confidenceRaw)))
        : 0;
      return {
        name: safeString(m.name, 80),
        category: safeString(m.category, 40) || 'unknown',
        confidence,
        purchasePriceGp: Math.round(purchase * 100) / 100,
        sellingPriceGp: Math.round(sell * 100) / 100,
        reasoning: safeString(m.reasoning, 240),
      };
    })
    .filter(m => m.name);

  return { matches: cleaned };
}

module.exports = { estimateCustomItem, suggestExistingItem };
