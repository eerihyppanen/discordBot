import test from 'node:test';
import assert from 'node:assert/strict';
import { createPubgClient } from '../src/utils/pubgClient.js';

const player = name => ({ id: name, attributes: { name }, relationships: { matches: { data: [] } } });
const stats = { playerId: 'Player', name: 'Player', kills: 2, damageDealt: 100, winPlace: 1 };
const response = value => ({ ok: true, json: async () => value });
const match = () => response({ included: [{ type: 'participant', attributes: { stats } }] });

test('identical lookups share a request and player cache expires after two minutes', async () => {
  let time = 0, calls = 0, release;
  const gate = new Promise(resolve => { release = resolve; });
  const client = createPubgClient({ now: () => time, fetchImpl: async (url, options) => {
    calls++;
    assert.ok(options.signal instanceof AbortSignal);
    await gate;
    return response({ data: [player('Player')] });
  } });
  const requests = [client.getPlayer('Player'), client.getPlayer('player')];
  release();
  await Promise.all(requests);
  assert.equal(calls, 1);
  time = 119_999;
  await client.getPlayer('Player');
  assert.equal(calls, 1);
  time = 120_000;
  await client.getPlayer('Player');
  assert.equal(calls, 2);
});

test('match stats are cached per participant and expire after fifteen minutes', async () => {
  let time = 0, calls = 0;
  const client = createPubgClient({ now: () => time, fetchImpl: async () => { calls++; return match(); } });
  assert.equal((await client.getMatchStats('match-id', player('Player'))).kills, 2);
  time = 899_999;
  await client.getMatchStats('match-id', player('Player'));
  assert.equal(calls, 1);
  time = 900_000;
  await client.getMatchStats('match-id', player('Player'));
  assert.equal(calls, 2);
  assert.equal(await client.getMatchStats('match-id', player('Other')), null);
  assert.equal(calls, 3);
});

test('at most three HTTP requests run at once across concurrent lookups', async () => {
  let active = 0, peak = 0, calls = 0;
  const client = createPubgClient({ fetchImpl: async () => {
    active++; peak = Math.max(active, peak); calls++;
    await new Promise(resolve => setImmediate(resolve));
    active--;
    return match();
  } });
  const results = await Promise.all(Array.from({ length: 20 }, (_, index) => client.getMatchStats('match-' + index, player('Player'))));
  assert.equal(results.length, 20);
  assert.equal(calls, 20);
  assert.equal(peak, 3);
});

test('failed and missing responses are not cached and release their concurrency slot', async () => {
  let calls = 0;
  const client = createPubgClient({ concurrency: 1, fetchImpl: async () => {
    calls++;
    if (calls === 1) throw new DOMException('Timeout', 'TimeoutError');
    if (calls === 2) return { ok: false, status: 404 };
    return response({ data: [player('Player')] });
  } });
  await assert.rejects(client.getPlayer('Player'), /Timeout/);
  assert.equal(await client.getPlayer('Player'), null);
  assert.equal((await client.getPlayer('Player')).id, 'Player');
  assert.equal(calls, 3);
});

test('cache size is bounded and recently used entries survive eviction', async () => {
  const names = [];
  const client = createPubgClient({ maxEntries: 2, fetchImpl: async url => {
    const name = new URL(url).searchParams.get('filter[playerNames]');
    names.push(name);
    return response({ data: [player(name)] });
  } });
  for (const name of ['A', 'B', 'A', 'C', 'A', 'B']) await client.getPlayer(name);
  assert.deepEqual(names, ['A', 'B', 'C', 'B']);
});

test('malformed participant statistics cannot become a successful cached result', async () => {
  let calls = 0;
  const client = createPubgClient({ fetchImpl: async () => {
    calls++;
    return calls === 1 ? response({ included: [{ type: 'participant', attributes: { stats: { ...stats, kills: 'invalid' } } }] }) : match();
  } });
  await assert.rejects(client.getMatchStats('match-id', player('Player')), /statistics/i);
  assert.equal((await client.getMatchStats('match-id', player('Player'))).kills, 2);
  assert.equal(calls, 2);
});
