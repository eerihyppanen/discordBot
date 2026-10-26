import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createProfileSystem } from '../src/utils/profileSystem.js';

const fixture = async t => {
  const dir = await fs.mkdtemp('/tmp/player-profiles-');
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = `${dir}/playerProfiles.json`;
  return { file, profiles: createProfileSystem(file) };
};

test('profile changes are durable, merge independent names and survive restart', async t => {
  const { file, profiles } = await fixture(t);
  assert.deepEqual(await profiles.get('101'), {});
  await assert.rejects(fs.access(file), { code: 'ENOENT' });
  await Promise.all([profiles.set('101', { pubg: '  PUBGPlayer ' }), profiles.set('101', { faceit: 'FaceitPlayer' })]);
  assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8'))['101'], { pubg: 'PUBGPlayer', faceit: 'FaceitPlayer' });
  assert.deepEqual(await createProfileSystem(file).get('101'), { pubg: 'PUBGPlayer', faceit: 'FaceitPlayer' });
});

test('clearing one game preserves the other and clearing all removes the record', async t => {
  const { file, profiles } = await fixture(t);
  await profiles.set('101', { pubg: 'P', faceit: 'F' });
  await profiles.clear('101', 'pubg');
  assert.deepEqual(await createProfileSystem(file).get('101'), { faceit: 'F' });
  await profiles.clear('101', 'all');
  assert.deepEqual(await createProfileSystem(file).get('101'), {});
});

test('profile input rejects blank, overlong or unknown fields and invalid IDs', async t => {
  const { profiles } = await fixture(t);
  for (const changes of [{}, { pubg: ' ' }, { pubg: 'p'.repeat(65) }, { faceit: 'f'.repeat(51) }, { other: 'name' }]) {
    await assert.rejects(profiles.set('101', changes));
  }
  await assert.rejects(profiles.set('__proto__', { pubg: 'P' }));
  await assert.rejects(profiles.clear('101', 'unknown'));
  assert.deepEqual(await profiles.get('101'), {});
});

test('a failed profile write leaves the original name in memory and on disk', async t => {
  const { file, profiles } = await fixture(t);
  await profiles.set('101', { pubg: 'Original' });
  const previous = await fs.readFile(file);
  await fs.unlink(file);
  await fs.mkdir(file);
  try {
    await assert.rejects(profiles.set('101', { pubg: 'Unsaved' }));
    assert.deepEqual(await profiles.get('101'), { pubg: 'Original' });
  } finally { await fs.rmdir(file); await fs.writeFile(file, previous); }
});
