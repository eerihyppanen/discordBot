import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const dir = await fs.mkdtemp('/tmp/pubg-manual-');
process.env.DATA_DIR = dir;
const systems = await import('../src/utils/pubgWinsSystem.js');
after(async () => {
  await systems.flushPubgWinsData();
  await systems.manualPubgStats?.flush();
  await fs.rm(dir, { recursive: true, force: true });
});

test('manual totals persist independently and survive API refreshes and restart', async () => {
  assert.equal(typeof systems.manualPubgStats?.updatePlayerWins, 'function');
  await systems.manualPubgStats.updatePlayerWins('Player', 'steam', 'steam', 50, 100, 50);
  await systems.updatePlayerWins('Player', 'steam', 'steam', 2, 20, 10);
  assert.equal((await systems.getPlayerWins('Player', 'steam')).wins, 2);
  assert.equal((await systems.manualPubgStats.getPlayerWins('Player', 'steam')).wins, 50);
  const file = `${dir}/pubgManualStats.json`;
  assert.equal(JSON.parse(await fs.readFile(file, 'utf8')).player_steam.wins, 50);
  const restarted = systems.createPubgWinsSystem(file, { saveDelayMs: 0 });
  assert.equal((await restarted.getTopPlayers())[0].wins, 50);
});

test('manual statistics write failures preserve the last saved values', async () => {
  assert.equal(typeof systems.manualPubgStats?.updatePlayerWins, 'function');
  const file = `${dir}/pubgManualStats.json`;
  const before = await fs.readFile(file);
  await fs.unlink(file);
  await fs.mkdir(file);
  try {
    await assert.rejects(systems.manualPubgStats.updatePlayerWins('Player', 'steam', 'steam', 60, 100, 60));
    assert.equal((await systems.manualPubgStats.getPlayerWins('Player', 'steam')).wins, 50);
  } finally { await fs.rmdir(file); await fs.writeFile(file, before); }
});
