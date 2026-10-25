import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createPubgWinsSystem } from '../src/utils/pubgWinsSystem.js';

const player = (region, wins, lastUpdated) => ({ username: 'Player', platform: 'steam', region, wins, totalMatches: 20, winRate: wins * 5, lastUpdated });

test('regional snapshots migrate to one player, retain the newest and back up every original row', async () => {
  const directory = await fs.mkdtemp('/tmp/pubg-migration-');
  const file = `${directory}/pubgWins.json`;
  const original = {
    player_steam_pc_eu: player('pc-eu', 10, '2026-01-01T00:00:00Z'),
    player_steam_steam: player('steam', 2, '2026-01-02T00:00:00Z'),
    player_xbox_console: { ...player('console', 1, '2026-01-02T00:00:00Z'), platform: 'xbox' },
  };
  await fs.writeFile(file, JSON.stringify(original));
  const system = createPubgWinsSystem(file);
  try {
    await Promise.all([system.initialize(), system.initialize()]);
    const top = await system.getTopPlayers();
    assert.equal(top.length, 2);
    assert.equal((await system.getPlayerWins('PLAYER', 'steam', 'pc-eu')).wins, 2);
    const backups = (await fs.readdir(directory)).filter(name => name.endsWith('.bak'));
    assert.equal(backups.length, 1);
    assert.deepEqual(JSON.parse(await fs.readFile(`${directory}/${backups[0]}`, 'utf8')), original);
    await system.updatePlayerWins(' Player ', 'steam', 'pc-na', 5, 20, 25);
    await system.updatePlayerWins('player', 'steam', 'steam', 6, 20, 30);
    assert.equal((await system.getAllPlayers()).length, 2);
    assert.equal((await system.getPlayerWins('Player', 'steam')).wins, 6);
    await system.flush();
    const restarted = createPubgWinsSystem(file);
    await restarted.initialize();
    assert.equal((await restarted.getAllPlayers()).length, 2);
    assert.equal((await fs.readdir(directory)).filter(name => name.endsWith('.bak')).length, 1);
  } finally { await system.flush(); await fs.rm(directory, { recursive: true, force: true }); }
});

test('an unreadable migration backup destination does not alter original PUBG data', async t => {
  const directory = await fs.mkdtemp('/tmp/pubg-backup-failure-');
  const file = `${directory}/pubgWins.json`;
  const original = JSON.stringify({ old: player('pc-eu', 2, '2026-01-01T00:00:00Z') });
  await fs.writeFile(file, original);
  const system = createPubgWinsSystem(file);
  t.mock.method(fs, 'copyFile', async () => { throw new Error('Disk full'); });
  try {
    await assert.rejects(system.initialize(), /Disk full/);
    await system.flush();
    assert.equal(await fs.readFile(file, 'utf8'), original);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('equal timestamps prefer an existing canonical record without adding duplicate wins', async () => {
  const directory = await fs.mkdtemp('/tmp/pubg-tied-snapshots-');
  const file = `${directory}/pubgWins.json`;
  const date = '2026-01-01T00:00:00Z';
  await fs.writeFile(file, JSON.stringify({
    player_steam_pc_eu: player('pc-eu', 10, date),
    player_steam: player('steam', 3, date),
    player_steam_steam: player('steam', 15, date),
  }));
  const system = createPubgWinsSystem(file);
  try {
    const players = await system.getAllPlayers();
    assert.equal(players.length, 1);
    assert.equal(players[0].wins, 3);
  } finally { await system.flush(); await fs.rm(directory, { recursive: true, force: true }); }
});
