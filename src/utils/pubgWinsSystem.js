import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createJsonStore, dataFile } from './jsonStore.js';

const playerKey = (username, platform) => `${username.trim().toLowerCase()}_${platform}`;
const timestamp = player => Date.parse(player.lastUpdated) || 0;

export const createPubgWinsSystem = (file) => {
  const store = createJsonStore(file, { saveDelayMs: 5 * 60 * 1000 });
  let initialization;
  const initialize = () => initialization ??= (async () => {
    await store.initialize();
    const original = await store.read();
    const normalized = {};
    let changed = false;
    // Equal-timestamp conflicts are deterministic, preferring the canonical key.
    for (const [oldKey, player] of Object.entries(original).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
      if (!player || typeof player.username !== 'string' || !player.username.trim() ||
          !['steam', 'xbox', 'psn'].includes(player.platform)) {
        throw new Error(`Invalid PUBG player entry: ${oldKey}. Original data was preserved.`);
      }
      const key = playerKey(player.username, player.platform);
      const candidate = { ...player, username: player.username.trim(), region: player.platform };
      changed ||= oldKey !== key || player.region !== player.platform || player.username !== candidate.username;
      const existing = normalized[key];
      // These are overlapping snapshots; summing wins would double count matches.
      if (!existing || timestamp(candidate) > timestamp(existing) ||
          (timestamp(candidate) === timestamp(existing) && oldKey === key)) normalized[key] = candidate;
    }
    if (changed) {
      const backup = `${file}.before-player-keys-${randomUUID()}.bak`;
      await fs.copyFile(file, backup, constants.COPYFILE_EXCL);
      await store.update(players => {
        for (const key of Object.keys(players)) delete players[key];
        Object.assign(players, normalized);
      });
      await store.flush();
      console.info('Migrated PUBG player keys; original data backed up to', backup);
    }
  })();
  const read = async () => { await initialize(); return store.read(); };
  return {
    initialize,
    flush: store.flush,
    updatePlayerWins: async (username, platform, _region, wins, totalMatches, winRate) => {
      if (typeof username !== 'string' || !username.trim() || username.trim().length > 64 ||
          !['steam', 'xbox', 'psn'].includes(platform) || !Number.isSafeInteger(wins) || wins < 0 ||
          !Number.isSafeInteger(totalMatches) || totalMatches < 1 || wins > totalMatches ||
          !Number.isFinite(winRate) || winRate < 0 || winRate > 100) throw new Error('Invalid PUBG statistics');
      await initialize();
      return store.update(players => {
        const key = playerKey(username, platform);
        players[key] = {
          username: username.trim(), platform, region: platform, wins, totalMatches, winRate,
          lastUpdated: new Date().toISOString(),
        };
        return players[key];
      });
    },
    getPlayerWins: async (username, platform) => (await read())[playerKey(username, platform)] || null,
    getTopPlayers: async (limit = 10) => Object.values(await read()).sort((a, b) => b.wins - a.wins).slice(0, limit),
    getAllPlayers: async () => Object.values(await read()),
  };
};

const system = createPubgWinsSystem(dataFile('pubgWins.json'));
export const initializePubgWinsData = system.initialize;
export const flushPubgWinsData = system.flush;
export const { updatePlayerWins, getPlayerWins, getTopPlayers, getAllPlayers } = system;
