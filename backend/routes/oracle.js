const { Router } = require('express');
const { queryOracle, queryOracleCreative, sanitiseScripted } = require('../services/oracleService');
const { matchInvocation } = require('../utils/invocationMatcher');
const { db } = require('../db/db');

const router = Router();

const VALID_TONE_MODES = new Set(['oracle', 'dm']);
const MAX_QUESTION_LENGTH = 1000;
const MAX_CONTEXT_LENGTH = 2000;
const MAX_CAMPAIGN_LENGTH = 4000;
const MAX_PARTY_MEMBERS = 12;
const MAX_FILES_PER_MEMBER = 10;
const MAX_MEMBER_FIELD = 200;
const MAX_FILE_TEXT = 500;
const MAX_QUIRK_LENGTH = 500;

function safeStr(val, max) {
  return typeof val === 'string' ? val.trim().slice(0, max) : '';
}

function sanitiseFiles(rawFiles) {
  if (!Array.isArray(rawFiles)) return [];
  return rawFiles
    .slice(0, MAX_FILES_PER_MEMBER)
    .map(f => {
      if (!f || typeof f !== 'object') return null;
      return {
        name: safeStr(f.name, 200),
        type: safeStr(f.type, 100),
        // dataUrl is stripped — only extractedText is needed server-side
        extractedText:
          typeof f.extractedText === 'string'
            ? f.extractedText.trim().slice(0, MAX_FILE_TEXT)
            : null,
      };
    })
    .filter(Boolean);
}

function sanitiseMember(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = safeStr(raw.characterName, MAX_MEMBER_FIELD);
  if (!name) return null;
  return {
    characterName: name,
    playerName: safeStr(raw.playerName, MAX_MEMBER_FIELD),
    class: safeStr(raw.class, MAX_MEMBER_FIELD),
    race: safeStr(raw.race, MAX_MEMBER_FIELD),
    level: raw.level ? String(parseInt(raw.level, 10) || '') : '',
    notes: safeStr(raw.notes, 1000),
    files: sanitiseFiles(raw.files),
  };
}

router.post('/oracle', async (req, res) => {
  const {
    question,
    hiddenContext,
    toneMode,
    sessionName,
    displayName,
    campaignContext,
    campaignId,
    partyMembers,
    oracleQuirkText,
    oracleQuirkIntensity,
    oracleQuirkStyle,
    oraclePersonalityStyle,
  } = req.body;

  if (!question || typeof question !== 'string' || !question.trim()) {
    return res.status(400).json({ error: 'A question is required.' });
  }
  if (question.trim().length > MAX_QUESTION_LENGTH) {
    return res.status(400).json({ error: `Question must be ${MAX_QUESTION_LENGTH} characters or fewer.` });
  }

  const safeContext = safeStr(hiddenContext, MAX_CONTEXT_LENGTH);
  const safeCampaign = safeStr(campaignContext, MAX_CAMPAIGN_LENGTH);
  const mode = VALID_TONE_MODES.has(toneMode) ? toneMode : 'oracle';
  const safeName = safeStr(displayName, 100) || 'Dungeon Master';
  const safeSession = safeStr(sessionName, 100) || 'Current Session';
  const safeParty = Array.isArray(partyMembers)
    ? partyMembers.slice(0, MAX_PARTY_MEMBERS).map(sanitiseMember).filter(Boolean)
    : [];

  const safeQuirkText = safeStr(oracleQuirkText, MAX_QUIRK_LENGTH);
  const intRaw = parseInt(oracleQuirkIntensity, 10);
  const safeQuirkIntensity =
    Number.isInteger(intRaw) && intRaw >= 0 && intRaw <= 4 ? intRaw : 0;
  const styleRaw = parseInt(oracleQuirkStyle, 10);
  const safeQuirkStyle =
    Number.isInteger(styleRaw) && styleRaw >= 0 && styleRaw <= 2 ? styleRaw : 0;
  const personalityRaw = parseInt(oraclePersonalityStyle, 10);
  const safePersonalityStyle =
    Number.isInteger(personalityRaw) && personalityRaw >= 0 && personalityRaw <= 2
      ? personalityRaw
      : 0;

  // ── Scripted invocation check (runs before normal Oracle path) ───────────
  // If a trigger phrase matches, the invocation wins over the standard flow.
  // Disabled invocations are filtered server-side by query.
  if (campaignId && typeof campaignId === 'string') {
    try {
      const invocations = await db('scripted_invocations')
        .where({ campaign_id: campaignId, is_enabled: true })
        .select();

      const match = matchInvocation(question, invocations);
      if (match) {
        if (process.env.NODE_ENV !== 'production') {
          console.log(
            `[Oracle invocation] matched id=${match.id} title="${match.title || '(untitled)'}" mode=${match.mode}`
          );
        }

        if (match.mode === 'scripted') {
          const cleaned = sanitiseScripted(match.content);
          req.app.locals.broadcastOracleResponse?.({
            response: cleaned,
            timestamp: new Date().toISOString(),
            sourceType: 'scripted',
          });
          return res.json({
            response: cleaned,
            invocation: { id: match.id, title: match.title || '', mode: match.mode },
          });
        }

        if (match.mode === 'creative') {
          try {
            const response = await queryOracleCreative({
              instruction: match.content,
              displayName: safeName,
              sessionName: safeSession,
              oraclePersonalityStyle: safePersonalityStyle,
              oracleQuirkText: safeQuirkText,
              oracleQuirkIntensity: safeQuirkIntensity,
              oracleQuirkStyle: safeQuirkStyle,
            });
            req.app.locals.broadcastOracleResponse?.({
              response,
              timestamp: new Date().toISOString(),
              sourceType: 'creative',
            });
            return res.json({
              response,
              invocation: { id: match.id, title: match.title || '', mode: match.mode },
            });
          } catch (err) {
            console.error('Oracle creative invocation error:', err.message);
            return res.status(500).json({ error: 'The Oracle is silent. Please try again shortly.' });
          }
        }
      }
    } catch (err) {
      // Lookup failures should not block normal Oracle flow.
      console.error('Invocation lookup failed:', err.message);
    }
  }

  try {
    const response = await queryOracle({
      question: question.trim(),
      hiddenContext: safeContext,
      campaignContext: safeCampaign,
      partyMembers: safeParty,
      toneMode: mode,
      sessionName: safeSession,
      displayName: safeName,
      oracleQuirkText: safeQuirkText,
      oracleQuirkIntensity: safeQuirkIntensity,
      oracleQuirkStyle: safeQuirkStyle,
      oraclePersonalityStyle: safePersonalityStyle,
    });

    req.app.locals.broadcastOracleResponse?.({
      response,
      timestamp: new Date().toISOString(),
      sourceType: 'normal',
    });

    return res.json({ response });
  } catch (err) {
    console.error('Oracle query error:', err.message);
    return res.status(500).json({ error: 'The Oracle is silent. Please try again shortly.' });
  }
});

module.exports = router;
