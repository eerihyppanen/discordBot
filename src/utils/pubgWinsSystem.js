import { createJsonStore, dataFile } from './jsonStore.js';

const store = createJsonStore(dataFile('pubgWins.json'), { saveDelayMs: 5 * 60 * 1000 });
export const initializePubgWinsData = store.initialize;
export const flushPubgWinsData = store.flush;
const canonicalRegion = (platform, region) => platform === 'steam' && (region === 'steam' || region.startsWith('pc-')) ? 'steam' : region;
const playerId = (username, platform, region) => `${username.toLowerCase()}_${platform}_${canonicalRegion(platform, region)}`;

// Regional Steam records cover overlapping matches: retain the newest snapshot, never sum them.
const normalizePlayers = (players) => {
  const normalized = {};
  for (const [key, player] of Object.entries(players)) {
    if (player.platform !== 'steam' || typeof player.region !== 'string' || canonicalRegion(player.platform, player.region) !== 'steam') {
      normalized[key] = player;
      continue;
    }
    const id = playerId(player.username, player.platform, player.region);
    const previous = normalized[id];
    const timestamp = Date.parse(player.lastUpdated) || 0;
    const previousTimestamp = Date.parse(previous?.lastUpdated) || 0;
    if (!previous || timestamp > previousTimestamp || (timestamp === previousTimestamp && player.region === 'steam')) {
      normalized[id] = { ...player, region: 'steam' };
    }
  }
  return normalized;
};

export const updatePlayerWins = (username, platform, region, wins, totalMatches, winRate) =>
  store.update((players) => {
    const normalized = normalizePlayers(players);
    const id = playerId(username, platform, region);
    normalized[id] = {
      username, platform, region: canonicalRegion(platform, region), wins, totalMatches, winRate,
      lastUpdated: new Date().toISOString(),
    };
    for (const key of Object.keys(players)) delete players[key];
    Object.assign(players, normalized);
    return players[id];
  });

export const getPlayerWins = async (username, platform, region) =>
  normalizePlayers(await store.read())[playerId(username, platform, region)] || null;

export const getAllPlayers = async () => Object.values(normalizePlayers(await store.read()));
export const getTopPlayers = async (limit = 10) =>
  (await getAllPlayers()).sort((a, b) => b.wins - a.wins).slice(0, limit);
