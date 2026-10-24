import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PermissionFlagsBits, MessageFlags } from 'discord.js';

const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'discord-commands-'));
process.env.DATA_DIR = directory;
const { default: manual } = await import('../src/commands/pubg-wins-add.js');
const { default: daily } = await import('../src/commands/daily.js');
const { default: balance } = await import('../src/commands/economy.js');
const { default: gamble } = await import('../src/commands/gamble.js');
const { default: colonist } = await import('../src/commands/colonist.js');
const { default: remind, parseTime } = await import('../src/commands/remind.js');
const { default: groq } = await import('../src/commands/groq-chat.js');
const { economy } = await import('../src/utils/economySystem.js');
const { flushPubgWinsData, getPlayerWins } = await import('../src/utils/pubgWinsSystem.js');
const { flushColonistData, getPlayerStats, addLoss, recordWinWithRewards } = await import('../src/utils/colonistSystem.js');
const { flushLevelingData, getUserLevel, addXP } = await import('../src/utils/levelingSystem.js');

after(async () => {
  await Promise.all([flushPubgWinsData(), flushColonistData(), flushLevelingData()]);
  await fs.rm(directory, { recursive: true, force: true });
});

const interaction = (userId, { strings = {}, integers = {}, subcommand } = {}) => ({
  user: { id: subcommand === 'win' ? 'moderator' : userId, username: userId, displayAvatarURL: () => 'https://example.com/avatar.png' },
  guildId: 'guild',
  guild: { members: { fetch: async id => ({ id }) } },
  channelId: 'channel',
  inGuild: () => true,
  memberPermissions: { has: () => subcommand === 'win' },
  options: {
    getString: (key) => strings[key] ?? (subcommand === 'win' && key === 'match' ? userId + '-match' : null),
    getInteger: (key) => integers[key] ?? null,
    getUser: (key) => subcommand === 'win' && key === 'winner'
      ? { id: userId, username: userId, displayAvatarURL: () => 'https://example.com/avatar.png' } : null,
    getSubcommand: () => subcommand,
  },
  reply: async () => {},
  deferReply: async () => {},
  editReply: async () => {},
});

test('manual PUBG changes require Manage Server in metadata and execution', async () => {
  assert.equal(manual.data.toJSON().default_member_permissions, PermissionFlagsBits.ManageGuild.toString());
  const denied = interaction('ordinary-user');
  let response;
  denied.reply = async (message) => { response = message; };
  // Missing options would throw if unauthorized execution reached the write.
  await manual.execute(denied);
  assert.equal(response.flags, MessageFlags.Ephemeral);
  assert.match(response.content, /Manage Server/);
  const dm = interaction('dm-user');
  dm.inGuild = () => false;
  dm.memberPermissions.has = () => true;
  dm.reply = denied.reply;
  await manual.execute(dm);
  assert.equal(response.flags, MessageFlags.Ephemeral);
});

test('authorized manual changes succeed and include an audit record', async () => {
  const admin = interaction('moderator', {
    strings: { username: 'player', platform: 'steam', region: 'pc-eu' },
    integers: { wins: 5, matches: 10 },
  });
  admin.memberPermissions.has = (permission) => permission === PermissionFlagsBits.ManageGuild;
  const original = console.info;
  let audit;
  console.info = (...args) => { audit = args; };
  try { await manual.execute(admin); } finally { console.info = original; }
  assert.equal((await getPlayerWins('player', 'steam', 'pc-eu')).wins, 5);
  assert.equal(audit[1].actorId, 'moderator');
  assert.equal(audit[1].wins, 5);
});

test('daily, balance, and Colonist commands preserve concurrent economy changes', async () => {
  await Promise.all([
    daily.execute(interaction('daily-user')),
    balance.execute(interaction('balance-user')),
    colonist.execute(interaction('colonist-user', { subcommand: 'win' })),
  ]);
  const saved = JSON.parse(await fs.readFile(path.join(directory, 'economy.json'), 'utf8'));
  assert.ok(saved['daily-user'].coins >= 200);
  assert.equal(saved['balance-user'].coins, 100);
  assert.equal(saved['colonist-user'].coins, 200);
});

test('gambling commits the balance before responding', async () => {
  const bet = interaction('gambler', {
    subcommand: 'coinflip', strings: { choice: 'heads' }, integers: { amount: 10 },
  });
  let checked = false;
  bet.editReply = async (response) => {
    const saved = JSON.parse(await fs.readFile(path.join(directory, 'economy.json'), 'utf8'));
    const field = response.embeds[0].fields.find((item) => item.name === 'New Balance');
    assert.equal(field.value, saved.gambler.coins + ' coins');
    assert.ok([90, 110].includes(saved.gambler.coins));
    checked = true;
  };
  await gamble.execute(bet);
  assert.equal(checked, true);
});

test('reminder confirmation is sent only after the reminder is saved', async () => {
  const reminder = interaction('reminder-user', { strings: { time: '1h', message: 'saved message' } });
  reminder.editReply = async () => {
    const saved = Object.values(JSON.parse(await fs.readFile(path.join(directory, 'reminders.json'), 'utf8')));
    assert.equal(saved[0].message, 'saved message');
    assert.equal(saved[0].channelId, 'channel');
  };
  await remind.execute(reminder);
  assert.equal(parseTime('7d'), 604800000);
  for (const invalid of ['0s', '-1h', '8d', '99999999999999999999999d', 'oops']) {
    assert.equal(parseTime(invalid), null);
  }
});

test('failed persistence cannot produce a daily success response', async () => {
  const file = path.join(directory, 'economy.json');
  const prior = await fs.readFile(file);
  await fs.unlink(file);
  await fs.mkdir(file);
  let success = false;
  const claim = interaction('disk-failure-user');
  claim.editReply = async () => { success = true; };
  try {
    await assert.rejects(daily.execute(claim));
    assert.equal(success, false);
  } finally {
    await fs.rmdir(file);
    await fs.writeFile(file, prior);
  }
});

test('Groq command reports a retired model distinctly and caps embed size', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.GROQ_API_KEY;
  const originalError = console.error;
  process.env.GROQ_API_KEY = 'test-key';
  console.error = () => {};
  try {
    const request = interaction('ai-user', { strings: { message: 'hi' } });
    let response;
    request.editReply = async (value) => { response = value; };
    globalThis.fetch = async () => ({ ok: false, status: 400, json: async () => ({ error: { code: 'model_decommissioned' } }) });
    await groq.execute(request);
    assert.match(response, /GROQ_MODEL/);
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'x'.repeat(5000) } }] }) });
    await groq.execute(request);
    assert.equal(response.embeds[0].toJSON().description.length, 4096);
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalError;
    if (originalKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = originalKey;
  }
});

const withFailedEconomyWrite = async (run) => {
  const file = path.join(directory, 'economy.json');
  const prior = await fs.readFile(file);
  await fs.unlink(file);
  await fs.mkdir(file);
  try { return await run(); }
  finally {
    await fs.rmdir(file);
    await fs.writeFile(file, prior);
  }
};

const quietlyRecordWin = async (request) => {
  const originalError = console.error;
  console.error = () => {};
  try { await colonist.execute(request); }
  finally { console.error = originalError; }
};

test('failed Colonist coin writes leave no win or XP and a retry grants rewards once', async () => {
  const userId = 'colonist-retry-user';
  await economy.getBalance(userId);
  await getUserLevel(userId);
  await flushLevelingData();
  let response;
  const request = interaction(userId, { subcommand: 'win' });
  request.editReply = async (value) => { response = value; };
  await withFailedEconomyWrite(() => quietlyRecordWin(request));
  assert.match(response, /Retry with the same match ID/);
  assert.equal(await getPlayerStats(userId), null);
  assert.equal((await getUserLevel(userId)).xp, 0);
  assert.equal((await economy.getBalance(userId)).coins, 100);
  await Promise.all([flushColonistData(), flushLevelingData()]);
  const savedWins = JSON.parse(await fs.readFile(path.join(directory, 'colonistWins.json'), 'utf8'));
  const savedXP = JSON.parse(await fs.readFile(path.join(directory, 'userLevels.json'), 'utf8'));
  assert.equal(savedWins[userId], undefined);
  assert.equal(savedXP[userId].xp, 0);

  await colonist.execute(request);
  const stats = await getPlayerStats(userId);
  assert.equal(stats.wins, 1);
  assert.equal(stats.totalGames, 1);
  assert.equal(stats.currentStreak, 1);
  assert.equal((await getUserLevel(userId)).xp, 50);
  assert.equal((await economy.getBalance(userId)).coins, 200);
});

test('failed Colonist rewards preserve an existing streak and its next bonus', async () => {
  const userId = 'colonist-streak-user';
  const request = interaction(userId, { subcommand: 'win' });
  await recordWinWithRewards(userId, userId, { matchId: 'streak-first', confirmedBy: 'moderator', guildId: 'guild', now: Date.now() - 62 * 60_000 });
  await recordWinWithRewards(userId, userId, { matchId: 'streak-second', confirmedBy: 'moderator', guildId: 'guild', now: Date.now() - 31 * 60_000 });
  await addXP(userId, 250);
  const before = await getPlayerStats(userId);
  const beforeXP = await getUserLevel(userId);
  await withFailedEconomyWrite(() => quietlyRecordWin(request));
  assert.deepEqual(await getPlayerStats(userId), before);
  assert.deepEqual(await getUserLevel(userId), beforeXP);
  assert.equal((await economy.getBalance(userId)).coins, 300);

  await colonist.execute(request);
  const stats = await getPlayerStats(userId);
  assert.equal(stats.wins, 3);
  assert.equal(stats.totalGames, 3);
  assert.equal(stats.currentStreak, 3);
  assert.equal(stats.longestStreak, 3);
  assert.equal((await getUserLevel(userId)).xp, 425);
  assert.equal((await getUserLevel(userId)).level, 2);
  assert.equal((await economy.getBalance(userId)).coins, 450);
});

test('a failed win preserves concurrent message XP and a queued loss', async () => {
  const userId = 'colonist-concurrent-user';
  await economy.getBalance(userId);
  const originalGrant = economy.grantColonistReward;
  let entered;
  let release;
  const waiting = new Promise((resolve) => { entered = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  economy.grantColonistReward = async (...args) => { entered(); await gate; return originalGrant(...args); };
  try {
    await withFailedEconomyWrite(async () => {
      const win = quietlyRecordWin(interaction(userId, { subcommand: 'win' }));
      await waiting;
      const message = addXP(userId, 15);
      const loss = addLoss(userId, userId);
      release();
      await Promise.all([win, message, loss]);
    });
  } finally {
    release();
    economy.grantColonistReward = originalGrant;
  }
  const stats = await getPlayerStats(userId);
  assert.equal(stats.wins, 0);
  assert.equal(stats.totalGames, 1);
  assert.equal(stats.currentStreak, 0);
  assert.equal((await getUserLevel(userId)).xp, 15);
  assert.equal((await economy.getBalance(userId)).coins, 100);
});

test('a response failure after a saved win does not tell the user to record it again', async () => {
  const userId = 'colonist-response-user';
  const request = interaction(userId, { subcommand: 'win' });
  let response;
  request.editReply = async (value) => {
    if (typeof value !== 'string') throw new Error('Discord reply failed');
    response = value;
  };
  await quietlyRecordWin(request);
  assert.match(response, /already.*recorded/i);
  assert.doesNotMatch(response, /try again/i);
  assert.equal((await getPlayerStats(userId)).wins, 1);
  assert.equal((await getUserLevel(userId)).xp, 50);
  assert.equal((await economy.getBalance(userId)).coins, 200);
});
