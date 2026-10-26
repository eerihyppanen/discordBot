import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { Collection, PermissionFlagsBits } from 'discord.js';

const directory = await fs.mkdtemp('/tmp/discord-rewards-');
process.env.DATA_DIR = directory;
await fs.writeFile(`${directory}/userLevels.json`, JSON.stringify({ legacy: { xp: 10000, level: 2 } }));
const { addXP, addMessageXP, getUserLevel, flushLevelingData } = await import('../src/utils/levelingSystem.js');
const { economy } = await import('../src/utils/economySystem.js');
const { recordWinWithRewards, getPlayerStats, flushColonistData, WIN_COOLDOWN_MS } = await import('../src/utils/colonistSystem.js');
const { default: colonist } = await import('../src/commands/colonist.js');
const { default: gamble } = await import('../src/commands/gamble.js');
const { default: messageCreate } = await import('../src/events/messageCreate.js');
const { syncLevelRole } = await import('../src/utils/levelRoles.js');

after(async () => {
  await Promise.all([flushLevelingData(), flushColonistData(), economy.flush()]);
  await fs.rm(directory, { recursive: true, force: true });
});

const approval = (matchId, now = Date.now()) => ({ matchId, confirmedBy: 'moderator', guildId: 'guild', now });

test('existing under-levelled data displays its correct level without writing on read', async () => {
  const before = await fs.readFile(`${directory}/userLevels.json`, 'utf8');
  assert.equal((await getUserLevel('legacy')).level, 10);
  assert.equal(await fs.readFile(`${directory}/userLevels.json`, 'utf8'), before);
});

test('message XP cooldown is atomic across concurrent messages and allows the next minute', async () => {
  const results = await Promise.all(Array.from({ length: 20 }, () => addMessageXP('chat-user', 1_000_000)));
  assert.equal(results.filter(r => r.awarded).length, 1);
  assert.equal((await getUserLevel('chat-user')).xp, 30);
  assert.equal((await addMessageXP('chat-user', 1_059_999)).awarded, false);
  assert.equal((await addMessageXP('chat-user', 1_060_000)).xp, 60);
  await flushLevelingData();
  const saved = JSON.parse(await fs.readFile(`${directory}/userLevels.json`, 'utf8'));
  assert.equal(saved['chat-user'].lastMessageXPAt, 1_060_000);
});

test('fourteen eligible messages reach level two without changing existing thresholds', async () => {
  for (let minute = 0; minute < 13; minute++) await addMessageXP('easier-levels', minute * 60_000);
  assert.equal((await getUserLevel('easier-levels')).xp, 390);
  assert.equal((await getUserLevel('easier-levels')).level, 1);
  const reached = await addMessageXP('easier-levels', 13 * 60_000);
  assert.equal(reached.xp, 420);
  assert.equal(reached.level, 2);
  assert.equal(reached.leveledUp, true);
});

test('large XP rewards cross all level thresholds and duplicate reward IDs grant no XP', async () => {
  assert.equal((await addXP('large', 10000, { rewardId: 'large-reward' })).level, 10);
  const replay = await addXP('large', 10000, { rewardId: 'large-reward' });
  assert.equal(replay.awarded, false);
  assert.equal(replay.xp, 10000);
  assert.equal((await addXP('large', 2100)).level, 11);
  await assert.rejects(addXP('large', -10), /Invalid XP/);
});

test('bot messages, webhooks and DMs do not grant XP', async () => {
  for (const message of [
    { author: { id: 'ignored', bot: true }, guild: {} },
    { author: { id: 'ignored' }, guild: null },
    { author: { id: 'ignored' }, guild: {}, webhookId: 'hook' },
  ]) await messageCreate.execute(message);
  assert.equal((await getUserLevel('ignored')).xp, 0);
});

test('confirmed match IDs deduplicate concurrent calls, other winners and other guilds', async () => {
  const results = await Promise.all(Array.from({ length: 8 }, () => recordWinWithRewards('winner', 'Winner', approval('unique-match'))));
  assert.equal(results.filter(r => !r.alreadyRecorded).length, 1);
  assert.equal((await economy.getBalance('winner')).coins, 200);
  assert.equal((await getUserLevel('winner')).xp, 100);
  assert.equal((await getPlayerStats('winner')).wins, 1);
  await assert.rejects(recordWinWithRewards('other-winner', 'Other', approval('UNIQUE-MATCH')), /already.*recorded/);
  await assert.rejects(recordWinWithRewards('winner', 'Winner', { ...approval('unique-match'), guildId: 'another-guild' }), /already.*recorded/);
  await assert.rejects(recordWinWithRewards('winner', 'Winner', approval('second-match')), /30 minutes/);
  await recordWinWithRewards('winner', 'Winner', approval('second-match', Date.now() + WIN_COOLDOWN_MS + 100));
  assert.equal((await getPlayerStats('winner')).wins, 2);
  await assert.rejects(recordWinWithRewards('winner', 'Winner', { ...approval('self-match'), confirmedBy: 'winner' }), /different server moderator/);
  await assert.rejects(recordWinWithRewards('winner', 'Winner', approval('__proto__!')), /match ID/);
});

test('a failed XP save blocks later results until the original award finishes, without paying twice', async t => {
  const originalRename = fs.rename;
  const failure = t.mock.method(fs, 'rename', async (...args) => {
    if (args[1] === `${directory}/userLevels.json`) throw new Error('XP disk full');
    return originalRename(...args);
  });
  await assert.rejects(recordWinWithRewards('pending', 'Pending', approval('pending-match')), /XP disk full/);
  assert.equal((await economy.getBalance('pending')).coins, 200);
  assert.equal(await getPlayerStats('pending'), null);
  await assert.rejects(recordWinWithRewards('pending', 'Pending', approval('different-match')), /previous match/);
  const { addLoss } = await import('../src/utils/colonistSystem.js');
  await assert.rejects(addLoss('pending', 'Pending'), /previous match/);
  failure.mock.restore();
  const result = await recordWinWithRewards('pending', 'Pending', approval('pending-match'));
  assert.equal(result.newBalance, 200);
  assert.equal((await getUserLevel('pending')).xp, 100);
  assert.equal((await getPlayerStats('pending')).wins, 1);
});

const winner = { id: 'role-winner', username: 'Winner', displayAvatarURL: () => 'https://example.com/avatar.png' };
const makeRequest = () => ({
  user: { id: 'moderator', toString: () => '<@moderator>' },
  guildId: 'guild', inGuild: () => true,
  memberPermissions: { has: permission => permission === PermissionFlagsBits.ManageGuild },
  options: { getSubcommand: () => 'confirm', getString: () => 'role-match', getUser: () => winner },
  reply: async () => {}, deferReply: async () => {}, editReply: async () => {},
});

test('Legacy Colonist confirmation checks moderator permission, guild, human winner and self-confirmation before saving', async () => {
  for (const configure of [
    r => { r.memberPermissions.has = () => false; },
    r => { r.inGuild = () => false; },
    r => { r.options.getUser = () => ({ ...winner, bot: true }); },
    r => { r.user.id = winner.id; },
    r => { r.options.getUser = () => null; },
  ]) {
    const request = makeRequest();
    configure(request);
    let denied;
    request.reply = async response => { denied = response; };
    request.deferReply = async () => { throw new Error('Denied request reached execution'); };
    await colonist.execute(request);
    assert.ok(denied?.content.startsWith('❌'));
  }
  assert.equal(await getPlayerStats(winner.id), null);
});

test('Colonist rewards synchronize roles immediately and concurrent role updates create one role', async () => {
  const roles = new Collection();
  let created = 0;
  const guild = { id: 'role-guild', roles: {
    cache: roles,
    create: async options => { created++; const role = { ...options, id: String(created) }; roles.set(role.id, role); return role; },
  } };
  const assigned = new Collection([['old', { id: 'old', name: 'Jumping-Noob' }]]);
  const member = { id: winner.id, guild, roles: {
    cache: new Collection(assigned), // Gateway cache remains stale after REST calls.
    add: async role => { assigned.set(role.id, role); },
    remove: async id => { assigned.delete(id); },
  } };
  await addXP(winner.id, 2450);
  const request = makeRequest();
  request.guild = { members: { fetch: async id => { assert.equal(id, winner.id); return member; } } };
  await colonist.execute(request);
  assert.equal((await getUserLevel(winner.id)).level, 5);
  assert.deepEqual([...assigned.values()].map(r => r.name), ['Silver Stroker']);
  await Promise.all([syncLevelRole(member), syncLevelRole(member)]);
  assert.equal(created, 1);
});

test('dice pays a net 0.8x on wins and loses the stake on all other outcomes including seven', async t => {
  let random = [];
  t.mock.method(Math, 'random', () => random.shift());
  await economy.updateUser('dice', user => { user.coins = 10000; });
  let wins = 0;
  for (let d1 = 1; d1 <= 6; d1++) {
    for (let d2 = 1; d2 <= 6; d2++) {
      random = [(d1 - 0.5) / 6, (d2 - 0.5) / 6];
      const before = (await economy.getBalance('dice')).coins;
      await gamble.execute({
        user: { id: 'dice' },
        options: { getSubcommand: () => 'dice', getInteger: () => 100, getString: () => 'high' },
        deferReply: async () => {}, editReply: async () => {},
      });
      const won = d1 + d2 >= 8;
      if (won) wins++;
      assert.equal((await economy.getBalance('dice')).coins - before, won ? 80 : -100);
    }
  }
  assert.equal(wins, 15);
  assert.equal((await economy.getBalance('dice')).coins, 9100);
});
