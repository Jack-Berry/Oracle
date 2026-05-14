// Composite indexes for hot query patterns identified in the audit.
//
//  - consultations: every session read is
//      WHERE session_id = ? ORDER BY created_at DESC
//    A (session_id, created_at DESC) btree serves both the predicate
//    and the sort without a secondary heap sort.
//
//  - scripted_invocations: every Oracle question runs
//      WHERE campaign_id = ? AND is_enabled = true
//    A composite on (campaign_id, is_enabled) keeps the filter tight.
//
// Raw SQL is used so the DESC ordering can be specified — Knex's schema
// builder does not expose per-column index direction. IF NOT EXISTS keeps
// the migration safe to re-run against any DB state.

exports.up = async function(knex) {
  await knex.raw(
    'CREATE INDEX IF NOT EXISTS idx_consultations_session_id_created_at '
    + 'ON consultations (session_id, created_at DESC)'
  );
  await knex.raw(
    'CREATE INDEX IF NOT EXISTS idx_scripted_invocations_campaign_id_is_enabled '
    + 'ON scripted_invocations (campaign_id, is_enabled)'
  );
};

exports.down = async function(knex) {
  await knex.raw('DROP INDEX IF EXISTS idx_scripted_invocations_campaign_id_is_enabled');
  await knex.raw('DROP INDEX IF EXISTS idx_consultations_session_id_created_at');
};
