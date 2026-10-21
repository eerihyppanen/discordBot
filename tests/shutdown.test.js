import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fork } from 'node:child_process';
import { once } from 'node:events';

for (const signal of ['SIGINT', 'SIGTERM']) {
  test(signal + ' flushes all real stores before the child exits', { timeout: 10000 }, async (t) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'discord-shutdown-'));
    const child = fork(new URL('./fixtures/shutdown.mjs', import.meta.url), {
      env: { ...process.env, DATA_DIR: dir }, silent: true,
    });
    let output = '';
    child.stderr.on('data', (data) => { output += data; });
    child.stdout.resume();
    t.after(async () => {
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, 'exit');
        child.kill('SIGKILL');
        await exited;
      }
      await fs.rm(dir, { recursive: true, force: true });
    });
    const exited = once(child, 'exit');
    await Promise.race([
      once(child, 'message'),
      exited.then(() => { throw new Error('Child exited before readiness: ' + output); }),
    ]);
    child.kill(signal);
    const [code, terminatedBy] = await exited;
    assert.equal(code, 0, output);
    assert.equal(terminatedBy, null);
    const read = async (name) => JSON.parse(await fs.readFile(path.join(dir, name), 'utf8'));
    assert.equal((await read('userLevels.json')).user.xp, 75);
    assert.equal((await read('pubgWins.json'))['player_steam_pc-eu'].wins, 2);
    assert.equal((await read('colonistWins.json')).user.wins, 1);
    assert.equal((await read('economy.json')).user.coins, 125);
    assert.equal(Object.values(await read('reminders.json'))[0].message, 'pending');
  });
}
