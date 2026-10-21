import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createJsonStore } from '../src/utils/jsonStore.js';
import { createReminderSystem } from '../src/utils/reminderSystem.js';

const logger = { error() {} };
const timers = { setInterval: () => ({ unref() {} }), clearInterval() {} };
const fixture = async (t, send, channelSend = async () => {}) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'discord-reminder-'));
  const file = path.join(dir, 'reminders.json');
  let clock = Date.now();
  const client = {
    users: { fetch: async () => ({ send }) },
    channels: { fetch: async () => ({ isTextBased: () => true, send: channelSend }) },
  };
  const systems = [];
  const create = () => {
    const system = createReminderSystem(createJsonStore(file), { now: () => clock, timers, logger });
    systems.push(system);
    return system;
  };
  t.after(async () => { await Promise.all(systems.map((system) => system.stop())); await fs.rm(dir, { recursive: true, force: true }); });
  return { file, client, create, advance: (ms) => { clock += ms; }, dueAt: () => clock + 3600000 };
};

test('pending reminders survive a new instance and overdue reminders are delivered on startup', async (t) => {
  const sent = [];
  const f = await fixture(t, async (message) => { sent.push(message); });
  await f.create().add({ userId: 'user', channelId: 'channel', message: 'remember', dueAt: f.dueAt() });
  f.advance(3600001);
  const restarted = f.create();
  await restarted.start(f.client);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].embeds[0].description, 'remember');
  assert.deepEqual(JSON.parse(await fs.readFile(f.file, 'utf8')), {});
  await restarted.stop();
  await f.create().start(f.client);
  assert.equal(sent.length, 1);
});

test('closed DMs fall back to a regular channel message after an hour', async (t) => {
  const sent = [];
  const f = await fixture(t, async () => { throw new Error('DMs disabled'); }, async (message) => { sent.push(message); });
  const system = f.create();
  await system.add({ userId: 'user', channelId: 'channel', message: 'remember', dueAt: f.dueAt() });
  f.advance(3600001);
  await system.start(f.client);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].content, '<@user>');
  assert.deepEqual(sent[0].allowedMentions, { parse: [], users: ['user'] });
});

test('failed deliveries are retained and retried with backoff', async (t) => {
  let failed = true;
  let delivered = 0;
  const f = await fixture(t, async () => { if (failed) throw new Error('DM failed'); delivered++; }, async () => { throw new Error('channel failed'); });
  const system = f.create();
  const reminder = await system.add({ userId: 'user', channelId: 'channel', message: 'remember', dueAt: f.dueAt() });
  f.advance(3600001);
  await system.start(f.client);
  assert.equal(JSON.parse(await fs.readFile(f.file, 'utf8'))[reminder.id].attempts, 1);
  failed = false;
  await system.runDue();
  assert.equal(delivered, 0);
  f.advance(60000);
  await system.runDue();
  assert.equal(delivered, 1);
  assert.deepEqual(JSON.parse(await fs.readFile(f.file, 'utf8')), {});
});

test('overlapping polls do not deliver the same reminder twice and stop drains delivery', async (t) => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let sent = 0;
  const f = await fixture(t, async () => { sent++; await gate; });
  const system = f.create();
  await system.add({ userId: 'user', channelId: 'channel', message: 'remember', dueAt: f.dueAt() });
  await system.start(f.client);
  f.advance(3600001);
  const first = system.runDue();
  assert.equal(system.runDue(), first);
  await new Promise((resolve) => setImmediate(resolve));
  let stopped = false;
  const stop = system.stop().then(() => { stopped = true; });
  assert.equal(stopped, false);
  release();
  await Promise.all([first, stop]);
  assert.equal(sent, 1);
  assert.deepEqual(JSON.parse(await fs.readFile(f.file, 'utf8')), {});
});
