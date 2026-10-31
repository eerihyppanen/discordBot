import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fork, execFile } from 'node:child_process';
import { once } from 'node:events';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

for (const mode of ['exception', 'rejection']) {
  test(`runtime ${mode} saves pending XP and exits for a supervisor restart`, { timeout: 15000 }, async () => {
    const dir = await fs.mkdtemp('/tmp/bot-fatal-');
    const child = fork(fileURLToPath(new URL('./fixtures/runtime-fatal.mjs', import.meta.url)), [], {
      env: { ...process.env, DATA_DIR: dir, TOKEN: 'offline-test-token' }, silent: true,
    });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    const closed = once(child, 'exit');
    let timer;
    try {
      const [ready] = await Promise.race([
        once(child, 'message'), closed.then(() => { throw new Error('Exited before ready: ' + output); }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Readiness timeout: ' + output)), 8000); }),
      ]);
      clearTimeout(timer);
      child.send(mode);
      const [code, signal] = await Promise.race([
        closed,
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Fatal error did not stop the bot: ' + output)), 2500); }),
      ]);
      assert.equal(code, 1, output);
      assert.equal(signal, null);
      assert.equal(ready.legacyReadyListeners, 0);
      assert.equal(JSON.parse(await fs.readFile(`${dir}/userLevels.json`, 'utf8'))['fatal-user'].xp, 75);
    } finally {
      clearTimeout(timer);
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      await closed;
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
}

test('a stalled shutdown keeps its deadline alive and exits with failure', async () => {
  const module = new URL('../src/utils/lifecycle.js', import.meta.url).href;
  const script = `import { createLifecycle } from '${module}'; void createLifecycle({ client: { destroy: async () => {} }, flushers: [() => new Promise(() => {})], timeoutMs: 30 }).shutdown('fatal', { fatal: true });`;
  await assert.rejects(promisify(execFile)(process.execPath, ['--input-type=module', '-e', script], { timeout: 3000 }), error => error.code === 1);
});
