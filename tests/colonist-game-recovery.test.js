import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
const run = promisify(execFile);
const fixture = fileURLToPath(new URL('./fixtures/colonist-game-recovery.mjs', import.meta.url));
for (const boundary of ['reservation', 'coins', 'xp', 'stats']) {
  test(`a crash after ${boundary} recovers one winner, all losses and rewards exactly once`, async () => {
    const dir = await fs.mkdtemp('/tmp/colonist-game-crash-');
    const options = { env: { ...process.env, DATA_DIR: dir }, timeout: 10000 };
    try {
      await run(process.execPath, [fixture, boundary], options);
      for (let i = 0; i < 2; i++) {
        const { stdout } = await run(process.execPath, [fixture, 'recover'], options);
        assert.deepEqual(JSON.parse(stdout), { status: 'completed', winnerId: '222', winnerWins: 1, winnerGames: 1, loserWins: 0, loserGames: 1, coins: 200, xp: 50 });
      }
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });
}
