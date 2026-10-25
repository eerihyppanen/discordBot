import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createJsonStore } from '../src/utils/jsonStore.js';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'discord-skins-'));
const originalCwd = process.cwd();
const originalDataDir = process.env.DATA_DIR;
const working = path.join(root, 'working');
const configured = path.join(root, 'persistent');
const file = path.join(configured, 'pubgSkins.json');
const legacy = { existing: { totalLegendary: 1, skins: [{ name: 'Old skin', unboxedAt: 123 }], lastUnbox: 123 } };
await fs.mkdir(path.join(working, 'data'), { recursive: true });
await fs.mkdir(configured);
await fs.writeFile(file, JSON.stringify(legacy));
await fs.writeFile(path.join(working, 'data/pubgSkins.json'), 'do not touch');
process.chdir(working);
process.env.DATA_DIR = configured;
const { skins, createSkinSystem } = await import('../src/utils/skinSystem.js');
const { default: command } = await import('../src/commands/lege.js');
after(async () => {
  await skins.flush();
  process.chdir(originalCwd);
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
  await fs.rm(root, { recursive: true, force: true });
});

const interaction = (subcommand, userId, skin = null) => ({
  user: { id: userId, username: userId, displayAvatarURL: () => 'https://example.com/avatar.png' },
  options: { getSubcommand: () => subcommand, getString: () => skin, getUser: () => null },
  client: { users: { fetch: async id => ({ username: id }) } },
  deferReply: async () => {},
  editReply: async payload => { for (const embed of payload.embeds || []) embed.toJSON(); },
});

test('skin reads preserve existing format, use DATA_DIR and do not initialize or rewrite users', async () => {
  for (const subcommand of ['count', 'list', 'leaderboard']) {
    await command.execute(interaction(subcommand, 'new-user'));
  }
  assert.equal(await fs.readFile(file, 'utf8'), JSON.stringify(legacy));
  assert.deepEqual(await skins.read(), legacy);
  assert.equal(await fs.readFile(path.join(working, 'data/pubgSkins.json'), 'utf8'), 'do not touch');
});

test('a slow count response cannot overwrite a completed skin addition', async () => {
  let release;
  let reached;
  const gate = new Promise(resolve => { release = resolve; });
  const ready = new Promise(resolve => { reached = resolve; });
  const count = interaction('count', 'existing');
  count.editReply = async () => { reached(); await gate; };
  const reading = command.execute(count);
  await ready;
  try {
    const add = interaction('add', 'existing', 'New skin');
    add.editReply = async () => {
      assert.equal(JSON.parse(await fs.readFile(file, 'utf8')).existing.totalLegendary, 2);
    };
    await command.execute(add);
  } finally {
    release();
    await reading;
  }
  assert.equal(JSON.parse(await fs.readFile(file, 'utf8')).existing.totalLegendary, 2);
});

test('concurrent skin additions for the same and different users all survive on disk', async () => {
  await Promise.all(Array.from({ length: 20 }, (_, i) => command.execute(interaction('add', `user-${i % 2}`, `skin-${i}`))));
  const saved = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(saved.existing.totalLegendary, 2);
  for (const id of ['user-0', 'user-1']) {
    assert.equal(saved[id].totalLegendary, 10);
    assert.equal(new Set(saved[id].skins.map(skin => skin.name)).size, 10);
  }
});

test('failed skin writes do not confirm success or commit in memory', async () => {
  const previous = await fs.readFile(file);
  await fs.unlink(file);
  await fs.mkdir(file);
  let confirmed = false;
  const request = interaction('add', 'failed-user', 'Not saved');
  request.editReply = async () => { confirmed = true; };
  try {
    await assert.rejects(command.execute(request));
    assert.equal(confirmed, false);
    assert.equal((await skins.read())['failed-user'], undefined);
  } finally {
    await fs.rmdir(file);
    await fs.writeFile(file, previous);
  }
  await command.execute(interaction('add', 'failed-user', 'Retry'));
  assert.equal(JSON.parse(await fs.readFile(file, 'utf8'))['failed-user'].totalLegendary, 1);
});

test('malformed skin data is reported and preserved on both reads and additions', async () => {
  const corruptFile = path.join(root, 'corrupt.json');
  await fs.writeFile(corruptFile, '{broken');
  const corrupt = createSkinSystem(createJsonStore(corruptFile));
  await assert.rejects(corrupt.initialize(), SyntaxError);
  await assert.rejects(corrupt.read(), SyntaxError);
  await assert.rejects(corrupt.add('user', 'Skin'), SyntaxError);
  assert.equal(await fs.readFile(corruptFile, 'utf8'), '{broken');
});

test('undo saves removal of only the invoking user latest skin before confirmation', async () => {
  await skins.add('undo-user', 'First');
  await skins.add('undo-user', 'Second');
  const beforeOther = (await skins.read()).existing;
  let reply;
  const request = interaction('undo', 'undo-user');
  request.editReply = async payload => {
    reply = payload;
    const user = JSON.parse(await fs.readFile(file, 'utf8'))['undo-user'];
    assert.equal(user.totalLegendary, 1);
    assert.deepEqual(user.skins.map(skin => skin.name), ['First']);
    assert.equal(user.lastUnbox, user.skins[0].unboxedAt);
  };
  await command.execute(request);
  assert.match(JSON.stringify(reply), /Second/);
  assert.deepEqual((await skins.read()).existing, beforeOther);
});

test('undo handles an empty collection and resets the last skin timestamp to zero', async () => {
  assert.equal(typeof skins.undo, 'function');
  assert.equal(await skins.undo('unknown-user'), null);
  await skins.add('single-user', 'Only skin');
  const result = await skins.undo('single-user');
  assert.equal(result.skin.name, 'Only skin');
  assert.deepEqual(result.userData, { totalLegendary: 0, skins: [], lastUnbox: 0 });
  assert.equal(await skins.undo('single-user'), null);
});

test('an undo write failure preserves the original skin in memory and on retry', async () => {
  assert.equal(typeof skins.undo, 'function');
  await skins.add('undo-failure', 'Keep me');
  const previous = await fs.readFile(file);
  await fs.unlink(file);
  await fs.mkdir(file);
  try {
    await assert.rejects(skins.undo('undo-failure'));
    assert.equal((await skins.read())['undo-failure'].skins[0].name, 'Keep me');
  } finally {
    await fs.rmdir(file);
    await fs.writeFile(file, previous);
  }
  assert.equal((await skins.undo('undo-failure')).skin.name, 'Keep me');
});
