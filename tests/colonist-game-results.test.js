import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'colonist-game-result-'));
process.env.DATA_DIR = dir;
const colonist = await import('../src/utils/colonistSystem.js');
const { economy } = await import('../src/utils/economySystem.js');
const { getUserLevel, flushLevelingData } = await import('../src/utils/levelingSystem.js');
after(async () => { await colonist.flushColonistData(); await flushLevelingData(); await fs.rm(dir, { recursive: true, force: true }); });
const game = (id, prefix, finishedAt = Date.parse('2026-10-26T12:00:00Z')) => ({
  id, guildId: 'guild', finishedAt, winnerId: prefix + '1',
  players: [1, 2, 3].map(n => ({ id: prefix + n, username: 'Player ' + n })),
});
const record = async value => {
  assert.equal(typeof colonist.recordGameResult, 'function');
  return colonist.recordGameResult(value);
};

test('one game durably records one winner, every loser and rewards exactly once under concurrent retries', async () => {
  const value = game('first-game', '10');
  const outcomes = await Promise.all(Array.from({ length: 6 }, () => record(value)));
  assert.equal(outcomes.filter(result => !result.alreadyRecorded).length, 1);
  const saved = JSON.parse(await fs.readFile(path.join(dir, 'colonistWins.json'), 'utf8'));
  assert.equal(saved['101'].wins, 1);
  assert.equal(saved['101'].totalGames, 1);
  for (const id of ['102', '103']) {
    assert.equal(saved[id].wins, 0);
    assert.equal(saved[id].totalGames, 1);
    assert.equal(saved[id].currentStreak, 0);
  }
  assert.equal((await economy.getBalance('101')).coins, 200);
  assert.equal((await getUserLevel('101')).xp, 50);
  await assert.rejects(record({ ...value, winnerId: '102' }), /already|different winner/i);
  await assert.rejects(record({ ...value, guildId: 'other' }), /already|different/i);
});

test('reward cooldown never discards games or postpones the next eligible reward', async () => {
  const value = game('cooldown-game-one', '20');
  await record(value);
  const skipped = await record({ ...value, id: 'cooldown-game-two', finishedAt: value.finishedAt + 10 * 60_000 });
  assert.equal(skipped.rewarded, false);
  assert.equal(skipped.coinReward, 0);
  assert.equal((await colonist.getPlayerStats('201')).wins, 2);
  assert.equal((await colonist.getPlayerStats('202')).totalGames, 2);
  assert.equal((await economy.getBalance('201')).coins, 200);
  assert.equal((await getUserLevel('201')).xp, 50);
  const eligible = await record({ ...value, id: 'cooldown-game-three', finishedAt: value.finishedAt + 30 * 60_000 });
  assert.equal(eligible.rewarded, true);
  assert.equal((await economy.getBalance('201')).coins, 350);
  assert.equal((await getUserLevel('201')).xp, 125);
  assert.equal((await colonist.getPlayerStats('201')).wins, 3);
});

test('an interrupted XP save protects all participants and retries without duplicating rewards or losses', async t => {
  const value = game('interrupted-game', '30');
  const rename = fs.rename;
  const failure = t.mock.method(fs, 'rename', async (...args) => {
    if (args[1] === path.join(dir, 'userLevels.json')) throw new Error('XP save failed');
    return rename(...args);
  });
  await assert.rejects(record(value), /XP save failed/);
  assert.equal(await colonist.getPlayerStats('301'), null);
  assert.equal(await colonist.getPlayerStats('302'), null);
  assert.equal((await economy.getBalance('301')).coins, 200);
  await assert.rejects(colonist.addLoss('302', 'Player 2'), /previous|pending|finish/i);
  failure.mock.restore();
  await record(value);
  assert.equal((await economy.getBalance('301')).coins, 200);
  assert.equal((await getUserLevel('301')).xp, 50);
  assert.equal((await colonist.getPlayerStats('302')).totalGames, 1);
});

test('a failed stats replacement is retried before reporting durable success', async t => {
  const value = game('stats-write-game', '40');
  const rename = fs.rename;
  const failure = t.mock.method(fs, 'rename', async (...args) => {
    if (args[1] === path.join(dir, 'colonistWins.json')) throw new Error('Stats save failed');
    return rename(...args);
  });
  await assert.rejects(record(value), /Stats save failed/);
  failure.mock.restore();
  await record(value);
  const saved = JSON.parse(await fs.readFile(path.join(dir, 'colonistWins.json'), 'utf8'));
  assert.equal(saved['401'].wins, 1);
  assert.equal(saved['402'].totalGames, 1);
  assert.equal((await economy.getBalance('401')).coins, 200);
});

test('a moderator fallback reward also starts the shared reward cooldown for later game sessions', async () => {
  const value = game('mixed-mode-first', '60');
  await record(value);
  await colonist.recordWinWithRewards('601', 'Player 1', { matchId: 'mixed-mode-legacy', confirmedBy: 'moderator', guildId: 'guild', now: value.finishedAt + 31 * 60_000 });
  const result = await record({ ...value, id: 'mixed-mode-next', finishedAt: value.finishedAt + 32 * 60_000 });
  assert.equal(result.rewarded, false);
  assert.equal((await economy.getBalance('601')).coins, 300);
  assert.equal((await colonist.getPlayerStats('601')).wins, 3);
});

test('skipped session rewards do not delay the next eligible legacy confirmation', async () => {
  const value = game('legacy-shared-first', '80');
  await record(value);
  await record({ ...value, id: 'legacy-shared-skipped', finishedAt: value.finishedAt + 29 * 60_000 });
  await colonist.recordWinWithRewards('801', 'Player 1', { matchId: 'legacy-shared-next', confirmedBy: 'moderator', guildId: 'guild', now: value.finishedAt + 31 * 60_000 });
  assert.equal((await economy.getBalance('801')).coins, 350);
  assert.equal((await colonist.getPlayerStats('801')).wins, 3);
});
