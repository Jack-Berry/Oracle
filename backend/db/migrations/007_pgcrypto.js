// Ensure the pgcrypto extension is available. UUID primary keys defined in
// 001_initial.js use gen_random_uuid(), which lives in pgcrypto. The runtime
// pre-hook in db.js handles fresh-DB bootstrap (since this migration would
// otherwise run after 001); this file records pgcrypto as a documented
// schema dependency so it stays explicit in migration history.
exports.up = async function(knex) {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS pgcrypto');
};

exports.down = async function() {
  // Intentionally a no-op. Other migrations rely on gen_random_uuid();
  // dropping pgcrypto here would break the schema on rollback.
};
