import test from 'node:test';
import assert from 'node:assert/strict';
import { Client, Collection, MessageFlags, PermissionFlagsBits } from 'discord.js';
import admin from '../src/commands/admin.js';

test('status is registered under the existing Manage Server permission requirement', () => {
  const definition = admin.data.toJSON();
  assert.equal(definition.default_member_permissions, PermissionFlagsBits.ManageGuild.toString());
  assert.ok(definition.options.some(option => option.name === 'status'));
});

test('status denies ordinary members and DMs before reading any options', async () => {
  for (const inGuild of [false, true]) {
    let reply;
    await admin.execute({
      inGuild: () => inGuild,
      memberPermissions: { has: () => !inGuild },
      get options() { throw new Error('Permission check must run first'); },
      reply: async value => { reply = value; },
    });
    assert.equal(reply.flags, MessageFlags.Ephemeral);
    assert.match(reply.content, /Manage Server/);
  }
});

test('status replies privately with SDK client state without reading game inputs or calling APIs', async t => {
  const client = new Client({ intents: [] });
  t.after(() => client.destroy());
  client.commands = new Collection([['admin', admin]]);
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Status must not call an external API'); });
  let deferred, reply;
  await admin.execute({
    inGuild: () => true,
    memberPermissions: { has: flag => flag === PermissionFlagsBits.ManageGuild },
    client,
    options: { getSubcommand: () => 'status', getUser: () => { throw new Error('Status must not read game inputs'); } },
    deferReply: async value => { deferred = value; },
    editReply: async value => { reply = value; },
  });
  assert.equal(deferred.flags, MessageFlags.Ephemeral);
  const embed = reply.embeds[0].toJSON();
  assert.match(embed.title, /Bot status/i);
  assert.match(embed.fields.find(field => field.name === 'Discord connection').value, /not ready/i);
  assert.match(embed.fields.find(field => field.name === 'Gateway latency').value, /awaiting heartbeat/i);
  assert.equal(embed.fields.find(field => field.name === 'Loaded commands').value, '1');
});

test('status reports metrics and configuration flags without exposing values', async () => {
  const { createStatusEmbed } = await import('../src/utils/botStatus.js');
  const values = {
    TOKEN: 'private-discord-token-value', PUBG_API_KEY: 'private-pubg-key-value', FACEIT_API_KEY: 'private-faceit-key-value',
    CLIENT_ID: 'private-client-id-value', GUILD_ID: 'private-guild-id-value', DATABASE_URL: 'private-unrelated-env-value',
  };
  const embed = createStatusEmbed({ isReady: () => true, ws: { ping: 42.8 }, commands: new Map([['admin', admin]]) }, {
    env: values, uptimeSeconds: 183_845, memory: { rss: 64 * 1024 * 1024 },
  }).toJSON();
  const field = name => embed.fields.find(field => field.name === name).value;
  assert.match(field('Discord connection'), /ready/i);
  assert.equal(field('Gateway latency'), '43 ms');
  assert.equal(field('Process uptime'), '2d 3h 4m 5s');
  assert.equal(field('Memory (RSS)'), '64 MiB');
  assert.match(field('Runtime'), new RegExp(process.version.replaceAll('.', '\\.')));
  assert.match(field('API configuration'), /PUBG: Configured/);
  assert.match(field('API configuration'), /FACEIT: Configured/);
  assert.match(field('Command registration'), /CLIENT_ID: Configured/);
  assert.match(field('Command registration'), /GUILD_ID: Configured/);
  for (const secret of Object.values(values)) assert.equal(JSON.stringify(embed).includes(secret), false);
  assert.match(embed.footer.text, /presence only/i);
});

test('missing, blank and sample API keys are not shown as configured', async () => {
  const { createStatusEmbed } = await import('../src/utils/botStatus.js');
  for (const env of [{}, { PUBG_API_KEY: ' ', FACEIT_API_KEY: '' }, {
    PUBG_API_KEY: ' your_pubg_api_key_here ', FACEIT_API_KEY: 'your_faceit_api_key_here',
  }]) {
    const embed = createStatusEmbed({ isReady: () => false, ws: { ping: -1 } }, { env, uptimeSeconds: 0, memory: { rss: 0 } }).toJSON();
    const config = embed.fields.find(field => field.name === 'API configuration').value;
    assert.match(config, /PUBG: Not configured/);
    assert.match(config, /FACEIT: Not configured/);
    assert.equal(embed.fields.find(field => field.name === 'Process uptime').value, '0s');
  }
});
