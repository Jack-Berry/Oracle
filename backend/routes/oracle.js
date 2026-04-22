const { Router } = require('express');
const { queryOracle } = require('../services/oracleService');

const router = Router();

const VALID_TONE_MODES = new Set(['oracle', 'dm']);
const MAX_QUESTION_LENGTH = 1000;
const MAX_CONTEXT_LENGTH = 2000;

router.post('/oracle', async (req, res) => {
  const { question, hiddenContext, toneMode, sessionName, displayName } = req.body;

  if (!question || typeof question !== 'string' || !question.trim()) {
    return res.status(400).json({ error: 'A question is required.' });
  }
  if (question.trim().length > MAX_QUESTION_LENGTH) {
    return res.status(400).json({ error: `Question must be ${MAX_QUESTION_LENGTH} characters or fewer.` });
  }

  const safeContext = typeof hiddenContext === 'string'
    ? hiddenContext.trim().slice(0, MAX_CONTEXT_LENGTH)
    : '';

  const mode = VALID_TONE_MODES.has(toneMode) ? toneMode : 'oracle';
  const safeName = typeof displayName === 'string' ? displayName.trim() : 'Dungeon Master';
  const safeSession = typeof sessionName === 'string' ? sessionName.trim() : 'Current Session';

  try {
    const response = await queryOracle({
      question: question.trim(),
      hiddenContext: safeContext,
      toneMode: mode,
      sessionName: safeSession,
      displayName: safeName,
    });

    return res.json({ response });
  } catch (err) {
    console.error('Oracle query error:', err.message);
    return res.status(500).json({ error: 'The Oracle is silent. Please try again shortly.' });
  }
});

module.exports = router;
