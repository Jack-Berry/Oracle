exports.up = async function(knex) {
  await knex.schema.createTable('scripted_invocations', t => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('campaign_id').notNullable().references('id').inTable('campaigns').onDelete('CASCADE');
    t.string('title', 100).notNullable().defaultTo('');
    t.string('trigger_phrase', 300).notNullable();
    t.string('mode', 20).notNullable().defaultTo('scripted');
    t.text('content').notNullable();
    t.boolean('is_enabled').notNullable().defaultTo(true);
    t.timestamps(true, true);

    t.index(['campaign_id'], 'scripted_invocations_campaign_id_idx');
  });
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('scripted_invocations');
};
