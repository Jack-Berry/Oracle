const express = require('express');
const router = express.Router();
const { db } = require('../db/db');

// POST /api/campaigns/:cid/members  — add party member
router.post('/campaigns/:cid/members', async (req, res) => {
  try {
    const { characterName, playerName = '', class: cls = '', race = '', level, notes = '' } = req.body;
    if (!characterName?.trim()) return res.status(400).json({ error: 'characterName required.' });

    const count = await db('party_members').where({ campaign_id: req.params.cid }).count('id as n').first();
    const sortOrder = parseInt(count.n, 10) || 0;

    const [row] = await db('party_members')
      .insert({
        campaign_id:    req.params.cid,
        character_name: String(characterName).trim().slice(0, 80),
        player_name:    String(playerName).slice(0, 80),
        class:          String(cls).slice(0, 80),
        race:           String(race).slice(0, 80),
        level:          level ? parseInt(level, 10) || null : null,
        notes:          String(notes).slice(0, 4000),
        sort_order:     sortOrder,
      })
      .returning('*');

    res.status(201).json({ id: row.id });
  } catch (err) {
    console.error('POST /members', err.message);
    res.status(500).json({ error: 'Failed to add member.' });
  }
});

// PATCH /api/members/:id  — update party member fields
router.patch('/members/:id', async (req, res) => {
  try {
    const { characterName, playerName, class: cls, race, level, notes } = req.body;
    const patch = {};
    if (characterName !== undefined) patch.character_name = String(characterName).trim().slice(0, 80);
    if (playerName    !== undefined) patch.player_name    = String(playerName).slice(0, 80);
    if (cls           !== undefined) patch.class          = String(cls).slice(0, 80);
    if (race          !== undefined) patch.race           = String(race).slice(0, 80);
    if (level         !== undefined) patch.level          = level ? parseInt(level, 10) || null : null;
    if (notes         !== undefined) patch.notes          = String(notes).slice(0, 4000);
    if (!Object.keys(patch).length)  return res.json({ ok: true });

    patch.updated_at = new Date();
    await db('party_members').where({ id: req.params.id }).update(patch);
    res.json({ ok: true });
  } catch (err) {
    console.error('PATCH /members/:id', err.message);
    res.status(500).json({ error: 'Failed to update member.' });
  }
});

// DELETE /api/members/:id  — remove party member (cascades char data)
router.delete('/members/:id', async (req, res) => {
  try {
    await db('party_members').where({ id: req.params.id }).delete();
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /members/:id', err.message);
    res.status(500).json({ error: 'Failed to delete member.' });
  }
});

// POST /api/members/:id/files  — attach character data file
router.post('/members/:id/files', async (req, res) => {
  try {
    const { fileName, fileType = '', extractedText, extractedCharacter } = req.body;
    if (!fileName?.trim()) return res.status(400).json({ error: 'fileName required.' });

    const [row] = await db('character_data')
      .insert({
        member_id:      req.params.id,
        file_name:      String(fileName).slice(0, 200),
        file_type:      String(fileType).slice(0, 100),
        character_json: extractedCharacter || null,
        summary_text:   String(extractedText || ''),
      })
      .returning('id');

    res.status(201).json({ id: row.id || row });
  } catch (err) {
    console.error('POST /files', err.message);
    res.status(500).json({ error: 'Failed to attach file.' });
  }
});

// DELETE /api/files/:id  — remove character data record
router.delete('/files/:id', async (req, res) => {
  try {
    await db('character_data').where({ id: req.params.id }).delete();
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /files/:id', err.message);
    res.status(500).json({ error: 'Failed to remove file.' });
  }
});

module.exports = router;
