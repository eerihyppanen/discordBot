import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readRewardSettings } from '../src/utils/rewardSettings.js';

test('reward settings preserve defaults and accept explicit whole-number overrides', () => {
  assert.deepEqual(readRewardSettings({}), {
    messageXP: 30, messageCooldownMs: 60_000, colonistWinXP: 100,
    colonistStreakBonusXP: 50, colonistRewardCooldownMs: 1_800_000,
  });
  assert.equal(readRewardSettings({ MESSAGE_XP: ' 0 ' }).messageXP, 0);
  assert.equal(readRewardSettings({ COLONIST_WIN_XP: '250' }).colonistWinXP, 250);
  assert.equal(readRewardSettings({ MESSAGE_XP_COOLDOWN_SECONDS: '10' }).messageCooldownMs, 10_000);
  assert.equal(readRewardSettings({ COLONIST_REWARD_COOLDOWN_MINUTES: '5' }).colonistRewardCooldownMs, 300_000);
});

test('invalid settings fail by name without echoing their values', () => {
  for (const [key, value] of [
    ['MESSAGE_XP', '-1'], ['MESSAGE_XP', '10001'], ['MESSAGE_XP', 'private-invalid-value'],
    ['COLONIST_WIN_XP', '1.5'], ['COLONIST_STREAK_BONUS_XP', '1e3'],
    ['MESSAGE_XP_COOLDOWN_SECONDS', '0'], ['MESSAGE_XP_COOLDOWN_SECONDS', '86401'],
    ['COLONIST_REWARD_COOLDOWN_MINUTES', '0'], ['COLONIST_REWARD_COOLDOWN_MINUTES', '10081'],
  ]) assert.throws(() => readRewardSettings({ [key]: value }), error => error.message.includes(key) && !error.message.includes('private-invalid-value'));
});

test('configured amounts, cooldowns, default helper XP and level explanations agree', async () => {
  const dir = await fs.mkdtemp('/tmp/reward-settings-');
  const levelSystem = new URL('../src/utils/levelingSystem.js', import.meta.url).href;
  const colonistSystem = new URL('../src/utils/colonistSystem.js', import.meta.url).href;
  const levelCommand = new URL('../src/commands/level.js', import.meta.url).href;
  const script = `
    import assert from 'node:assert/strict';
    import { addXP, addMessageXP, getUserLevel, flushLevelingData } from '${levelSystem}';
    import { recordGameResult, recordWinWithRewards, flushColonistData } from '${colonistSystem}';
    import level from '${levelCommand}';
    assert.equal((await addXP('default')).xp, 45);
    assert.equal((await addMessageXP('chat', 100000)).xp, 45);
    assert.equal((await addMessageXP('chat', 109999)).awarded, false);
    assert.equal((await addMessageXP('chat', 110000)).xp, 90);
    const game = { id: 'settings-first', guildId: 'guild', winnerId: '101', finishedAt: 1000000,
      players: [{ id: '101', username: 'Winner' }, { id: '102', username: 'Guest' }] };
    assert.equal((await recordGameResult(game)).xpReward, 200);
    assert.equal((await recordGameResult({ ...game, id: 'settings-second', finishedAt: 1240000 })).rewarded, false);
    assert.equal((await recordGameResult({ ...game, id: 'settings-third', finishedAt: 1300000 })).xpReward, 280);
    assert.equal((await getUserLevel('101')).xp, 480);
    const approval = { matchId: 'settings-legacy-one', confirmedBy: '999', guildId: 'guild', now: 2000000 };
    await recordWinWithRewards('201', 'Legacy', approval);
    await assert.rejects(recordWinWithRewards('201', 'Legacy', { ...approval, matchId: 'settings-legacy-two', now: 2240000 }), /5 minutes/);
    let text;
    await level.execute({ user: { id: '101', username: 'Winner', displayAvatarURL: () => 'https://example.com/avatar.png' },
      options: { getUser: () => null }, reply: async payload => { text = JSON.stringify(payload.embeds[0].toJSON()); } });
    for (const expected of ['45 XP', '10 seconds', '200 XP', '80 XP', '5 minutes']) assert.ok(text.includes(expected), text);
    await Promise.all([flushLevelingData(), flushColonistData()]);
    console.log('configured rewards passed');
  `;
  try {
    const { stdout } = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', script], {
      env: { ...process.env, DATA_DIR: dir, MESSAGE_XP: '45', MESSAGE_XP_COOLDOWN_SECONDS: '10',
        COLONIST_WIN_XP: '200', COLONIST_STREAK_BONUS_XP: '80', COLONIST_REWARD_COOLDOWN_MINUTES: '5' }, timeout: 10000,
    });
    assert.match(stdout, /configured rewards passed/);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
