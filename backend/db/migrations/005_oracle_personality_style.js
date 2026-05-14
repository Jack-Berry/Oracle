exports.up = async function(knex) {
  await knex.schema.table('campaigns', t => {
    t.integer('oracle_personality_style').notNullable().defaultTo(0);
  });
};

exports.down = async function(knex) {
  await knex.schema.table('campaigns', t => {
    t.dropColumn('oracle_personality_style');
  });
};
