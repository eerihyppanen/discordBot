import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { Collection, SlashCommandBuilder } from 'discord.js';
import { default as help } from '../src/commands/help.js';

const commands = new Collection();
for (const file of await fs.readdir(new URL('../src/commands/', import.meta.url))) {
  if (!file.endsWith('.js')) continue;
  const { default: command } = await import(new URL('../src/commands/' + file, import.meta.url));
  commands.set(command.data.name, command);
}
const show = async (name = null, registry = commands) => {
  let response;
  await help.execute({
    options: { getString: () => name },
    client: { commands: registry, user: { displayAvatarURL: () => 'https://example.com/bot.png' } },
    reply: async payload => { response = payload.embeds ? payload.embeds[0].toJSON() : payload.content ?? payload; },
  });
  return response;
};

test('general help reflects the live registry and counts each command exactly once', async () => {
  const registry = commands.clone();
  registry.set('new-command', { data: new SlashCommandBuilder().setName('new-command').setDescription('A newly registered command') });
  const output = await show(null, registry);
  const text = JSON.stringify(output);
  assert.match(text, /new-command/);
  assert.doesNotMatch(text, /play-simple/);
  assert.match(output.footer.text, /Total Commands: 18\b/);
  for (const name of registry.keys()) assert.ok(output.fields.some(field => field.name === '/' + name), name);
});

test('detailed help uses current required inputs, optional inputs, choices and subcommands', async () => {
  const manual = JSON.stringify(await show('pubg-wins-add'));
  assert.match(manual, /<username>/);
  assert.match(manual, /<wins>/);
  assert.match(manual, /<matches>/);
  assert.doesNotMatch(manual, /<platform>|\[region\]/);
  const colonist = JSON.stringify(await show('/COLONIST'));
  assert.match(colonist, /\/colonist win/);
  assert.match(colonist, /\/colonist stats \[user\]/);
  const leaderboard = JSON.stringify(await show('colonist-leaderboard'));
  assert.match(leaderboard, /wins/);
  assert.match(leaderboard, /streaks/);
});

test('help for a removed or unknown command reports it as unavailable', async () => {
  assert.match(await show('play-simple'), /not found/i);
});
