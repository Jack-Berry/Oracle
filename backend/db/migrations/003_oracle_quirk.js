exports.up = async function(knex) {
  await knex.schema.table('campaigns', t => {
    t.text('oracle_quirk_text').notNullable().defaultTo('');
    t.integer('oracle_quirk_intensity').notNullable().defaultTo(0);
  });
};

exports.down = async function(knex) {
  await knex.schema.table('campaigns', t => {
    t.dropColumn('oracle_quirk_intensity');
    t.dropColumn('oracle_quirk_text');
  });
};
