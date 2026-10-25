import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';

for (const existing of [false, true]) {
  test(`devcontainer setup uses its own checkout and ${existing ? 'preserves existing' : 'creates missing'} local settings`, async t => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'discord-devcontainer-'));
    t.after(() => fs.rm(dir, { recursive: true, force: true }));
    const checkout = path.join(dir, 'different-repo-name');
    const scripts = path.join(checkout, '.devcontainer');
    const bin = path.join(dir, 'bin');
    await fs.mkdir(scripts, { recursive: true });
    await fs.mkdir(bin);
    await fs.copyFile(new URL('../.devcontainer/on-create.sh', import.meta.url), path.join(scripts, 'on-create.sh'));
    await fs.writeFile(path.join(checkout, '.env-sample'), 'SETTING=sample\n');
    if (existing) await fs.writeFile(path.join(checkout, '.env'), 'SETTING=existing\n');
    // Substitute only the networked package installer and observe its working directory.
    await fs.writeFile(path.join(bin, 'npm'), '#!/bin/sh\npwd > "$SETUP_OBSERVATION"\n', { mode: 0o755 });
    const observation = path.join(dir, 'observed-cwd');
    await promisify(execFile)('bash', [path.join(scripts, 'on-create.sh')], {
      cwd: dir, env: { ...process.env, PATH: bin + ':' + process.env.PATH, SETUP_OBSERVATION: observation },
    });
    assert.equal((await fs.readFile(observation, 'utf8')).trim(), checkout);
    assert.equal(await fs.readFile(path.join(checkout, '.env'), 'utf8'), existing ? 'SETTING=existing\n' : 'SETTING=sample\n');
  });
}
