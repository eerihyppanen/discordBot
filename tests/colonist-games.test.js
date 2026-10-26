import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createJsonStore } from '../src/utils/jsonStore.js';
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'colonist-games-'));
process.env.DATA_DIR = root;
const { createColonistGameSystem } = await import('../src/utils/colonistGameSystem.js');
const { getPlayerStats, flushColonistData, recordGameResult } = await import('../src/utils/colonistSystem.js');
const { flushLevelingData } = await import('../src/utils/levelingSystem.js');
after(async () => { await flushColonistData(); await flushLevelingData(); await fs.rm(root, { recursive: true, force: true }); });
let sequence = 10;
const fixture = async () => {
  const prefix = String(sequence++);
  const creator = { id: prefix + '1', username: 'Creator' };
  const guest = { id: prefix + '2', username: 'Guest' };
  const context = { guildId: 'guild', channelId: 'channel' };
  const file = path.join(root, prefix + '-games.json');
  const games = createColonistGameSystem(createJsonStore(file), { recordResult: recordGameResult });
  const game = await games.create({ ...context, creator, id: 'game-' + prefix });
  return { games, game, creator, guest, context, file };
};

test('lobby joins are unique, the creator starts it and the roster locks while playing', async () => {
  const f = await fixture();
  assert.equal(f.game.players.length, 1);
  await Promise.all([f.games.join(f.game.id, f.guest, f.context), f.games.join(f.game.id, f.guest, f.context)]);
  assert.equal((await f.games.get(f.game.id)).players.length, 2);
  await assert.rejects(f.games.start(f.game.id, f.guest.id, f.context), /creator/i);
  const running = await f.games.start(f.game.id, f.creator.id, f.context);
  assert.equal(running.status, 'playing');
  await assert.rejects(f.games.join(f.game.id, { id: '999', username: 'Late' }, f.context), /lobby|started/i);
  await assert.rejects(f.games.leave(f.game.id, f.guest.id, f.context), /lobby|started/i);
});

test('only humans in the matching guild/channel may join and only the creator can cancel', async () => {
  const f = await fixture();
  await assert.rejects(f.games.join(f.game.id, { ...f.guest, bot: true }, f.context), /human|bot/i);
  await assert.rejects(f.games.join(f.game.id, f.guest, { ...f.context, guildId: 'other' }), /channel|server|guild/i);
  await assert.rejects(f.games.join(f.game.id, f.guest, { ...f.context, channelId: 'other' }), /channel/i);
  await assert.rejects(f.games.cancel(f.game.id, f.guest.id, f.context), /creator/i);
  await assert.rejects(f.games.start(f.game.id, f.creator.id, f.context), /two|2/i);
  await f.games.cancel(f.game.id, f.creator.id, f.context);
  await assert.rejects(f.games.join(f.game.id, f.guest, f.context), /lobby|cancel/i);
});

test('leaving a lobby frees a player, but the creator must cancel instead of leaving', async () => {
  const f = await fixture();
  await f.games.join(f.game.id, f.guest, f.context);
  await f.games.leave(f.game.id, f.guest.id, f.context);
  assert.equal(await f.games.activeFor(f.guest.id), null);
  await assert.rejects(f.games.leave(f.game.id, f.creator.id, f.context), /creator|cancel/i);
});

test('creator can recover a game from another channel and free every participant', async () => {
  const f = await fixture();
  await f.games.join(f.game.id, f.guest, f.context);
  await f.games.start(f.game.id, f.creator.id, f.context);
  await f.games.cancel(f.game.id, f.creator.id, { ...f.context, channelId: 'replacement-channel' });
  assert.equal(await f.games.activeFor(f.creator.id), null);
  assert.equal(await f.games.activeFor(f.guest.id), null);
  assert.equal(JSON.parse(await fs.readFile(f.file, 'utf8'))[f.game.id].status, 'cancelled');
  await assert.rejects(f.games.start(f.game.id, f.creator.id, f.context), /lobby/i);
  await assert.rejects(f.games.confirm(f.game.id, f.guest.id, f.context), /started/i);
  assert.equal(await getPlayerStats(f.guest.id), null);
});

test('moderator can recover an absent creator’s game only within its server', async () => {
  const f = await fixture();
  await f.games.join(f.game.id, f.guest, f.context);
  const recovery = { ...f.context, channelId: 'replacement-channel' };
  await assert.rejects(f.games.cancel(f.game.id, f.guest.id, recovery), /creator/i);
  await assert.rejects(f.games.cancel(f.game.id, '999', { ...recovery, guildId: 'other' }, { isModerator: true }), /server|guild/i);
  await f.games.cancel(f.game.id, '999', recovery, { isModerator: true });
  assert.equal(await f.games.activeFor(f.guest.id), null);
});

test('even moderators cannot cancel reserved or completed results', async () => {
  const f = await fixture();
  await f.games.join(f.game.id, f.guest, f.context);
  await f.games.start(f.game.id, f.creator.id, f.context);
  const failing = createColonistGameSystem(createJsonStore(f.file), { recordResult: async () => { throw new Error('Disk full'); } });
  await assert.rejects(failing.confirm(f.game.id, f.guest.id, f.context), /Disk full/);
  await assert.rejects(failing.cancel(f.game.id, '999', f.context, { isModerator: true }), /recording/i);
  await failing.flush();
  const restarted = createColonistGameSystem(createJsonStore(f.file));
  await restarted.initialize();
  await assert.rejects(restarted.cancel(f.game.id, '999', f.context, { isModerator: true }), /completed/i);
  assert.equal((await getPlayerStats(f.guest.id)).wins, 1);
});

test('one unfinished game per participant prevents duplicate rosters and slash retries reopen it', async () => {
  const f = await fixture();
  const reopened = await f.games.create({ ...f.context, creator: f.creator, id: 'another-id' });
  assert.equal(reopened.id, f.game.id);
  const second = await f.games.create({ ...f.context, creator: f.guest, id: 'second-game' });
  await assert.rejects(f.games.join(second.id, f.creator, f.context), /another|unfinished/i);
});

test('concurrent winners commit one result and reject other winners without duplicate losses', async () => {
  const f = await fixture();
  await f.games.join(f.game.id, f.guest, f.context);
  await f.games.start(f.game.id, f.creator.id, f.context);
  const results = await Promise.allSettled([
    f.games.confirm(f.game.id, f.creator.id, f.context),
    f.games.confirm(f.game.id, f.guest.id, f.context),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const finished = await f.games.get(f.game.id);
  assert.equal(finished.status, 'completed');
  assert.equal((await getPlayerStats(f.creator.id)).totalGames, 1);
  assert.equal((await getPlayerStats(f.guest.id)).totalGames, 1);
  assert.equal((await getPlayerStats(finished.winnerId)).wins, 1);
  assert.equal((await f.games.confirm(f.game.id, finished.winnerId, f.context)).winnerId, finished.winnerId);
  assert.equal((await getPlayerStats(f.creator.id)).totalGames, 1);
  await assert.rejects(f.games.cancel(f.game.id, f.creator.id, f.context), /completed|finished/i);
});

test('failed effects retain a reserved winner and restart recovery finishes the same result', async () => {
  const f = await fixture();
  await f.games.join(f.game.id, f.guest, f.context);
  await f.games.start(f.game.id, f.creator.id, f.context);
  const failing = createColonistGameSystem(createJsonStore(f.file), { recordResult: async () => { throw new Error('Disk full'); } });
  await assert.rejects(failing.confirm(f.game.id, f.guest.id, f.context), /Disk full/);
  const stored = JSON.parse(await fs.readFile(f.file, 'utf8'))[f.game.id];
  assert.equal(stored.status, 'recording');
  assert.equal(stored.winnerId, f.guest.id);
  await assert.rejects(failing.confirm(f.game.id, f.creator.id, f.context), /winner|recording|claimed/i);
  const restarted = createColonistGameSystem(createJsonStore(f.file), { recordResult: recordGameResult });
  await restarted.initialize();
  assert.equal((await restarted.get(f.game.id)).status, 'completed');
  assert.equal((await getPlayerStats(f.guest.id)).wins, 1);
  assert.equal((await getPlayerStats(f.creator.id)).totalGames, 1);
});

test('failed reservation writes apply no effects and do not reserve a winner in memory', async () => {
  const f = await fixture();
  await f.games.join(f.game.id, f.guest, f.context);
  await f.games.start(f.game.id, f.creator.id, f.context);
  const before = await fs.readFile(f.file);
  await fs.unlink(f.file);
  await fs.mkdir(f.file);
  try {
    await assert.rejects(f.games.confirm(f.game.id, f.guest.id, f.context));
    assert.equal((await f.games.get(f.game.id)).status, 'playing');
    assert.equal(await getPlayerStats(f.guest.id), null);
  } finally {
    await fs.rmdir(f.file);
    await fs.writeFile(f.file, before);
  }
});

test('a failed completed-session write retains the reserved winner and retries without reapplying results', async t => {
  const f = await fixture();
  await f.games.join(f.game.id, f.guest, f.context);
  await f.games.start(f.game.id, f.creator.id, f.context);
  const rename = fs.rename;
  const failure = t.mock.method(fs, 'rename', async (...args) => {
    if (args[1] === f.file && JSON.parse(await fs.readFile(args[0], 'utf8'))[f.game.id].status === 'completed') throw new Error('Session commit failed');
    return rename(...args);
  });
  await assert.rejects(f.games.confirm(f.game.id, f.guest.id, f.context), /Session commit failed/);
  assert.equal((await f.games.get(f.game.id)).status, 'recording');
  assert.equal((await getPlayerStats(f.guest.id)).wins, 1);
  await assert.rejects(f.games.confirm(f.game.id, f.creator.id, f.context), /winner/i);
  failure.mock.restore();
  assert.equal((await f.games.confirm(f.game.id, f.guest.id, f.context)).status, 'completed');
  assert.equal((await getPlayerStats(f.guest.id)).wins, 1);
  assert.equal((await getPlayerStats(f.creator.id)).totalGames, 1);
});
