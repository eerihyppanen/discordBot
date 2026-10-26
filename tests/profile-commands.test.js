import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { MessageFlags } from 'discord.js';

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

test('/profile manages only the caller’s names and saves them before acknowledging', async () => {
  const { default: command } = await import('../src/commands/profile.js');
  assert.deepEqual(command.data.toJSON().options.map(option => option.name), ['set', 'show', 'clear']);
  const set = request('set', { pubg: 'MyPUBG', faceit: 'MyFACEIT' });
  set.interaction.editReply = async payload => {
    assert.equal(JSON.parse(await fs.readFile(`${dir}/playerProfiles.json`, 'utf8'))['101'].pubg, 'MyPUBG');
    set.output.reply = payload;
  };
  await command.execute(set.interaction);
  assert.equal(set.output.flags, MessageFlags.Ephemeral);
  assert.match(content(set.output), /saved/i);
  const show = request('show');
  await command.execute(show.interaction);
  assert.match(JSON.stringify(show.output.reply), /MyPUBG/);
  const clear = request('clear', { game: 'pubg' });
  await command.execute(clear.interaction);
  assert.deepEqual(await profiles.get('101'), { faceit: 'MyFACEIT' });
  const other = request('show', {}, '102');
  await command.execute(other.interaction);
  assert.doesNotMatch(JSON.stringify(other.output.reply), /MyFACEIT/);
});

test('/profile rejects an empty update and does not confirm a failed disk write', async () => {
  const { default: command } = await import('../src/commands/profile.js');
  const empty = request('set');
  await command.execute(empty.interaction);
  assert.match(content(empty.output), /at least one/i);
  const file = `${dir}/playerProfiles.json`;
  const saved = await fs.readFile(file);
  await fs.unlink(file);
  await fs.mkdir(file);
  const set = request('set', { pubg: 'Unsaved' });
  try {
    await assert.rejects(command.execute(set.interaction));
    assert.equal(set.output.reply, undefined);
  } finally { await fs.rmdir(file); await fs.writeFile(file, saved); }
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
    assert.match(content(item.output), new RegExp('/profile set.*' + game));
  }
});
