import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const fixture = fileURLToPath(new URL('./fixtures/colonist-recovery.mjs', import.meta.url));
for (const crashAfter of ['coins', 'xp']) {
  test(`startup completes an interrupted award after ${crashAfter} save without duplicate rewards`, async () => {
    const directory = await fs.mkdtemp('/tmp/colonist-recovery-');
    const options = { env: { ...process.env, DATA_DIR: directory }, timeout: 10000 };
    try {
      await run(process.execPath, [fixture, crashAfter], options);
      for (let i = 0; i < 2; i++) {
        const { stdout } = await run(process.execPath, [fixture, 'recover'], options);
        assert.deepEqual(JSON.parse(stdout), { alreadyRecorded: true, coins: 200, xp: 50, wins: 1, totalGames: 2 });
      }
    } finally { await fs.rm(directory, { recursive: true, force: true }); }
  });
}
