import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { loadCommands, deployCommands } from '../deploy-commands.mjs';

const fixture = async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'discord-deploy-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await fs.writeFile(path.join(dir, 'package.json'), '{"type":"module"}');
  return dir;
};
const valid = name => `export default { data: { toJSON: () => ({ name: '${name}', description: 'A test command' }) }, execute() {} };`;

for (const [name, content] of [
  ['import error', "throw new Error('Broken dependency');"],
  ['missing default export', 'export const data = {};'],
  ['missing executor', "export default { data: { toJSON: () => ({ name: 'broken' }) } };"],
  ['serialization failure', "export default { data: { toJSON() { throw new Error('Invalid definition'); } }, execute() {} };"],
  ['duplicate name', valid('good')],
]) {
  test(`deployment makes no API call after ${name}`, async (t) => {
    const dir = await fixture(t);
    await fs.writeFile(path.join(dir, 'a-good.js'), valid('good'));
    await fs.writeFile(path.join(dir, 'z-broken.js'), content);
    let calls = 0;
    await assert.rejects(deployCommands({
      commandsPath: dir, clientId: 'client', guildId: 'guild',
      rest: { put: async () => { calls++; } },
    }), /Cannot load z-broken.js/);
    assert.equal(calls, 0);
  });
}

test('empty command directories cannot clear the registered commands', async (t) => {
  const dir = await fixture(t);
  await assert.rejects(loadCommands(dir), /No command files/);
});

test('all valid commands are published together and API rejection propagates', async (t) => {
  const dir = await fixture(t);
  await fs.writeFile(path.join(dir, 'one.js'), valid('one'));
  await fs.writeFile(path.join(dir, 'two.js'), valid('two'));
  let calls = 0;
  const rest = { put: async (route, { body }) => {
    calls++;
    assert.equal(route, '/applications/client/guilds/guild/commands');
    assert.deepEqual(body.map(command => command.name), ['one', 'two']);
    return body;
  } };
  const options = { commandsPath: dir, rest, clientId: 'client', guildId: 'guild' };
  assert.equal((await deployCommands(options)).length, 2);
  assert.equal(calls, 1);
  rest.put = async () => { throw new Error('Discord unavailable'); };
  await assert.rejects(deployCommands(options), /Discord unavailable/);
});

test('both CLI entry points exit nonzero when configuration is missing', async (t) => {
  const dir = await fixture(t);
  const env = { ...process.env };
  for (const key of ['TOKEN', 'CLIENT_ID', 'GUILD_ID']) delete env[key];
  for (const filename of ['deploy-commands.mjs', 'deploy-commands.js']) {
    const entry = fileURLToPath(new URL('../' + filename, import.meta.url));
    await assert.rejects(promisify(execFile)(process.execPath, [entry], { cwd: dir, env }), error => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /TOKEN, CLIENT_ID and GUILD_ID are required/);
      return true;
    });
  }
});

test('the full repository command set validates without accessing Discord', async () => {
  const dir = fileURLToPath(new URL('../src/commands/', import.meta.url));
  const expected = (await fs.readdir(dir)).filter(file => file.endsWith('.js')).length;
  const commands = await loadCommands(dir);
  assert.equal(commands.length, expected);
});

test('the CLI exits nonzero on Discord API failure', async (t) => {
  const dir = await fixture(t);
  const entry = fileURLToPath(new URL('./fixtures/deploy-failure.mjs', import.meta.url));
  await assert.rejects(promisify(execFile)(process.execPath, [entry], { cwd: dir }), error => {
    assert.equal(error.code, 1);
    assert.match(error.stderr, /Simulated Discord API failure/);
    return true;
  });
});
