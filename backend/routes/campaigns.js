const express = require('express');
const router = express.Router();
const { db } = require('../db/db');

const isDev = process.env.NODE_ENV !== 'production';

async function loadCampaignWithMembers(campaignId) {
  const campaign = await db('campaigns').where({ id: campaignId }).first();
  if (!campaign) return null;

  const members = await db('party_members')
    .where({ campaign_id: campaignId })
    .orderBy('sort_order')
    .select();

  const memberIds = members.map(m => m.id);
  const charData = memberIds.length
    ? await db('character_data').whereIn('member_id', memberIds).select()
    : [];

  const membersWithFiles = members.map(m => ({
    id: m.id,
    characterName: m.character_name,
    playerName: m.player_name,
    class: m.class,
    race: m.race,
    level: m.level,
    notes: m.notes,
    files: charData
      .filter(cd => cd.member_id === m.id)
      .map(cd => ({
        id: cd.id,
        name: cd.file_name,
        type: cd.file_type,
        extractedText:      cd.summary_text   || null,
        extractedCharacter: cd.character_json || null,
      })),
  }));

  return {
    id: campaign.id,
    displayName: campaign.display_name,
    campaignContext: campaign.campaign_context,
    oracleQuirkText: campaign.oracle_quirk_text || '',
    oracleQuirkIntensity: campaign.oracle_quirk_intensity || 0,
    oracleQuirkStyle: campaign.oracle_quirk_style || 0,
    oraclePersonalityStyle: campaign.oracle_personality_style || 0,
    partyMembers: membersWithFiles,
  };
}

// GET /api/campaigns/default
// Returns the shared default campaign so every device on the LAN converges on
// the same data without depending on per-browser localStorage. Creates one on
// first call. Defined BEFORE /campaigns/:id so "default" isn't matched as an id.
router.get('/campaigns/default', async (req, res) => {
  try {
    let campaign = await db('campaigns').orderBy('created_at', 'asc').first();
    let created = false;

    if (!campaign) {
      const [row] = await db('campaigns')
        .insert({ display_name: 'Shared Campaign' })
        .returning('*');
      campaign = typeof row === 'object' ? row : { id: row };
      created = true;
    }

    const cid = campaign.id;
    const data = await loadCampaignWithMembers(cid);

    if (isDev) {
      console.log(
        `[campaign] default ${created ? 'created' : 'reused'} id=${cid}`
      );
    }

    res.json(data);
  } catch (err) {
    console.error('GET /campaigns/default', err.message);
    res.status(500).json({ error: 'Failed to load default campaign.' });
  }
});

// GET /api/campaigns/:id  — fetch campaign + party members + character_data
router.get('/campaigns/:id', async (req, res) => {
  try {
    const data = await loadCampaignWithMembers(req.params.id);
    if (!data) return res.status(404).json({ error: 'Campaign not found.' });
    res.json(data);
  } catch (err) {
    console.error('GET /campaigns/:id', err.message);
    res.status(500).json({ error: 'Failed to load campaign.' });
  }
});

// POST /api/campaigns  — create a new campaign, returns { id }
router.post('/campaigns', async (req, res) => {
  try {
    const { displayName = '' } = req.body;
    const [row] = await db('campaigns')
      .insert({ display_name: String(displayName).slice(0, 120) })
      .returning('id');
    res.status(201).json({ id: row.id || row });
  } catch (err) {
    console.error('POST /campaigns', err.message);
    res.status(500).json({ error: 'Failed to create campaign.' });
  }
});

// PATCH /api/campaigns/:id  — update display_name, campaign_context, or oracle quirk
router.patch('/campaigns/:id', async (req, res) => {
  try {
    const {
      displayName,
      campaignContext,
      oracleQuirkText,
      oracleQuirkIntensity,
      oracleQuirkStyle,
      oraclePersonalityStyle,
    } = req.body;
    const patch = {};
    if (displayName !== undefined) patch.display_name = String(displayName).slice(0, 120);
    if (campaignContext !== undefined) patch.campaign_context = String(campaignContext).slice(0, 8000);
    if (oracleQuirkText !== undefined) {
      patch.oracle_quirk_text = String(oracleQuirkText).slice(0, 500);
    }
    if (oracleQuirkIntensity !== undefined) {
      const n = parseInt(oracleQuirkIntensity, 10);
      patch.oracle_quirk_intensity = Number.isInteger(n) && n >= 0 && n <= 4 ? n : 0;
    }
    if (oracleQuirkStyle !== undefined) {
      const n = parseInt(oracleQuirkStyle, 10);
      patch.oracle_quirk_style = Number.isInteger(n) && n >= 0 && n <= 2 ? n : 0;
    }
    if (oraclePersonalityStyle !== undefined) {
      const n = parseInt(oraclePersonalityStyle, 10);
      patch.oracle_personality_style = Number.isInteger(n) && n >= 0 && n <= 2 ? n : 0;
    }
    if (!Object.keys(patch).length) return res.json({ ok: true });

    patch.updated_at = new Date();
    await db('campaigns').where({ id: req.params.id }).update(patch);
    res.json({ ok: true });
  } catch (err) {
    console.error('PATCH /campaigns/:id', err.message);
    res.status(500).json({ error: 'Failed to update campaign.' });
  }
});

// POST /api/campaigns/migrate  — one-shot localStorage → DB migration
router.post('/campaigns/migrate', async (req, res) => {
  const {
    displayName = '',
    campaignContext = '',
    partyMembers = [],
    sessions = [],
  } = req.body;

  let campaignId;

  try {
    await db.transaction(async trx => {
      // Campaign
      const [campRow] = await trx('campaigns')
        .insert({
          display_name:     String(displayName).slice(0, 120),
          campaign_context: String(campaignContext).slice(0, 8000),
        })
        .returning('id');
      campaignId = campRow.id || campRow;

      // Party members
      for (let i = 0; i < partyMembers.length; i++) {
        const m = partyMembers[i];
        const [memberRow] = await trx('party_members')
          .insert({
            campaign_id:    campaignId,
            character_name: String(m.characterName || '').slice(0, 80),
            player_name:    String(m.playerName || '').slice(0, 80),
            class:          String(m.class || '').slice(0, 80),
            race:           String(m.race || '').slice(0, 80),
            level:          m.level ? parseInt(m.level, 10) || null : null,
            notes:          String(m.notes || '').slice(0, 4000),
            sort_order:     i,
          })
          .returning('id');
        const memberId = memberRow.id || memberRow;

        for (const f of (m.files || [])) {
          if (!f.extractedText && !f.extractedCharacter) continue;
          await trx('character_data').insert({
            member_id:      memberId,
            file_name:      String(f.name || '').slice(0, 200),
            file_type:      String(f.type || '').slice(0, 100),
            character_json: f.extractedCharacter || null,
            summary_text:   String(f.extractedText || ''),
          });
        }
      }

      // Sessions + consultations
      for (const s of sessions) {
        const [sessRow] = await trx('sessions')
          .insert({
            campaign_id:    campaignId,
            name:           String(s.name || 'default').slice(0, 200),
            hidden_context: String(s.hiddenContext || '').slice(0, 8000),
          })
          .returning('id');
        const sessionId = sessRow.id || sessRow;

        for (const c of (s.consultations || [])) {
          await trx('consultations').insert({
            session_id: sessionId,
            question:   String(c.question || '').slice(0, 4000),
            response:   String(c.response || '').slice(0, 4000),
            tone_mode:  String(c.toneMode || 'oracle').slice(0, 20),
            created_at: c.timestamp ? new Date(c.timestamp) : new Date(),
          });
        }
      }
      // Transaction commits here — response is sent after, outside this block.
    });

    res.status(201).json({ campaignId });
  } catch (err) {
    console.error('POST /campaigns/migrate', err.message);
    res.status(500).json({ error: 'Migration failed.' });
  }
});

module.exports = router;
