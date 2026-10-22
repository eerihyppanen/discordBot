import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'discord-level-progress-'));
const originalDataDir = process.env.DATA_DIR;
process.env.DATA_DIR = dir;
const { addXP, flushLevelingData } = await import('../src/utils/levelingSystem.js');
const { default: level } = await import('../src/commands/level.js');
after(async () => {
  await flushLevelingData();
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
  await fs.rm(dir, { recursive: true, force: true });
});

test('level progress resets at the actual level boundaries without changing existing thresholds', async () => {
  let response;
  const request = {
    user: { id: 'user', username: 'Player', displayAvatarURL: () => 'https://example.com/avatar.png' },
    options: { getUser: () => null },
    reply: async payload => { response = payload.embeds[0].toJSON(); },
  };
  for (const [xp, expectedLevel, progress] of [
    [0, 1, '░░░░░░░░░░ 0/400 XP'],
    [399, 1, '██████████ 399/400 XP'],
    [1, 2, '░░░░░░░░░░ 0/500 XP'],
    [250, 2, '█████░░░░░ 250/500 XP'],
    [250, 3, '░░░░░░░░░░ 0/700 XP'],
  ]) {
    await addXP('user', xp);
    await level.execute(request);
    assert.equal(response.fields.find(field => field.name === 'Level').value, String(expectedLevel));
    assert.equal(response.fields.find(field => field.name === 'Progress to Next Level').value, progress);
  }
});
