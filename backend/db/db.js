const knex = require('knex');
const config = require('./knexfile');

const db = knex(config);

async function runMigrations() {
  // pgcrypto provides gen_random_uuid(), which 001_initial.js uses as a
  // UUID column default. Create it before migrations run so fresh DBs
  // bootstrap cleanly. Idempotent — no-op if already enabled.
  await db.raw('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  await db.migrate.latest();
}

module.exports = { db, runMigrations };
