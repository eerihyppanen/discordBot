import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createJsonStore } from '../src/utils/jsonStore.js';
import { createEconomySystem } from '../src/utils/economySystem.js';
import { COSMETICS } from '../src/utils/cosmeticCatalog.js';

const fixture = async (t, balance = 1000) => {
  const dir = await fs.mkdtemp('/tmp/bot-cosmetics-');
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = `${dir}/economy.json`;
  const economy = createEconomySystem(createJsonStore(file));
  await economy.updateUser('101', user => { user.coins = balance; user.bank = 75; });
  return { economy, file };
};

test('catalog IDs are unique and every cosmetic has a positive fixed price', () => {
  assert.equal(COSMETICS.length, 6);
  assert.equal(new Set(COSMETICS.map(item => item.id)).size, COSMETICS.length);
  for (const item of COSMETICS) {
    assert.ok(['title', 'badge'].includes(item.type));
    assert.ok(Number.isSafeInteger(item.price) && item.price >= 300 && item.price <= 2500);
  }
});

test('concurrent duplicate purchases charge once and ownership survives restart', async t => {
  const { economy, file } = await fixture(t);
  const results = await Promise.all(Array.from({ length: 12 }, () => economy.buyCosmetic('101', 'title-regular')));
  assert.equal(results.filter(result => !result.alreadyOwned).length, 1);
  assert.equal((await economy.getBalance('101')).coins, 500);
  assert.equal((await economy.getBalance('101')).bank, 75);
  const restarted = createEconomySystem(createJsonStore(file));
  assert.deepEqual((await restarted.getCosmetics('101')).owned, ['title-regular']);
  assert.equal((await restarted.buyCosmetic('101', 'title-regular')).alreadyOwned, true);
  assert.equal((await restarted.getBalance('101')).coins, 500);
});

test('competing purchases cannot overspend and concurrent coin rewards are preserved', async t => {
  const { economy } = await fixture(t, 500);
  const result = await Promise.allSettled([
    economy.buyCosmetic('101', 'badge-dice'), economy.buyCosmetic('101', 'title-regular'), economy.addCoins('101', 50),
  ]);
  assert.equal(result[0].status, 'fulfilled');
  assert.equal(result[1].status, 'rejected');
  assert.equal((await economy.getBalance('101')).coins, 250);
  assert.deepEqual((await economy.getCosmetics('101')).owned, ['badge-dice']);
});

test('only owned cosmetics can be equipped and unequipping preserves ownership', async t => {
  const { economy, file } = await fixture(t);
  await assert.rejects(economy.equipCosmetic('101', 'title-regular'), /own/i);
  await economy.buyCosmetic('101', 'title-regular');
  await economy.buyCosmetic('101', 'badge-dice');
  await Promise.all([economy.equipCosmetic('101', 'title-regular'), economy.equipCosmetic('101', 'badge-dice')]);
  await economy.unequipCosmetic('101', 'title');
  const restarted = createEconomySystem(createJsonStore(file));
  assert.deepEqual((await restarted.getCosmetics('101')).equipped, { badge: 'badge-dice' });
  await restarted.unequipCosmetic('101', 'all');
  assert.deepEqual((await restarted.getCosmetics('101')).equipped, {});
  assert.equal((await restarted.getCosmetics('101')).owned.length, 2);
  assert.deepEqual(await restarted.getCosmetics('102'), { owned: [], equipped: {} });
});

test('invalid IDs, insufficient funds and another user’s inventory cannot bypass purchases', async t => {
  const { economy } = await fixture(t, 100);
  await assert.rejects(economy.buyCosmetic('101', 'badge-dice'), /coins/i);
  await assert.rejects(economy.buyCosmetic('101', '__proto__'), /cosmetic/i);
  await assert.rejects(economy.buyCosmetic('__proto__', 'badge-dice'), /user/i);
  await assert.rejects(economy.unequipCosmetic('101', 'unknown'));
  await economy.addCoins('101', 500);
  await economy.buyCosmetic('101', 'badge-dice');
  await assert.rejects(economy.equipCosmetic('102', 'badge-dice'), /own/i);
});

test('failed purchase and equip writes preserve both coins and inventory', async t => {
  const { economy, file } = await fixture(t);
  await economy.buyCosmetic('101', 'badge-dice');
  const previous = await fs.readFile(file);
  await fs.unlink(file);
  await fs.mkdir(file);
  try {
    await assert.rejects(economy.buyCosmetic('101', 'title-regular'));
    await assert.rejects(economy.equipCosmetic('101', 'badge-dice'));
    assert.equal((await economy.getBalance('101')).coins, 700);
    assert.deepEqual(await economy.getCosmetics('101'), { owned: ['badge-dice'], equipped: {} });
  } finally { await fs.rmdir(file); await fs.writeFile(file, previous); }
});
