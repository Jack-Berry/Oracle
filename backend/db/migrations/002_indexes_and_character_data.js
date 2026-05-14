exports.up = async function(knex) {
  // ── 1. Indexes on FK / hot-path columns ─────────────────────────────────────
  await knex.schema.table('sessions', t => {
    t.index('campaign_id', 'idx_sessions_campaign_id');
  });
  await knex.schema.table('party_members', t => {
    t.index('campaign_id', 'idx_party_members_campaign_id');
  });
  await knex.schema.table('character_data', t => {
    t.index('member_id', 'idx_character_data_member_id');
  });
  await knex.schema.table('consultations', t => {
    t.index('session_id', 'idx_consultations_session_id');
  });

  // ── 2. Split character_data.data into dedicated columns ──────────────────────
  // Add the new columns first (nullable so the backfill can run before constraints).
  await knex.schema.table('character_data', t => {
    t.jsonb('character_json').nullable();
    t.text('summary_text').notNullable().defaultTo('');
  });

  // Backfill from the old generic blob.
  await knex.raw(`
    UPDATE character_data
    SET
      character_json = data -> 'extractedCharacter',
      summary_text   = COALESCE(data ->> 'extractedText', '')
    WHERE data IS NOT NULL
  `);

  // Drop the old blob column now that data is in the typed columns.
  await knex.schema.table('character_data', t => {
    t.dropColumn('data');
  });
};

exports.down = async function(knex) {
  // Re-add the old blob (nullable — we cannot guarantee NOT NULL on rollback).
  await knex.schema.table('character_data', t => {
    t.jsonb('data').nullable();
  });

  await knex.raw(`
    UPDATE character_data
    SET data = jsonb_build_object(
      'extractedCharacter', character_json,
      'extractedText',      summary_text
    )
  `);

  await knex.schema.table('character_data', t => {
    t.dropColumn('summary_text');
    t.dropColumn('character_json');
  });

  // Drop indexes
  await knex.schema.table('consultations', t => {
    t.dropIndex('session_id', 'idx_consultations_session_id');
  });
  await knex.schema.table('character_data', t => {
    t.dropIndex('member_id', 'idx_character_data_member_id');
  });
  await knex.schema.table('party_members', t => {
    t.dropIndex('campaign_id', 'idx_party_members_campaign_id');
  });
  await knex.schema.table('sessions', t => {
    t.dropIndex('campaign_id', 'idx_sessions_campaign_id');
  });
};
