import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const dataFile = (name) => path.resolve(process.env.DATA_DIR || 'data', name);

// One instance per file in one bot process. Updates and disk writes share a queue.
export const createJsonStore = (file, { saveDelayMs = 0, logger = console } = {}) => {
  let data;
  let queue = Promise.resolve();
  let dirty = false;
  let saveTimer;

  const enqueue = (task) => {
    const result = queue.then(task);
    queue = result.catch(() => {});
    return result;
  };

  const load = async () => {
    if (data !== undefined) return;
    try {
      data = JSON.parse(await fs.readFile(file, 'utf8'));
      if (!data || Array.isArray(data) || typeof data !== 'object') {
        data = undefined;
        throw new Error(`Invalid JSON object in ${file}`);
      }
    } catch (error) {
      // Corrupt or unreadable files must never be replaced with empty data.
      if (error.code !== 'ENOENT') {
        data = undefined;
        throw error;
      }
      data = {};
    }
  };

  const write = async (value) => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      const handle = await fs.open(temporary, 'wx', 0o600);
      try {
        await handle.writeFile(JSON.stringify(value, null, 2), 'utf8');
        await handle.sync();
      } finally {
        await handle.close();
      }
      await fs.rename(temporary, file);
    } finally {
      await fs.rm(temporary, { force: true });
    }
  };

  const scheduleSave = () => {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = undefined;
      flush().catch((error) => {
        logger.error(`Error saving ${file}:`, error);
        if (dirty) scheduleSave();
      });
    }, saveDelayMs);
    saveTimer.unref?.();
  };

  const flush = () => enqueue(async () => {
    clearTimeout(saveTimer);
    saveTimer = undefined;
    if (!dirty) return;
    await write(data);
    dirty = false;
  });

  return {
    initialize: () => enqueue(load),
    read: () => enqueue(async () => {
      await load();
      return structuredClone(data);
    }),
    update: (mutate) => enqueue(async () => {
      await load();
      const next = structuredClone(data);
      const result = await mutate(next);
      if (saveDelayMs > 0) {
        data = next;
        dirty = true;
        scheduleSave();
      } else {
        // Publish the new state only after its on-disk replacement succeeds.
        await write(next);
        data = next;
      }
      return structuredClone(result);
    }),
    flush,
  };
};
