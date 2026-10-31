import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { MessageFlags } from 'discord.js';
const dir = await fs.mkdtemp('/tmp/cosmetic-commands-');
process.env.DATA_DIR = dir;
const { default: command } = await import('../src/commands/profile.js');
const { economy } = await import('../src/utils/economySystem.js');
const { profiles } = await import('../src/utils/profileSystem.js');
after(async () => { await economy.flush(); await profiles.flush(); await fs.rm(dir, { recursive: true, force: true }); });
const user = id => ({ id, username: 'Player ' + id, displayAvatarURL: () => 'https://example.com/avatar.png' });
const request = (operation, strings = {}, actor = '101', target) => {
  const output = {};
  const r = { user: user(actor), options: { getSubcommand: () => operation, getString: key => strings[key] ?? null, getUser: () => target },
    deferReply: async options => { output.flags = options?.flags; r.deferred = true; },
    editReply: async payload => { output.reply = payload; } };
  return { r, output };
};

test('shop exposes fixed prices privately under the existing profile command', async () => {
  const metadata = command.data.toJSON().options;
  for (const name of ['shop', 'buy', 'inventory', 'equip', 'unequip', 'card']) assert.ok(metadata.some(option => option.name === name));
  const item = request('shop');
  await command.execute(item.r);
  assert.equal(item.output.flags, MessageFlags.Ephemeral);
  assert.match(JSON.stringify(item.output.reply), /The Regular/);
  assert.match(JSON.stringify(item.output.reply), /500 coins/);
});

test('buy confirms saved ownership and wallet debit, and retrying does not charge twice', async () => {
  await economy.addCoins('101', 400);
  const item = request('buy', { item: 'badge-dice' });
  item.r.editReply = async payload => {
    const saved = JSON.parse(await fs.readFile(`${dir}/economy.json`, 'utf8'))['101'];
    assert.equal(saved.coins, 200);
    assert.deepEqual(saved.cosmetics.owned, ['badge-dice']);
    item.output.reply = payload;
  };
  await command.execute(item.r);
  assert.equal(item.output.flags, MessageFlags.Ephemeral);
  assert.match(item.output.reply.content, /purchased/i);
  await command.execute(item.r);
  assert.match(item.output.reply.content, /already own/i);
  assert.equal((await economy.getBalance('101')).coins, 200);
});

test('equipped cosmetics are public on cards while game usernames stay private', async () => {
  await profiles.set('201', { pubg: 'PrivatePUBGName', faceit: 'PrivateFACEITName' });
  await economy.addCoins('201', 1000);
  for (const cosmetic of ['title-regular', 'badge-dice']) {
    await command.execute(request('buy', { item: cosmetic }, '201').r);
    await command.execute(request('equip', { item: cosmetic }, '201').r);
  }
  const card = request('card', {}, '202', user('201'));
  await command.execute(card.r);
  assert.equal(card.output.flags, undefined);
  const text = JSON.stringify(card.output.reply);
  assert.match(text, /The Regular/);
  assert.match(text, /Dice Enthusiast/);
  assert.doesNotMatch(text, /PrivatePUBGName|PrivateFACEITName/);
  const settings = request('show', {}, '201');
  await command.execute(settings.r);
  assert.equal(settings.output.flags, MessageFlags.Ephemeral);
  assert.match(JSON.stringify(settings.output.reply), /PrivatePUBGName/);
  await command.execute(request('clear', { game: 'all' }, '201').r);
  assert.equal((await economy.getCosmetics('201')).owned.length, 2);
  const unequip = request('unequip', { type: 'title' }, '201');
  await command.execute(unequip.r);
  assert.equal((await economy.getCosmetics('201')).equipped.title, undefined);
  assert.equal((await economy.getCosmetics('201')).equipped.badge, 'badge-dice');
});

test('inventory and equip operate on the caller, regardless of a different target user', async () => {
  const denied = request('equip', { item: 'badge-dice' }, '202', user('201'));
  await command.execute(denied.r);
  assert.match(denied.output.reply.content, /own/i);
  assert.equal(denied.output.flags, MessageFlags.Ephemeral);
  const inventory = request('inventory');
  await command.execute(inventory.r);
  assert.match(JSON.stringify(inventory.output.reply), /Dice Enthusiast/);
  const before = await fs.readFile(`${dir}/economy.json`, 'utf8');
  await command.execute(request('card', {}, '202', user('404')).r);
  assert.equal(await fs.readFile(`${dir}/economy.json`, 'utf8'), before);
});

test('a failed purchase write cannot produce a success reply', async () => {
  await economy.addCoins('301', 500);
  const file = `${dir}/economy.json`;
  const saved = await fs.readFile(file);
  await fs.unlink(file);
  await fs.mkdir(file);
  const item = request('buy', { item: 'badge-dice' }, '301');
  try {
    await assert.rejects(command.execute(item.r));
    assert.equal(item.output.reply, undefined);
    assert.deepEqual((await economy.getCosmetics('301')).owned, []);
    assert.equal((await economy.getBalance('301')).coins, 600);
  } finally { await fs.rmdir(file); await fs.writeFile(file, saved); }
});
