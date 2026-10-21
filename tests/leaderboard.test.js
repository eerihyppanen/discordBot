import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'discord-levels-'));
const originalCwd = process.cwd();
const originalDataDir = process.env.DATA_DIR;
const workingDirectory = path.join(root, 'working');
const dataDirectory = path.join(root, 'sd-card');
const file = path.join(dataDirectory, 'userLevels.json');
const initial = {
  high: { level: 2, xp: 600 },
  middle: { level: 2, xp: 500 },
  starter: { level: 1, xp: 100 },
};
await fs.mkdir(path.join(workingDirectory, 'data'), { recursive: true });
await fs.mkdir(dataDirectory);
await fs.writeFile(file, JSON.stringify(initial));
await fs.writeFile(path.join(workingDirectory, 'data', 'userLevels.json'), JSON.stringify({
  decoy: { level: 99, xp: 999999 },
}));
process.chdir(workingDirectory);
process.env.DATA_DIR = dataDirectory;
const { initializeData, addXP, getUserLevel, getLevelLeaderboard, flushLevelingData } =
  await import('../src/utils/levelingSystem.js');
const { default: leaderboard } = await import('../src/commands/leaderboard.js');
await initializeData();

after(async () => {
  try { await flushLevelingData(); }
  finally {
    process.chdir(originalCwd);
    if (originalDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = originalDataDir;
    await fs.rm(root, { recursive: true, force: true });
  }
});

const withoutDiskIO = async (run) => {
  const methods = ['readFile', 'writeFile', 'open', 'mkdir', 'rename', 'rm', 'access', 'stat'];
  const originals = Object.fromEntries(methods.map((name) => [name, fs[name]]));
  const calls = [];
  for (const name of methods) {
    fs[name] = async () => {
      calls.push(name);
      throw new Error('Unexpected filesystem call: ' + name);
    };
  }
  try {
    const result = await run();
    assert.deepEqual(calls, []);
    return result;
  } finally {
    Object.assign(fs, originals);
  }
};

const showLeaderboard = async () => {
  let response;
  const request = {
    client: { users: { fetch: async (id) => ({ username: 'player-' + id }) } },
    deferReply: async () => {},
    editReply: async (value) => { response = value; },
  };
  await leaderboard.execute(request);
  assert.equal(typeof response, 'object');
  return response.embeds[0].toJSON().description;
};

test('custom DATA_DIR is shared and repeated leaderboard/level reads cause no disk I/O or saves', async () => {
  await withoutDiskIO(async () => {
    for (let i = 0; i < 3; i++) {
      assert.equal((await getUserLevel('high')).xp, 600);
      const description = await showLeaderboard();
      assert.match(description, /player-high.*600 XP/);
      assert.doesNotMatch(description, /decoy/);
      assert.deepEqual((await getLevelLeaderboard()).map(([id]) => id), ['high', 'middle', 'starter']);
    }
    // A read-only command must not dirty the store or cause a later flush to write.
    await flushLevelingData();
  });
});

test('unsaved XP appears immediately while changes still share one five-minute save', async () => {
  const originalTimeout = globalThis.setTimeout;
  const originalOpen = fs.open;
  const scheduled = [];
  let writes = 0;
  globalThis.setTimeout = (callback, delay, ...args) => {
    if (delay !== 300000) return originalTimeout(callback, delay, ...args);
    scheduled.push({ callback, delay });
    return { unref() {} };
  };
  fs.open = (...args) => { writes++; return originalOpen(...args); };
  try {
    await addXP('middle', 50);
    await addXP('middle', 100);
    await addXP('starter', 20);
    await withoutDiskIO(async () => {
      assert.equal((await getUserLevel('middle')).xp, 650);
      const description = await showLeaderboard();
      assert.match(description, /player-middle.*650 XP/);
      assert.ok(description.indexOf('player-middle') < description.indexOf('player-high'));
      assert.equal((await getLevelLeaderboard())[0][0], 'middle');
    });
    assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), initial);
    assert.equal(writes, 0);
    assert.equal(scheduled.length, 1);
    assert.equal(scheduled[0].delay, 5 * 60 * 1000);

    scheduled[0].callback();
    await getLevelLeaderboard(); // Drain the queue after the scheduled save.
    const saved = JSON.parse(await fs.readFile(file, 'utf8'));
    assert.equal(saved.middle.xp, 650);
    assert.equal(saved.starter.xp, 120);
    assert.equal(writes, 1);
  } finally {
    globalThis.setTimeout = originalTimeout;
    fs.open = originalOpen;
    await flushLevelingData();
  }
});

test('leaderboard limits results and returned snapshots cannot modify cached XP', async () => {
  for (let i = 0; i < 10; i++) await addXP('other-' + i, 10 + i);
  await withoutDiskIO(async () => {
    const top = await getLevelLeaderboard();
    assert.equal(top.length, 10);
    assert.deepEqual(top.slice(0, 3).map(([id]) => id), ['middle', 'high', 'starter']);
    assert.equal((await getLevelLeaderboard(2)).length, 2);
    top[0][1].xp = 999999;
    assert.equal((await getUserLevel('middle')).xp, 650);
  });
});
