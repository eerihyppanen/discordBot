import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'discord-pubg-'));
const originalDataDir = process.env.DATA_DIR;
const originalKey = process.env.PUBG_API_KEY;
process.env.DATA_DIR = dir;
process.env.PUBG_API_KEY = 'offline-test-key';
const { default: pubg } = await import('../src/commands/pubg.js');
const { default: wins } = await import('../src/commands/pubg-wins.js');
const { getPlayerWins, flushPubgWinsData } = await import('../src/utils/pubgWinsSystem.js');
after(async () => {
  await flushPubgWinsData();
  if (originalDataDir === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = originalDataDir;
  if (originalKey === undefined) delete process.env.PUBG_API_KEY; else process.env.PUBG_API_KEY = originalKey;
  await fs.rm(dir, { recursive: true, force: true });
});

const run = async (command, username = 'Player') => {
  let reply;
  const request = {
    // Stale registered console options must never redirect a PC lookup.
    options: { getString: name => ({ username, platform: 'xbox', region: 'console' })[name] },
    deferReply: async () => {},
    editReply: async payload => { reply = payload.embeds ? payload.embeds[0].toJSON() : payload; },
  };
  await command.execute(request);
  return reply;
};
const response = data => ({ ok: true, status: 200, json: async () => data });
const player = { id: 'pc-account', attributes: { name: 'Player' }, relationships: { matches: { data: [{ id: 'match-1' }] } } };
const match = { included: [{ type: 'participant', attributes: { stats: {
  playerId: 'pc-account', name: 'Player', winPlace: 1, kills: 3, damageDealt: 100,
  timeSurvived: 600, longestKill: 50, walkDistance: 1500,
} } }] };

for (const command of [pubg, wins]) {
  test(`${command.data.name} queries only Steam PC and publishes the returned stats`, async t => {
    assert.deepEqual(command.data.toJSON().options.map(option => option.name), ['username']);
    const urls = [];
    t.mock.method(globalThis, 'fetch', async (url, options) => {
      urls.push(url);
      assert.equal(new URL(url).pathname.split('/')[2], 'steam');
      assert.ok(options.signal instanceof AbortSignal);
      return response(url.includes('/players?') ? { data: [player] } : match);
    });
    const reply = await run(command, 'Player & Other');
    assert.equal(urls.length, 2);
    assert.equal(new URL(urls[0]).searchParams.get('filter[playerNames]'), 'Player & Other');
    assert.equal(new URL(urls[1]).pathname, '/shards/steam/matches/match-1');
    if (command === pubg) {
      assert.equal(reply.fields.find(field => field.name === 'Platform').value, 'STEAM');
      assert.equal(reply.fields.find(field => field.name === 'Kills').value, '3');
    } else {
      const saved = await getPlayerWins('Player', 'steam', 'steam');
      assert.equal(saved.wins, 1);
      assert.equal(saved.totalMatches, 1);
      assert.equal(await getPlayerWins('Player & Other', 'xbox', 'console'), null);
      assert.match(reply.description, /STEAM/);
    }
  });

  test(`${command.data.name} stops after a PC player is not found`, async t => {
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async () => { calls++; return { ok: false, status: 404 }; });
    assert.match(await run(command), /Player not found/);
    assert.equal(calls, 1);
  });

  test(`${command.data.name} reports service failures without trying other platforms`, async t => {
    let calls = 0;
    t.mock.method(console, 'error', () => {});
    t.mock.method(globalThis, 'fetch', async () => { calls++; return { ok: false, status: 401 }; });
    assert.match(await run(command), /Error fetching PUBG/);
    assert.equal(calls, 1);
  });
}
