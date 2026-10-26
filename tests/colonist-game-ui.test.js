import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { MessageFlags, PermissionFlagsBits } from 'discord.js';
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'colonist-game-ui-'));
process.env.DATA_DIR = dir;
const { default: command } = await import('../src/commands/colonist.js');
const { colonistGames } = await import('../src/utils/colonistGameSystem.js');
const { getPlayerStats, flushColonistData } = await import('../src/utils/colonistSystem.js');
const { flushLevelingData } = await import('../src/utils/levelingSystem.js');
const { economy } = await import('../src/utils/economySystem.js');
const { dispatchInteraction } = await import('../src/utils/interactionHandler.js');
after(async () => { await colonistGames.flush(); await flushColonistData(); await flushLevelingData(); await fs.rm(dir, { recursive: true, force: true }); });
const serialize = payload => typeof payload === 'string' ? { content: payload } : ({
  ...payload, embeds: payload.embeds?.map(embed => embed.toJSON()), components: payload.components?.map(row => row.toJSON()),
});
let nextId = 100000;
const request = (userId, subcommand = 'game') => {
  const output = { publicEdits: [] };
  const r = {
    id: String(nextId++), user: { id: userId, username: 'Player ' + userId, bot: false },
    guildId: 'guild', channelId: 'channel', inGuild: () => true,
    client: { commands: new Map([['colonist', command]]) },
    guild: { members: { fetch: async id => ({ id }) } },
    channel: { messages: { edit: async (id, payload) => { output.publicEdits.push({ id, ...serialize(payload) }); } } },
    options: { getSubcommand: () => subcommand, getString: () => null },
    isButton: () => false, isChatInputCommand: () => true,
    deferReply: async () => { r.deferred = true; },
    deferUpdate: async () => { r.deferred = true; },
    reply: async payload => { output.reply = serialize(payload); r.replied = true; },
    editReply: async payload => { output.edit = serialize(payload); return { id: 'message-' + r.id }; },
    followUp: async payload => { output.followUp = serialize(payload); },
  };
  return { r, output };
};
const button = (gameId, userId, action, claimUser) => {
  const value = request(userId);
  value.r.isButton = () => true;
  value.r.isChatInputCommand = () => false;
  value.r.customId = `colonist:game:${gameId}:${action}${claimUser ? ':' + claimUser : ''}`;
  return value;
};
const setup = async (prefix) => {
  const { r, output } = request(prefix + '1');
  await command.execute(r);
  assert.ok(output.edit?.components?.length, 'game creation must return a playable card');
  const game = await colonistGames.activeFor(prefix + '1');
  const join = button(game.id, prefix + '2', 'join');
  await command.handleButton(join.r);
  const start = button(game.id, prefix + '1', 'start');
  await command.handleButton(start.r);
  return { game: await colonistGames.get(game.id), creator: prefix + '1', guest: prefix + '2' };
};

test('a normal member creates a persistent game card without an admin permission or a match input', async () => {
  const { r, output } = request('101');
  await command.execute(r);
  assert.ok(output.edit?.components?.length, 'expected lobby controls');
  const labels = output.edit.components[0].components.map(button => button.label);
  assert.ok(labels.includes('Liity'));
  assert.ok(labels.includes('Aloita'));
  const game = await colonistGames.activeFor('101');
  assert.equal(game.creatorId, '101');
  assert.equal(game.messageId, 'message-' + r.id);
  const metadata = command.data.toJSON().options;
  assert.ok(metadata.some(option => option.name === 'game'));
  assert.deepEqual(metadata.find(option => option.name === 'win').options || [], []);
});

test('/colonist cancel recovers from a deleted channel and acknowledges a durable cancellation', async t => {
  const f = await setup('210');
  const item = request(f.creator, 'cancel');
  item.r.channelId = 'replacement-channel';
  let flags;
  item.r.deferReply = async options => { flags = options.flags; item.r.deferred = true; };
  item.r.client.channels = { fetch: async () => { throw new Error('Unknown Channel'); } };
  t.mock.method(console, 'error', () => {});
  t.mock.method(console, 'info', () => {});
  await command.execute(item.r);
  assert.equal(flags, MessageFlags.Ephemeral);
  assert.match(item.output.edit.content, /^✅/);
  assert.equal(await colonistGames.activeFor(f.creator), null);
  assert.equal(await colonistGames.activeFor(f.guest), null);
  assert.equal(await getPlayerStats(f.guest), null);
});

test('an ordinary participant cannot cancel someone else’s game through slash recovery', async () => {
  const f = await setup('220');
  const item = request(f.guest, 'cancel');
  await command.execute(item.r);
  assert.match(item.output.edit.content, /creator/);
  assert.equal((await colonistGames.get(f.game.id)).status, 'playing');
});

test('/admin colonist-cancel recovers by participant when the creator is absent', async t => {
  const { default: admin } = await import('../src/commands/admin.js');
  const f = await setup('230');
  const item = request('9999', 'colonist-cancel');
  item.r.channelId = 'replacement-channel';
  item.r.options.getUser = () => ({ id: f.guest, bot: false });
  item.r.memberPermissions = { has: permission => permission === PermissionFlagsBits.ManageGuild };
  item.r.client.channels = { fetch: async id => {
    assert.equal(id, f.game.channelId);
    return item.r.channel;
  } };
  t.mock.method(console, 'info', () => {});
  await admin.execute(item.r);
  assert.match(item.output.edit.content, /^✅/);
  assert.equal(item.output.publicEdits.length, 1);
  assert.deepEqual(item.output.publicEdits[0].components, []);
  assert.equal(await colonistGames.activeFor(f.guest), null);
});

test('/admin recovery checks runtime permissions before reading options and rejects another server', async () => {
  const { default: admin } = await import('../src/commands/admin.js');
  const denied = request('9999', 'colonist-cancel');
  denied.r.options = null;
  await admin.execute(denied.r);
  assert.equal(denied.output.reply.flags, MessageFlags.Ephemeral);
  assert.match(denied.output.reply.content, /Manage Server/);
  const f = await setup('240');
  const other = request('9999', 'colonist-cancel');
  other.r.guildId = 'other';
  other.r.memberPermissions = { has: () => true };
  other.r.options.getUser = () => ({ id: f.guest });
  await admin.execute(other.r);
  assert.match(other.output.edit.content, /server/);
  assert.equal((await colonistGames.get(f.game.id)).status, 'playing');
});

test('a moderator can cancel with the public button even without being a participant', async () => {
  const f = await setup('250');
  const item = button(f.game.id, '9999', 'cancel');
  item.r.memberPermissions = { has: permission => permission === PermissionFlagsBits.ManageGuild };
  await command.handleButton(item.r);
  assert.deepEqual(item.output.edit.components, []);
  assert.equal(await colonistGames.activeFor(f.creator), null);
});

test('claiming a win privately confirms it before recording all results and updating the public card', async () => {
  const f = await setup('20');
  const claim = button(f.game.id, f.guest, 'claim');
  await dispatchInteraction(claim.r);
  assert.equal(claim.output.reply?.flags, MessageFlags.Ephemeral);
  assert.equal(await getPlayerStats(f.guest), null);
  const confirmId = claim.output.reply.components[0].components.find(item => item.label === 'Vahvista').custom_id;
  const confirm = button(f.game.id, f.guest, 'confirm', f.guest);
  assert.equal(confirm.r.customId, confirmId);
  await dispatchInteraction(confirm.r);
  assert.equal((await getPlayerStats(f.guest)).wins, 1);
  assert.equal((await getPlayerStats(f.creator)).totalGames, 1);
  assert.equal((await economy.getBalance(f.guest)).coins, 200);
  assert.deepEqual(confirm.output.edit.components, []);
  assert.equal(confirm.output.publicEdits.length, 1);
  assert.deepEqual(confirm.output.publicEdits[0].components, []);
});

test('outsiders, bots, other guilds and another users confirmation cannot record a win', async () => {
  const f = await setup('30');
  for (const configure of [
    r => { r.user.id = '999'; },
    r => { r.user.bot = true; },
    r => { r.guildId = 'other'; },
    r => { r.channelId = 'other'; },
  ]) {
    const item = button(f.game.id, f.guest, 'confirm', f.guest);
    configure(item.r);
    await command.handleButton(item.r);
    const rejected = item.output.reply || item.output.followUp || item.output.edit;
    assert.ok(rejected?.content.startsWith('❌'));
    assert.equal(item.output.publicEdits.length, 0);
    assert.equal((await colonistGames.get(f.game.id)).status, 'playing');
  }
  assert.equal(await getPlayerStats(f.guest), null);
});

test('/colonist win reopens a self-confirmation and dismissing it changes no game state', async () => {
  const f = await setup('40');
  const item = request(f.creator, 'win');
  await command.execute(item.r);
  const prompt = item.output.reply || item.output.edit;
  assert.equal(prompt.flags, MessageFlags.Ephemeral);
  assert.ok(prompt.components[0].components.some(button => button.label === 'Vahvista'));
  const dismiss = button(f.game.id, f.creator, 'dismiss', f.creator);
  await command.handleButton(dismiss.r);
  assert.deepEqual(dismiss.output.edit.components, []);
  assert.equal((await colonistGames.get(f.game.id)).status, 'playing');
  assert.equal(await getPlayerStats(f.creator), null);
});

test('a Discord message or role failure cannot undo the saved outcome or allow another winner', async t => {
  const f = await setup('50');
  t.mock.method(console, 'error', () => {});
  const item = button(f.game.id, f.guest, 'confirm', f.guest);
  item.r.channel.messages.edit = async () => { throw new Error('Message deleted'); };
  item.r.guild.members.fetch = async () => { throw new Error('Member unavailable'); };
  await command.handleButton(item.r);
  assert.equal((await colonistGames.get(f.game.id)).status, 'completed');
  assert.equal((await getPlayerStats(f.guest)).wins, 1);
  assert.ok(item.output.edit?.content);
  const retry = button(f.game.id, f.guest, 'confirm', f.guest);
  await command.handleButton(retry.r);
  assert.equal((await getPlayerStats(f.creator)).totalGames, 1);
  assert.equal((await economy.getBalance(f.guest)).coins, 200);
});

test('a synchronous Discord update failure still reports the already saved result as successful', async t => {
  const f = await setup('70');
  t.mock.method(console, 'error', () => {});
  const item = button(f.game.id, f.guest, 'confirm', f.guest);
  item.r.channel.messages.edit = () => { throw new Error('Channel unavailable'); };
  await command.handleButton(item.r);
  assert.ok(item.output.edit.content.startsWith('✅'));
  assert.equal((await colonistGames.get(f.game.id)).status, 'completed');
});

test('a failed private success reply does not prevent the public saved result and role update', async t => {
  const f = await setup('90');
  t.mock.method(console, 'error', () => {});
  const item = button(f.game.id, f.guest, 'confirm', f.guest);
  item.r.editReply = async () => { throw new Error('Private reply expired'); };
  await assert.doesNotReject(command.handleButton(item.r));
  assert.equal(item.output.publicEdits.length, 1);
  assert.deepEqual(item.output.publicEdits[0].components, []);
  assert.equal((await getPlayerStats(f.guest)).wins, 1);
});

test('a delayed lobby publication cannot overwrite the final completed public card', async () => {
  const opened = request('951');
  await command.execute(opened.r);
  const game = await colonistGames.activeFor('951');
  let enter, release, saved;
  const entered = new Promise(resolve => { enter = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const acknowledged = new Promise(resolve => { saved = resolve; });
  let published;
  const joining = button(game.id, '952', 'join');
  joining.r.editReply = async payload => { enter(); await gate; published = serialize(payload); };
  const delayedJoin = command.handleButton(joining.r);
  await entered;
  try {
    await colonistGames.start(game.id, '951', { guildId: 'guild', channelId: 'channel' });
    const confirm = button(game.id, '952', 'confirm', '952');
    confirm.r.editReply = async () => { saved(); };
    confirm.r.channel.messages.edit = async (_id, payload) => { published = serialize(payload); };
    const finishing = command.handleButton(confirm.r);
    await acknowledged;
    await new Promise(setImmediate);
    release();
    await Promise.all([delayedJoin, finishing]);
  } finally { release(); }
  assert.equal((await colonistGames.get(game.id)).status, 'completed');
  assert.deepEqual(published.components, []);
  assert.ok(published.embeds[0].fields.some(field => field.name === '🏆 Voittaja'));
});
