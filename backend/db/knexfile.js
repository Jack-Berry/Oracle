require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const path = require('path');

const isProd = process.env.NODE_ENV === 'production';

// Neon (and most managed Postgres) requires SSL. Verifying the certificate
// chain is unnecessary for our use case and complicates Neon pooler / pgBouncer
// endpoints, so we accept the server cert without strict CA validation. In
// development we leave SSL off so a plain local Postgres works.
const ssl = isProd ? { rejectUnauthorized: false } : false;

function buildConnection() {
  // DATABASE_URL is the standard form on Render / Railway / Neon. When set it
  // wins over the discrete DB_* vars — that way the prod env stays a single
  // secret. Neon's pooled connection string is also valid here (it just looks
  // like postgresql://...@ep-foo-pooler.../db?sslmode=require) and works
  // without any extra config because we already set `ssl` below.
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl,
    };
  }

  // Local-dev fallback. Matches the historical .env shape.
  return {
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME     || 'oracle',
    user:     process.env.DB_USER     || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl,
  };
}

module.exports = {
  client: 'postgresql',
  connection: buildConnection(),
  // Neon's free tier and most serverless Postgres plans have low per-role
  // connection caps. min=0 lets the pool fully release during idle periods so
  // Neon can suspend; max=5 keeps headroom for a single backend instance.
  pool: { min: 0, max: 5 },
  migrations: {
    directory: path.join(__dirname, 'migrations'),
    tableName: 'knex_migrations',
  },
};
