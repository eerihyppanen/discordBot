import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const directory = await fs.mkdtemp('/tmp/discord-text-limits-');
process.env.DATA_DIR = directory;
const legacy = { legacy: { totalLegendary: 12, lastUnbox: 1, skins: Array.from({ length: 12 }, () => ({ name: '😀'.repeat(3000), unboxedAt: 1 })) } };
await fs.writeFile(`${directory}/pubgSkins.json`, JSON.stringify(legacy));
const { skins } = await import('../src/utils/skinSystem.js');
const { default: lege } = await import('../src/commands/lege.js');
const { default: ball } = await import('../src/commands/8ball.js');
after(async () => { await skins.flush(); await fs.rm(directory, { recursive: true, force: true }); });

const request = (userId, subcommand, text) => ({
  user: { id: userId, username: 'Player', displayAvatarURL: () => 'https://example.com/avatar.png' },
  options: { getSubcommand: () => subcommand, getString: () => text, getUser: () => null },
  deferReply: async () => {}, reply: async () => {}, editReply: async () => {},
});

test('invalid skin names are rejected before saving or increasing the collection', async () => {
  for (const name of [' ', 'x'.repeat(101), 'x'.repeat(1100), 'x'.repeat(4100)]) {
    await assert.rejects(skins.add('invalid', name), /Skin names/);
    const r = request('invalid', 'add', name);
    let response;
    r.editReply = async value => { response = value; };
    await lege.execute(r);
    assert.match(response, /Skin names/);
    assert.equal((await skins.read()).invalid, undefined);
  }
  await skins.add('valid', 'x'.repeat(100));
  assert.equal((await skins.read()).valid.totalLegendary, 1);
});

test('legacy long names render within Discord limits without rewriting stored collections', async () => {
  const before = await fs.readFile(`${directory}/pubgSkins.json`, 'utf8');
  for (const subcommand of ['list', 'count']) {
    const r = request('legacy', subcommand);
    r.editReply = async value => {
      const embed = value.embeds[0].toJSON();
      assert.ok((embed.description || '').length <= 4096);
      for (const field of embed.fields) assert.ok(field.value.length <= 1024);
    };
    await lege.execute(r);
  }
  assert.equal(await fs.readFile(`${directory}/pubgSkins.json`, 'utf8'), before);
});

test('8ball accepts 1024 characters and rejects longer or blank questions before building an embed', async () => {
  for (const [question, valid] of [['x'.repeat(1024), true], ['x'.repeat(1025), false], [' ', false]]) {
    const r = request('user', null, question);
    let response;
    r.reply = async value => { response = value; };
    await ball.execute(r);
    if (valid) assert.equal(response.embeds[0].toJSON().fields[0].value.length, 1024);
    else assert.match(response.content, /1–1024/);
  }
});
