import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createJsonStore } from '../src/utils/jsonStore.js';
import { createEconomySystem } from '../src/utils/economySystem.js';

const fixture = async (t, options) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'discord-store-'));
  const file = path.join(dir, 'economy.json');
  const store = createJsonStore(file, options);
  t.after(async () => { await store.flush(); await fs.rm(dir, { recursive: true, force: true }); });
  return { dir, file, store, economy: createEconomySystem(store) };
};

test('concurrent rewards for different users all survive on disk', async (t) => {
  const { file, economy } = await fixture(t);
  await Promise.all(Array.from({ length: 20 }, (_, i) => economy.claimDaily(String(i), { reward: 200 })));
  const saved = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(Object.keys(saved).length, 20);
  assert.ok(Object.values(saved).every((user) => user.coins === 300));
});

test('daily cooldown and coin changes are serialized for the same user', async (t) => {
  const { economy } = await fixture(t);
  const claims = await Promise.all(Array.from({ length: 10 }, () => economy.claimDaily('user', { reward: 200 })));
  assert.equal(claims.filter((result) => result.claimed).length, 1);
  await Promise.all(Array.from({ length: 20 }, () => economy.addCoins('user', 5)));
  assert.equal((await economy.getBalance('user')).coins, 400);
  const bets = await Promise.all(Array.from({ length: 10 }, () => economy.updateUser('user', (user) => {
    if (user.coins < 100) return false;
    user.coins -= 100;
    return true;
  })));
  assert.equal(bets.filter(Boolean).length, 4);
  assert.equal((await economy.getBalance('user')).coins, 0);
});

test('a failed replacement keeps the last committed balance and does not poison the queue', async (t) => {
  const { file, economy } = await fixture(t);
  await economy.addCoins('user', 5);
  await fs.unlink(file);
  await fs.mkdir(file);
  await assert.rejects(economy.addCoins('user', 10));
  await fs.rmdir(file);
  assert.equal((await economy.getBalance('user')).coins, 105);
  assert.equal(await economy.addCoins('user', 1), 106);
  assert.deepEqual((await fs.readdir(path.dirname(file))).filter((name) => name.endsWith('.tmp')), []);
});

test('corrupt data is preserved and reported rather than replaced with empty state', async (t) => {
  const { file, economy } = await fixture(t);
  await fs.writeFile(file, '{broken');
  await assert.rejects(economy.addCoins('user', 1), SyntaxError);
  assert.equal(await fs.readFile(file, 'utf8'), '{broken');
});

test('batched data is flushed explicitly and reads cannot mutate the cache', async (t) => {
  const { file, store } = await fixture(t, { saveDelayMs: 300000 });
  await store.update((data) => { data.user = { xp: 15 }; });
  await assert.rejects(fs.readFile(file), { code: 'ENOENT' });
  const copy = await store.read();
  copy.user.xp = 999;
  await store.flush();
  assert.equal(JSON.parse(await fs.readFile(file, 'utf8')).user.xp, 15);
});
