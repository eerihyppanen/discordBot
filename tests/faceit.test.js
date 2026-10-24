import test from 'node:test';
import assert from 'node:assert/strict';
import { getFaceitStats, faceitErrorMessage } from '../src/utils/faceitClient.js';
import command from '../src/commands/faceit.js';

const profile = { player_id: 'account-id', nickname: 'Player', country: 'fi', games: { cs2: { skill_level: 5, faceit_elo: 1300 } } };
const lifetime = { Matches: 100, Wins: 0, 'Win Rate %': 0, 'Average K/D Ratio': '1.25', 'Average Headshots %': '48' };
const response = data => ({ ok: true, json: async () => data });

test('FACEIT requests a separate stats endpoint, encodes the nickname and applies timeouts', async () => {
  const urls = [];
  const result = await getFaceitStats('Name & Other', { apiKey: 'test', fetchImpl: async (url, options) => {
    urls.push(new URL(url));
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.headers.Authorization, 'Bearer test');
    return response(url.includes('/stats/') ? { lifetime } : profile);
  } });
  assert.equal(urls[0].searchParams.get('nickname'), 'Name & Other');
  assert.equal(urls[1].pathname, '/data/v4/players/account-id/stats/cs2');
  assert.deepEqual(result.lifetime, lifetime);
});

test('FACEIT embed uses lifetime numbers and preserves zero wins and percentages', async t => {
  t.mock.method(globalThis, 'fetch', async url => response(url.includes('/stats/') ? { lifetime } : profile));
  const key = process.env.FACEIT_API_KEY;
  process.env.FACEIT_API_KEY = 'test-key';
  try {
    let embed;
    await command.execute({ options: { getString: () => 'Player' }, deferReply: async () => {}, editReply: async r => { embed = r.embeds[0].toJSON(); } });
    assert.equal(embed.fields.find(f => f.name === 'Matches').value, '100');
    assert.equal(embed.fields.find(f => f.name === 'Wins').value, '0');
    assert.equal(embed.fields.find(f => f.name === 'Win Rate').value, '0%');
    assert.equal(embed.fields.find(f => f.name === 'K/D Ratio').value, '1.25');
  } finally {
    if (key === undefined) delete process.env.FACEIT_API_KEY; else process.env.FACEIT_API_KEY = key;
  }
});

for (const [status, code] of [[401, 'unauthorized'], [403, 'unauthorized'], [404, 'not_found'], [429, 'rate_limit'], [503, 'unavailable']]) {
  test(`FACEIT maps HTTP ${status} without requiring a JSON error body`, async () => {
    await assert.rejects(getFaceitStats('Player', { fetchImpl: async () => ({ ok: false, status }) }), { code });
    if (status !== 404) assert.doesNotMatch(faceitErrorMessage({ code }), /not found/);
  });
}

test('FACEIT handles stats rate limits, timeout, malformed data and missing game profiles', async () => {
  await assert.rejects(getFaceitStats('Player', { fetchImpl: async url => url.includes('/stats/') ? { ok: false, status: 429 } : response(profile) }), { code: 'rate_limit' });
  await assert.rejects(getFaceitStats('Player', { fetchImpl: async () => { throw new DOMException('timeout', 'TimeoutError'); } }), { code: 'timeout' });
  await assert.rejects(getFaceitStats('Player', { fetchImpl: async () => response({}) }), { code: 'invalid_response' });
  await assert.rejects(getFaceitStats('Player', { fetchImpl: async () => response({ ...profile, games: {} }) }), { code: 'no_game' });
  await assert.rejects(getFaceitStats('Player', { fetchImpl: async () => ({ ok: true, json: async () => { throw new SyntaxError(); } }) }), { code: 'invalid_response' });
});

test('CSGO-only players use CSGO stats and players without matches keep their profile', async () => {
  const result = await getFaceitStats('Player', { fetchImpl: async url => {
    if (url.includes('/stats/')) {
      assert.ok(url.endsWith('/stats/csgo'));
      return { ok: false, status: 404 };
    }
    return response({ ...profile, games: { csgo: profile.games.cs2 } });
  } });
  assert.equal(result.game, 'csgo');
  assert.deepEqual(result.lifetime, {});
});
