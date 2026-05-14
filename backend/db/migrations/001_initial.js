exports.up = async function(knex) {
  await knex.schema.createTable('campaigns', t => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('display_name', 120).notNullable().defaultTo('');
    t.text('campaign_context').notNullable().defaultTo('');
    t.timestamps(true, true);
  });

  await knex.schema.createTable('sessions', t => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('campaign_id').notNullable().references('id').inTable('campaigns').onDelete('CASCADE');
    t.string('name', 200).notNullable();
    t.text('hidden_context').notNullable().defaultTo('');
    t.timestamps(true, true);
    t.unique(['campaign_id', 'name']);
  });

  await knex.schema.createTable('party_members', t => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('campaign_id').notNullable().references('id').inTable('campaigns').onDelete('CASCADE');
    t.string('character_name', 80).notNullable();
    t.string('player_name', 80).notNullable().defaultTo('');
    t.string('class', 80).notNullable().defaultTo('');
    t.string('race', 80).notNullable().defaultTo('');
    t.integer('level').nullable();
    t.text('notes').notNullable().defaultTo('');
    t.integer('sort_order').notNullable().defaultTo(0);
    t.timestamps(true, true);
  });

  await knex.schema.createTable('character_data', t => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('member_id').notNullable().references('id').inTable('party_members').onDelete('CASCADE');
    t.string('file_name', 200).notNullable();
    t.string('file_type', 100).notNullable().defaultTo('');
    t.jsonb('data').notNullable();
    t.timestamps(true, true);
  });

  await knex.schema.createTable('consultations', t => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('session_id').notNullable().references('id').inTable('sessions').onDelete('CASCADE');
    t.text('question').notNullable();
    t.text('response').notNullable();
    t.string('tone_mode', 20).notNullable().defaultTo('oracle');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('consultations');
  await knex.schema.dropTableIfExists('character_data');
  await knex.schema.dropTableIfExists('party_members');
  await knex.schema.dropTableIfExists('sessions');
  await knex.schema.dropTableIfExists('campaigns');
};
