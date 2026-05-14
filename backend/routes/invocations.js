const express = require('express');
const router = express.Router();
const { db } = require('../db/db');
const { queryOracleCreative, sanitiseScripted } = require('../services/oracleService');

const MAX_TITLE = 100;
const MAX_TRIGGER = 300;
const MAX_CONTENT = 2000;
const VALID_MODES = new Set(['scripted', 'creative']);
const isDev = process.env.NODE_ENV !== 'production';

function rowToApi(row) {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    title: row.title || '',
    triggerPhrase: row.trigger_phrase,
    mode: row.mode,
    content: row.content,
    isEnabled: !!row.is_enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function buildPatch(body) {
  const patch = {};
  if (body.title !== undefined) {
    patch.title = String(body.title).slice(0, MAX_TITLE);
  }
  if (body.triggerPhrase !== undefined) {
    const t = String(body.triggerPhrase).trim();
    if (!t) return { error: 'triggerPhrase cannot be empty.' };
    patch.trigger_phrase = t.slice(0, MAX_TRIGGER);
  }
  if (body.mode !== undefined) {
    const m = String(body.mode);
    if (!VALID_MODES.has(m)) return { error: 'mode must be "scripted" or "creative".' };
    patch.mode = m;
  }
  if (body.content !== undefined) {
    const c = String(body.content);
    if (!c.trim()) return { error: 'content cannot be empty.' };
    patch.content = c.slice(0, MAX_CONTENT);
  }
  if (body.isEnabled !== undefined) {
    patch.is_enabled = !!body.isEnabled;
  }
  return { patch };
}

// GET /api/campaigns/:cid/invocations  — list
router.get('/campaigns/:cid/invocations', async (req, res) => {
  try {
    const rows = await db('scripted_invocations')
      .where({ campaign_id: req.params.cid })
      .orderBy('updated_at', 'desc')
      .select();
    res.json(rows.map(rowToApi));
  } catch (err) {
    console.error('GET /invocations', err.message);
    res.status(500).json({ error: 'Failed to load invocations.' });
  }
});

// POST /api/campaigns/:cid/invocations  — create
router.post('/campaigns/:cid/invocations', async (req, res) => {
  try {
    const { triggerPhrase, content, mode = 'scripted', title = '', isEnabled = true } = req.body;

    const trigger = String(triggerPhrase || '').trim();
    const body = String(content || '');
    if (!trigger) return res.status(400).json({ error: 'triggerPhrase is required.' });
    if (!body.trim()) return res.status(400).json({ error: 'content is required.' });
    if (!VALID_MODES.has(String(mode))) {
      return res.status(400).json({ error: 'mode must be "scripted" or "creative".' });
    }

    const [row] = await db('scripted_invocations')
      .insert({
        campaign_id:    req.params.cid,
        title:          String(title).slice(0, MAX_TITLE),
        trigger_phrase: trigger.slice(0, MAX_TRIGGER),
        mode:           String(mode),
        content:        body.slice(0, MAX_CONTENT),
        is_enabled:     !!isEnabled,
      })
      .returning('*');

    res.status(201).json(rowToApi(row));
  } catch (err) {
    console.error('POST /invocations', err.message);
    res.status(500).json({ error: 'Failed to create invocation.' });
  }
});

// PATCH /api/invocations/:id  — update
router.patch('/invocations/:id', async (req, res) => {
  try {
    const { patch, error } = buildPatch(req.body);
    if (error) return res.status(400).json({ error });
    if (!Object.keys(patch).length) return res.json({ ok: true });

    patch.updated_at = new Date();
    const [row] = await db('scripted_invocations')
      .where({ id: req.params.id })
      .update(patch)
      .returning('*');

    if (!row) return res.status(404).json({ error: 'Invocation not found.' });
    res.json(rowToApi(row));
  } catch (err) {
    console.error('PATCH /invocations/:id', err.message);
    res.status(500).json({ error: 'Failed to update invocation.' });
  }
});

// POST /api/invocations/:id/trigger  — fire a scripted/creative invocation by id
// Used by controller-friendly buttons so the DM doesn't have to type/speak the
// trigger phrase. Reads quirk + personality from the owning campaign so all
// devices share the same Oracle voice. Broadcasts oracle_response on success.
router.post('/invocations/:id/trigger', async (req, res) => {
  if (isDev) console.log(`[invocation] trigger endpoint hit id=${req.params.id}`);
  try {
    const inv = await db('scripted_invocations').where({ id: req.params.id }).first();
    if (!inv) return res.status(404).json({ error: 'Invocation not found.' });
    if (!inv.is_enabled) return res.status(400).json({ error: 'Invocation is disabled.' });

    const camp = await db('campaigns').where({ id: inv.campaign_id }).first();
    if (!camp) return res.status(404).json({ error: 'Owning campaign not found.' });

    const sessionName = String(req.body?.sessionName || '').slice(0, 100) || 'Current Session';
    const displayName = String(req.body?.displayName || '').slice(0, 100) || 'Dungeon Master';

    if (isDev) {
      console.log(
        `[invocation] matched id=${inv.id} title="${inv.title || '(untitled)'}" mode=${inv.mode}`
      );
    }

    const broadcast = req.app.locals.broadcastOracleResponse;

    if (inv.mode === 'scripted') {
      const cleaned = sanitiseScripted(inv.content);
      if (isDev) console.log(`[invocation] broadcasting scripted response id=${inv.id}`);
      broadcast?.({
        response: cleaned,
        timestamp: new Date().toISOString(),
        sourceType: 'scripted',
      });
      return res.json({
        response: cleaned,
        invocation: { id: inv.id, title: inv.title || '', mode: inv.mode },
      });
    }

    if (inv.mode === 'creative') {
      try {
        const response = await queryOracleCreative({
          instruction: inv.content,
          displayName,
          sessionName,
          oraclePersonalityStyle: camp.oracle_personality_style || 0,
          oracleQuirkText: camp.oracle_quirk_text || '',
          oracleQuirkIntensity: camp.oracle_quirk_intensity || 0,
          oracleQuirkStyle: camp.oracle_quirk_style || 0,
        });
        if (isDev) console.log(`[invocation] broadcasting creative response id=${inv.id}`);
        broadcast?.({
          response,
          timestamp: new Date().toISOString(),
          sourceType: 'creative',
        });
        return res.json({
          response,
          invocation: { id: inv.id, title: inv.title || '', mode: inv.mode },
        });
      } catch (err) {
        console.error('POST /invocations/:id/trigger creative:', err.message);
        return res.status(500).json({ error: 'The Oracle is silent. Please try again shortly.' });
      }
    }

    return res.status(400).json({ error: 'Unknown invocation mode.' });
  } catch (err) {
    console.error('POST /invocations/:id/trigger', err.message);
    return res.status(500).json({ error: 'Failed to trigger invocation.' });
  }
});

// DELETE /api/invocations/:id  — delete
router.delete('/invocations/:id', async (req, res) => {
  try {
    await db('scripted_invocations').where({ id: req.params.id }).delete();
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /invocations/:id', err.message);
    res.status(500).json({ error: 'Failed to delete invocation.' });
  }
});

module.exports = router;
