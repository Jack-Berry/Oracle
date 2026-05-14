exports.up = async function(knex) {
  await knex.schema.table('campaigns', t => {
    t.integer('oracle_quirk_style').notNullable().defaultTo(0);
  });
};

exports.down = async function(knex) {
  await knex.schema.table('campaigns', t => {
    t.dropColumn('oracle_quirk_style');
  });
};
