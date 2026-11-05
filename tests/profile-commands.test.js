import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { MessageFlags } from 'discord.js';
import { profileRequest, panelComponents } from './fixtures/profile-interactions.mjs';

const dir = await fs.mkdtemp('/tmp/profile-commands-');
process.env.DATA_DIR = dir;
process.env.PUBG_API_KEY = 'offline-profile-test';
process.env.FACEIT_API_KEY = 'offline-profile-test';
const { profiles } = await import('../src/utils/profileSystem.js');
const { flushPubgWinsData } = await import('../src/utils/pubgWinsSystem.js');
const { default: pubg } = await import('../src/commands/pubg.js');
const { default: faceit } = await import('../src/commands/faceit.js');
after(async () => { await profiles.flush(); await flushPubgWinsData(); await fs.rm(dir, { recursive: true, force: true }); });
const request = (subcommand, strings = {}, id = '101') => {
  const output = {};
  const interaction = {
    user: { id, username: 'DiscordPlayer' },
    options: { getSubcommand: () => subcommand, getString: name => strings[name] ?? null },
    deferReply: async options => { output.flags = options?.flags; interaction.deferred = true; },
    editReply: async payload => { output.reply = payload; },
  };
  return { interaction, output };
};
const content = output => typeof output.reply === 'string' ? output.reply : output.reply.content;

const { default: profileCommand } = await import('../src/commands/profile.js');
const panel = options => profileRequest(profileCommand, options);

test('settings edit buttons open owner-bound modals and save one name before updating the panel', async () => {
  const open = panel({ operation: 'settings' });
  await open.run();
  assert.equal(open.output.flags, MessageFlags.Ephemeral);
  assert.ok(panelComponents(open.output.reply).some(item => item.custom_id === 'profile:101:settings:edit:pubg'));
  const edit = panel({ type: 'button', customId: 'profile:101:settings:edit:pubg' });
  await edit.run();
  assert.equal(edit.output.modal.custom_id, 'profile:101:settings:save:pubg');
  const save = panel({ type: 'modal', customId: edit.output.modal.custom_id, username: 'MyPUBG' });
  save.r.editReply = async payload => {
    assert.equal(JSON.parse(await fs.readFile(`${dir}/playerProfiles.json`, 'utf8'))['101'].pubg, 'MyPUBG');
    save.output.reply = payload;
  };
  await save.run();
  assert.match(save.output.reply.content, /saved/i);
  await panel({ type: 'modal', customId: 'profile:101:settings:save:faceit', username: 'MyFACEIT' }).run();
  assert.deepEqual(await profiles.get('101'), { pubg: 'MyPUBG', faceit: 'MyFACEIT' });
  await panel({ type: 'button', customId: 'profile:101:settings:clear:pubg' }).run();
  assert.deepEqual(await profiles.get('101'), { faceit: 'MyFACEIT' });
});

test('settings reject forged owners, invalid actions and blank modal values', async () => {
  for (const options of [
    { id: '102', type: 'button', customId: 'profile:101:settings:clear:all' },
    { id: '102', type: 'modal', customId: 'profile:101:settings:save:faceit', username: 'Stolen' },
    { type: 'button', customId: 'profile:101:settings:edit:unknown' },
    { type: 'button', customId: 'profile:101:settings:save:pubg' },
  ]) {
    const item = panel(options);
    await item.run();
    assert.equal(item.output.reply.flags, MessageFlags.Ephemeral);
    assert.match(item.output.reply.content, /another user|invalid|out of date/i);
  }
  const blank = panel({ type: 'modal', customId: 'profile:101:settings:save:faceit', username: ' ' });
  await blank.run();
  assert.match(blank.output.reply.content, /username/i);
  assert.deepEqual(await profiles.get('101'), { faceit: 'MyFACEIT' });
});

test('failed modal writes do not claim success or change saved settings', async t => {
  t.mock.method(console, 'error', () => {});
  const file = `${dir}/playerProfiles.json`;
  const saved = await fs.readFile(file);
  await fs.unlink(file);
  await fs.mkdir(file);
  const save = panel({ type: 'modal', customId: 'profile:101:settings:save:pubg', username: 'Unsaved' });
  try {
    await save.run();
    assert.match((save.output.followUp ?? save.output.reply).content, /could not.*save|couldn't.*save/i);
    assert.deepEqual(await profiles.get('101'), { faceit: 'MyFACEIT' });
  } finally { await fs.rmdir(file); await fs.writeFile(file, saved); }
});

test('cached removed slash commands redirect safely without applying their old inputs', async () => {
  const legacy = panel({ operation: 'set' });
  legacy.r.options.getString = () => 'DoNotSave';
  await legacy.run();
  assert.equal(legacy.output.flags, MessageFlags.Ephemeral);
  assert.match(legacy.output.reply.content, /updated|changed/i);
  assert.deepEqual(await profiles.get('101'), { faceit: 'MyFACEIT' });
});

test('clearing all saved names preserves purchased cosmetics and the wallet', async () => {
  const { economy } = await import('../src/utils/economySystem.js');
  await profiles.set('301', { pubg: 'PrivateName', faceit: 'PrivateFaceit' });
  await economy.addCoins('301', 400);
  await economy.buyCosmetic('301', 'badge-dice');
  await panel({ id: '301', type: 'button', customId: 'profile:301:settings:clear:all' }).run();
  assert.deepEqual(await profiles.get('301'), {});
  assert.deepEqual((await economy.getCosmetics('301')).owned, ['badge-dice']);
  assert.equal((await economy.getBalance('301')).coins, 200);
});

test('a modal without a source message opens a private settings reply', async () => {
  const save = panel({ id: '401', type: 'modal', customId: 'profile:401:settings:save:pubg', username: 'MyNewName' });
  save.r.isFromMessage = () => false;
  save.r.message = undefined;
  await save.run();
  assert.equal(save.output.flags, MessageFlags.Ephemeral);
  assert.deepEqual(await profiles.get('401'), { pubg: 'MyNewName' });
});

test('PUBG and FACEIT use saved usernames when omitted and allow explicit overrides', async t => {
  await profiles.set('103', { pubg: 'SavedPUBG', faceit: 'SavedFACEIT' });
  assert.equal(pubg.data.toJSON().options[0].options[0].required, false);
  assert.equal(faceit.data.toJSON().options[0].required, false);
  const urls = [];
  t.mock.method(globalThis, 'fetch', async url => {
    urls.push(new URL(url));
    if (url.includes('api.pubg.com')) {
      const name = new URL(url).searchParams.get('filter[playerNames]');
      return { ok: true, json: async () => ({ data: [{ id: name, attributes: { name }, relationships: { matches: { data: [] } } }] }) };
    }
    return { ok: true, json: async () => url.includes('/stats/') ? { lifetime: { Matches: 1 } } : {
      player_id: 'faceit-player', nickname: 'SavedFACEIT', games: { cs2: { skill_level: 5, faceit_elo: 1200 } },
    } };
  });
  for (const [command, subcommand] of [[pubg, 'stats'], [faceit, null]]) {
    await command.execute(request(subcommand, {}, '103').interaction);
    await command.execute(request(subcommand, { username: command === pubg ? 'OtherPUBG' : 'OtherFACEIT' }, '103').interaction);
  }
  assert.deepEqual(urls.filter(url => url.hostname === 'api.pubg.com').map(url => url.searchParams.get('filter[playerNames]')), ['SavedPUBG', 'OtherPUBG']);
  assert.deepEqual(urls.filter(url => url.searchParams.has('nickname')).map(url => url.searchParams.get('nickname')), ['SavedFACEIT', 'OtherFACEIT']);
  assert.deepEqual(await profiles.get('103'), { pubg: 'SavedPUBG', faceit: 'SavedFACEIT' });
});

test('omitting a username without a saved profile gives a useful setup instruction', async () => {
  for (const [command, subcommand, game] of [[pubg, 'stats', 'pubg'], [faceit, null, 'faceit']]) {
    const item = request(subcommand, {}, '104');
    await command.execute(item.interaction);
    assert.match(content(item.output), /\/profile settings/);
  }
});
