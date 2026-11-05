import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { MessageFlags } from 'discord.js';
import { profileRequest, profileUser, panelComponents } from './fixtures/profile-interactions.mjs';
const dir = await fs.mkdtemp('/tmp/cosmetic-panels-');
process.env.DATA_DIR = dir;
const { default: command } = await import('../src/commands/profile.js');
const { economy } = await import('../src/utils/economySystem.js');
const { profiles } = await import('../src/utils/profileSystem.js');
after(async () => { await economy.flush(); await profiles.flush(); await fs.rm(dir, { recursive: true, force: true }); });
const request = options => profileRequest(command, options);
const button = (id, section, action, target, actor = id) => request({ id: actor, type: 'button', customId: `profile:${id}:${section}:${action}:${target}` });
const select = (id, type, item, actor = id) => request({ id: actor, type: 'select', customId: `profile:${id}:inventory:equip:${type}`, values: [item] });

test('profile has exactly four commands and shop buttons show prices and ownership privately', async () => {
  assert.deepEqual(command.data.toJSON().options.map(option => option.name), ['card', 'settings', 'shop', 'inventory']);
  const shop = request({ operation: 'shop' });
  await shop.run();
  assert.equal(shop.output.flags, MessageFlags.Ephemeral);
  assert.match(JSON.stringify(shop.output.reply), /500 coins/);
  assert.equal(panelComponents(shop.output.reply).filter(component => component.custom_id.includes(':buy:')).length, 6);
});

test('buy buttons persist debit and ownership before publication and duplicate clicks charge once', async () => {
  await economy.addCoins('101', 400);
  const buy = button('101', 'shop', 'buy', 'badge-dice');
  buy.r.editReply = async payload => {
    const saved = JSON.parse(await fs.readFile(`${dir}/economy.json`, 'utf8'))['101'];
    assert.equal(saved.coins, 200);
    assert.deepEqual(saved.cosmetics.owned, ['badge-dice']);
    buy.output.reply = payload;
  };
  await buy.run();
  const owned = panelComponents(buy.output.reply).find(component => component.custom_id.endsWith(':badge-dice'));
  assert.equal(owned.disabled, true);
  assert.match(owned.label, /owned/i);
  await buy.run();
  assert.equal((await economy.getBalance('101')).coins, 200);
  assert.match(buy.output.reply.content, /already own/i);
});

test('inventory selectors contain only owned items without prices, and retain current selection', async () => {
  await economy.addCoins('201', 1000);
  await economy.buyCosmetic('201', 'title-regular');
  await economy.buyCosmetic('201', 'badge-dice');
  const inventory = request({ operation: 'inventory', id: '201' });
  await inventory.run();
  assert.equal(inventory.output.flags, MessageFlags.Ephemeral);
  const selectors = panelComponents(inventory.output.reply).filter(component => component.type === 3);
  assert.deepEqual(selectors.flatMap(component => component.options.map(option => option.value)), ['title-regular', 'badge-dice']);
  assert.doesNotMatch(JSON.stringify(inventory.output.reply), /coins|500|300|Master Tactician/);
  const equip = select('201', 'title', 'title-regular');
  await equip.run();
  assert.equal((await economy.getCosmetics('201')).equipped.title, 'title-regular');
  assert.equal(panelComponents(equip.output.reply).find(component => component.type === 3 && component.custom_id.endsWith(':title')).options[0].default, true);
  await select('201', 'badge', 'badge-dice').run();
  await button('201', 'inventory', 'remove', 'title').run();
  assert.deepEqual((await economy.getCosmetics('201')).equipped, { badge: 'badge-dice' });
  assert.equal((await economy.getCosmetics('201')).owned.length, 2);
});

test('empty inventory offers no unowned options and public cards never reveal saved usernames', async () => {
  await profiles.set('201', { pubg: 'PrivatePUBG', faceit: 'PrivateFACEIT' });
  const card = request({ operation: 'card', id: '202', target: profileUser('201') });
  await card.run();
  assert.equal(card.output.flags, undefined);
  assert.match(JSON.stringify(card.output.reply), /Dice Enthusiast/);
  assert.doesNotMatch(JSON.stringify(card.output.reply), /PrivatePUBG|PrivateFACEIT/);
  const empty = request({ operation: 'inventory', id: '202' });
  await empty.run();
  assert.equal(panelComponents(empty.output.reply).filter(component => component.type === 3).length, 0);
});

test('forged owner IDs, unowned selections and mismatched item types cannot equip or spend', async () => {
  for (const item of [button('201', 'shop', 'buy', 'badge-crown', '202'), select('201', 'badge', 'badge-dice', '202')]) {
    await item.run();
    assert.equal(item.output.reply.flags, MessageFlags.Ephemeral);
    assert.match(item.output.reply.content, /another user/i);
  }
  const unowned = select('202', 'title', 'title-legend');
  await unowned.run();
  assert.match(unowned.output.reply.content, /own/i);
  const mismatch = select('201', 'title', 'badge-dice');
  await mismatch.run();
  assert.match(mismatch.output.reply.content, /invalid|title/i);
  assert.deepEqual((await economy.getCosmetics('201')).equipped, { badge: 'badge-dice' });
});

test('shop/inventory navigation replaces the private panel and refreshes current data', async () => {
  const nav = button('201', 'shop', 'open', 'inventory');
  await nav.run();
  assert.match(nav.output.reply.embeds[0].toJSON().title, /inventory/i);
  await economy.addCoins('201', 1000);
  await economy.buyCosmetic('201', 'badge-chicken');
  const back = button('201', 'inventory', 'open', 'shop');
  await back.run();
  assert.match(back.output.reply.embeds[0].toJSON().title, /shop/i);
  assert.equal(panelComponents(back.output.reply).find(item => item.custom_id.endsWith(':badge-chicken')).disabled, true);
});

test('failed purchase writes cannot report success or change coins and inventory', async t => {
  t.mock.method(console, 'error', () => {});
  await economy.addCoins('301', 500);
  const file = `${dir}/economy.json`;
  const saved = await fs.readFile(file);
  await fs.unlink(file);
  await fs.mkdir(file);
  const buy = button('301', 'shop', 'buy', 'badge-dice');
  try {
    await buy.run();
    assert.match((buy.output.followUp ?? buy.output.reply).content, /could not.*save|couldn't.*save/i);
    assert.deepEqual((await economy.getCosmetics('301')).owned, []);
    assert.equal((await economy.getBalance('301')).coins, 600);
  } finally { await fs.rmdir(file); await fs.writeFile(file, saved); }
});

test('saved purchases remain successful when Discord cannot refresh the panel', async t => {
  t.mock.method(console, 'error', () => {});
  await economy.addCoins('401', 400);
  const buy = button('401', 'shop', 'buy', 'badge-dice');
  buy.r.editReply = async () => { throw new Error('Discord unavailable'); };
  await buy.run();
  assert.match(buy.output.followUp.content, /saved/i);
  assert.equal((await economy.getBalance('401')).coins, 200);
});

test('overlapping actions publish panels in order, leaving the latest view visible', async () => {
  await economy.addCoins('501', 400);
  let release, entered;
  const gate = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  const views = [];
  const buy = button('501', 'shop', 'buy', 'badge-dice');
  buy.r.editReply = async payload => { entered(); await gate; views.push(payload.embeds[0].toJSON().title); };
  assert.equal(typeof command.handleComponent, 'function');
  const buying = buy.run();
  await started;
  const nav = button('501', 'shop', 'open', 'inventory');
  nav.r.editReply = async payload => { views.push(payload.embeds[0].toJSON().title); };
  const navigating = nav.run();
  release();
  await Promise.all([buying, navigating]);
  assert.match(views[0], /shop/i);
  assert.match(views[1], /inventory/i);
});

test('an acknowledgement failure behind a slow panel cannot become an unhandled rejection', async () => {
  const commandUrl = new URL('../src/commands/profile.js', import.meta.url).href;
  const helperUrl = new URL('./fixtures/profile-interactions.mjs', import.meta.url).href;
  const economyUrl = new URL('../src/utils/economySystem.js', import.meta.url).href;
  const script = `
    import assert from 'node:assert/strict';
    import command from '${commandUrl}';
    import { profileRequest } from '${helperUrl}';
    import { economy } from '${economyUrl}';
    const unhandled = [];
    process.on('unhandledRejection', error => unhandled.push(error.message));
    console.error = () => {};
    await economy.addCoins('601', 400);
    let release, entered;
    const gate = new Promise(resolve => { release = resolve; });
    const started = new Promise(resolve => { entered = resolve; });
    const first = profileRequest(command, { id: '601', type: 'button', customId: 'profile:601:shop:buy:badge-dice' });
    first.r.editReply = async () => { entered(); await gate; };
    const buying = first.run();
    await started;
    const second = profileRequest(command, { id: '601', type: 'button', customId: 'profile:601:shop:buy:title-regular' });
    second.r.deferUpdate = async () => { throw new Error('Acknowledgement expired'); };
    const rejected = second.run();
    await new Promise(resolve => setImmediate(resolve));
    release();
    await Promise.all([buying, rejected]);
    assert.deepEqual(unhandled, []);
    assert.equal((await economy.getBalance('601')).coins, 200);
    assert.deepEqual((await economy.getCosmetics('601')).owned, ['badge-dice']);
  `;
  await promisify(execFile)(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, DATA_DIR: dir + '/ack-child' }, timeout: 10000 });
});
