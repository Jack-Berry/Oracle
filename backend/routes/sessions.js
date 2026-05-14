const express = require('express');
const router = express.Router();
const { db } = require('../db/db');

const MAX_CONSULTATIONS_PER_SESSION = 200;

async function trimConsultations(sessionId) {
  await db.raw(
    `DELETE FROM consultations
     WHERE session_id = ?
       AND id NOT IN (
         SELECT id FROM consultations
         WHERE session_id = ?
         ORDER BY created_at DESC
         LIMIT ?
       )`,
    [sessionId, sessionId, MAX_CONSULTATIONS_PER_SESSION]
  );
}

// POST /api/campaigns/:cid/sessions/upsert  — get or create session by name
router.post('/campaigns/:cid/sessions/upsert', async (req, res) => {
  try {
    const { name = 'default' } = req.body;
    const sessionName = String(name).slice(0, 200);
    const campaignId = req.params.cid;

    let session = await db('sessions')
      .where({ campaign_id: campaignId, name: sessionName })
      .first();

    if (!session) {
      const [row] = await db('sessions')
        .insert({ campaign_id: campaignId, name: sessionName })
        .returning('*');
      session = row;
    }

    res.json({
      id: session.id,
      name: session.name,
      hiddenContext: session.hidden_context,
    });
  } catch (err) {
    console.error('POST /sessions/upsert', err.message);
    res.status(500).json({ error: 'Failed to resolve session.' });
  }
});

// PATCH /api/sessions/:id/hidden-context
router.patch('/sessions/:id/hidden-context', async (req, res) => {
  try {
    const { hiddenContext = '' } = req.body;
    await db('sessions')
      .where({ id: req.params.id })
      .update({ hidden_context: String(hiddenContext).slice(0, 8000), updated_at: new Date() });
    res.json({ ok: true });
  } catch (err) {
    console.error('PATCH /hidden-context', err.message);
    res.status(500).json({ error: 'Failed to update hidden context.' });
  }
});

// GET /api/sessions/:id/consultations  — most recent 50
router.get('/sessions/:id/consultations', async (req, res) => {
  try {
    const rows = await db('consultations')
      .where({ session_id: req.params.id })
      .orderBy('created_at', 'desc')
      .limit(50)
      .select();

    res.json(rows.map(r => ({
      id: r.id,
      question: r.question,
      response: r.response,
      toneMode: r.tone_mode,
      timestamp: r.created_at,
    })));
  } catch (err) {
    console.error('GET /consultations', err.message);
    res.status(500).json({ error: 'Failed to load consultations.' });
  }
});

// POST /api/sessions/:id/consultations  — save a consultation
router.post('/sessions/:id/consultations', async (req, res) => {
  try {
    const { question, response, toneMode = 'oracle', timestamp } = req.body;
    if (!question || !response) return res.status(400).json({ error: 'question and response required.' });

    const [row] = await db('consultations')
      .insert({
        session_id: req.params.id,
        question:   String(question).slice(0, 4000),
        response:   String(response).slice(0, 4000),
        tone_mode:  String(toneMode).slice(0, 20),
        created_at: timestamp ? new Date(timestamp) : new Date(),
      })
      .returning('id');

    // Fire-and-forget trim; never fail the request over housekeeping.
    trimConsultations(req.params.id).catch(err =>
      console.error('trimConsultations:', err.message)
    );

    res.status(201).json({ id: row.id || row });
  } catch (err) {
    console.error('POST /consultations', err.message);
    res.status(500).json({ error: 'Failed to save consultation.' });
  }
});

// DELETE /api/sessions/:id/consultations  — clear all for session
router.delete('/sessions/:id/consultations', async (req, res) => {
  try {
    await db('consultations').where({ session_id: req.params.id }).delete();
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /consultations', err.message);
    res.status(500).json({ error: 'Failed to clear consultations.' });
  }
});

module.exports = router;
