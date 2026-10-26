import test from 'node:test';
import assert from 'node:assert/strict';
import { Collection } from 'discord.js';
import welcome from '../src/events/guildMemberAdd.js';

const settings = (t, values = {}) => {
  const previous = { CHANNEL_NAME: process.env.CHANNEL_NAME, CHANNEL_ID: process.env.CHANNEL_ID };
  for (const key of Object.keys(previous)) {
    if (values[key] === undefined) delete process.env[key]; else process.env[key] = values[key];
  }
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
};
const member = channels => ({ id: '123', guild: { channels: { cache: new Collection(channels) } } });

test('welcomes skip unconfigured, missing and non-message channels', async t => {
  settings(t, { CHANNEL_NAME: 'welcome' });
  await welcome.execute(member([]));
  await welcome.execute(member([['voice', { name: 'welcome', isTextBased: () => false }]]));
  delete process.env.CHANNEL_NAME;
  await welcome.execute(member([]));
});

test('welcomes prefer a configured channel ID and await delivery', async t => {
  settings(t, { CHANNEL_NAME: 'old-name', CHANNEL_ID: 'correct-id' });
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let payload;
  let done = false;
  const sending = welcome.execute(member([
    ['wrong-id', { name: 'old-name', isTextBased: () => true, send: async () => { throw new Error('Wrong channel'); } }],
    ['correct-id', { name: 'renamed', isTextBased: () => true, send: async message => { payload = message; await gate; } }],
  ])).then(() => { done = true; });
  try {
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(done, false);
    assert.match(payload.content, /<@123>/);
  } finally { release(); await sending; }
});

test('welcome send failures are awaited and logged instead of escaping', async t => {
  settings(t, { CHANNEL_NAME: 'welcome' });
  const errors = [];
  t.mock.method(console, 'error', (...args) => errors.push(args));
  await welcome.execute(member([['channel', {
    name: 'welcome', isTextBased: () => true,
    send: async () => { throw new Error('Missing Permissions'); },
  }]]));
  assert.match(String(errors[0]), /Missing Permissions/);
});
