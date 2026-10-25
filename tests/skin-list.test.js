import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { MessageFlags } from 'discord.js';
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'discord-skin-pages-'));
const oldDataDir = process.env.DATA_DIR;
process.env.DATA_DIR = dir;
const owner = '123456789012345678';
const legacy = { totalLegendary: 21, skins: Array.from({ length: 21 }, (_, i) => ({ name: `Skin ${i + 1}`, unboxedAt: i + 1 })), lastUnbox: 21 };
const file = path.join(dir, 'pubgSkins.json');
await fs.writeFile(file, JSON.stringify({ [owner]: legacy }));
const { default: command } = await import('../src/commands/lege.js');
const { skins } = await import('../src/utils/skinSystem.js');
after(async () => {
  await skins.flush();
  if (oldDataDir === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = oldDataDir;
  await fs.rm(dir, { recursive: true, force: true });
});
const user = { id: owner, username: 'Player', displayAvatarURL: () => 'https://example.com/avatar.png' };
const json = payload => ({ ...payload, embeds: payload.embeds?.map(embed => embed.toJSON()), components: payload.components?.map(row => row.toJSON()) });
const list = async (id = owner) => {
  let output;
  await command.execute({ user: { ...user, id }, options: { getSubcommand: () => 'list' }, deferReply: async () => {}, editReply: async payload => { output = json(payload); } });
  return output;
};
const click = async (id, userId = owner) => {
  assert.equal(typeof command.handleButton, 'function');
  let output, rejection, deferred = false;
  await command.handleButton({
    customId: id, user: { ...user, id: userId },
    deferUpdate: async () => { deferred = true; },
    editReply: async payload => { output = json(payload); },
    reply: async payload => { rejection = payload; },
  });
  return { output, rejection, deferred };
};

test('a collection opens on the newest ten skins with navigation to the older pages', async () => {
  const output = await list();
  assert.match(output.embeds[0].description, /Skin 21/);
  assert.match(output.embeds[0].description, /Skin 12/);
  assert.doesNotMatch(output.embeds[0].description, /Skin 11\b/);
  assert.equal(output.embeds[0].fields.find(field => field.name === '📄 Page').value, '1/3');
  assert.equal(output.components?.length, 1);
  assert.equal(output.components[0].components[0].disabled, true);
  assert.equal(output.components[0].components[1].custom_id, `lege:list:${owner}:1`);
});

test('page buttons render middle and last pages without losing or duplicating skins', async () => {
  const middle = await click(`lege:list:${owner}:1`);
  assert.equal(middle.deferred, true);
  assert.match(middle.output.embeds[0].description, /Skin 11/);
  assert.match(middle.output.embeds[0].description, /Skin 2\b/);
  assert.doesNotMatch(middle.output.embeds[0].description, /Skin 1\b/);
  assert.equal(middle.output.components[0].components[0].disabled, false);
  const last = (await click(`lege:list:${owner}:2`)).output;
  assert.match(last.embeds[0].description, /Skin 1\b/);
  assert.equal(last.embeds[0].fields.find(field => field.name === '📄 Page').value, '3/3');
  assert.equal(last.components[0].components[1].disabled, true);
  assert.equal(await fs.readFile(file, 'utf8'), JSON.stringify({ [owner]: legacy }));
});

test('other users and malformed navigation cannot edit the original collection message', async () => {
  for (const [id, actor] of [[`lege:list:${owner}:1`, '987654321098765432'], [`lege:list:${owner}:-1`, owner], [`lege:list:${owner}:oops`, owner]]) {
    const result = await click(id, actor);
    assert.equal(result.output, undefined);
    assert.equal(result.deferred, false);
    assert.equal(result.rejection.flags, MessageFlags.Ephemeral);
  }
});

test('old buttons clamp to a valid page and remove controls when the collection becomes empty', async () => {
  assert.equal(typeof skins.undo, 'function');
  await skins.undo(owner);
  const afterUndo = (await click(`lege:list:${owner}:2`)).output;
  assert.equal(afterUndo.embeds[0].fields.find(field => field.name === '📄 Page').value, '2/2');
  assert.doesNotMatch(afterUndo.embeds[0].description, /Skin 21/);
  for (let i = 0; i < 20; i++) await skins.undo(owner);
  const empty = (await click(`lege:list:${owner}:2`)).output;
  assert.deepEqual(empty.components, []);
  assert.deepEqual(empty.embeds, []);
  assert.match(empty.content, /haven't unboxed/);
});

test('long names in existing collections remain within Discord embed limits', async () => {
  const loaded = { totalLegendary: 10, skins: Array.from({ length: 10 }, () => ({ name: '*'.repeat(5000), unboxedAt: 1000 })), lastUnbox: 1000 };
  const { renderSkinList } = await import('../src/utils/skinList.js');
  const output = json(renderSkinList(user, loaded));
  assert.ok(output.embeds[0].description.length <= 4096);
  assert.equal(output.embeds[0].description.split('\n').length, 10);
});

test('the shared interaction dispatcher routes skin buttons to the collection handler', async () => {
  const { dispatchInteraction } = await import('../src/utils/interactionHandler.js');
  await skins.add(owner, 'After restart');
  let response;
  await dispatchInteraction({
    isButton: () => true, isChatInputCommand: () => false,
    customId: `lege:list:${owner}:0`, user,
    client: { commands: new Map([['lege', command]]) },
    deferUpdate: async () => {}, editReply: async payload => { response = json(payload); },
  });
  assert.match(response.embeds[0].description, /After restart/);
});
