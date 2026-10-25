import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'discord-pubg-records-'));
const original = process.env.DATA_DIR;
process.env.DATA_DIR = dir;
const file = path.join(dir, 'pubgWins.json');
const player = (region, wins, lastUpdated, platform = 'steam') => ({ username: 'Player', platform, region, wins, totalMatches: 20, winRate: wins * 5, lastUpdated });
const saved = {
  player_steam_steam: player('steam', 3, '2026-10-20T12:00:00.000Z'),
  player_steam_pc_eu: player('pc-eu', 8, '2026-10-24T12:00:00.000Z'),
  player_steam_pc_na: player('pc-na', 5, '2026-10-23T12:00:00.000Z'),
  player_xbox_console: player('console', 2, '2026-10-24T12:00:00.000Z', 'xbox'),
};
await fs.writeFile(file, JSON.stringify(saved));
const { getPlayerWins, getAllPlayers, updatePlayerWins, flushPubgWinsData } = await import('../src/utils/pubgWinsSystem.js');
after(async () => {
  await flushPubgWinsData();
  if (original === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = original;
  await fs.rm(dir, { recursive: true, force: true });
});

test('legacy PC regions resolve to the latest player snapshot without summing overlapping games', async () => {
  const records = await getAllPlayers();
  assert.equal(records.length, 2);
  assert.equal((await getPlayerWins('PLAYER', 'steam', 'steam')).wins, 8);
  assert.equal((await getPlayerWins('Player', 'steam', 'pc-na')).wins, 8);
  assert.equal((await getPlayerWins('Player', 'steam', 'steam')).region, 'steam');
  assert.equal((await getPlayerWins('Player', 'xbox', 'console')).wins, 2);
  const backup = (await fs.readdir(dir)).find(name => name.endsWith('.bak'));
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(dir, backup), 'utf8')), saved);
});

test('an explicit PC update replaces legacy aliases while retaining unrelated console data', async () => {
  await updatePlayerWins('Player', 'steam', 'steam', 9, 20, 45);
  await flushPubgWinsData();
  const result = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.deepEqual(Object.keys(result).sort(), ['player_steam', 'player_xbox']);
  assert.equal(result.player_steam.wins, 9);
  assert.deepEqual(result.player_xbox, { ...saved.player_xbox_console, region: 'xbox' });
});
