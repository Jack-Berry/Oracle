require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

module.exports = {
  client: 'postgresql',
  connection: {
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME     || 'oracle',
    user:     process.env.DB_USER     || 'postgres',
    password: process.env.DB_PASSWORD || '',
  },
  migrations: {
    directory: require('path').join(__dirname, 'migrations'),
    tableName: 'knex_migrations',
  },
};
