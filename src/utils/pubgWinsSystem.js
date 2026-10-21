import { createJsonStore, dataFile } from './jsonStore.js';

const store = createJsonStore(dataFile('pubgWins.json'), { saveDelayMs: 5 * 60 * 1000 });
export const initializePubgWinsData = store.initialize;
export const flushPubgWinsData = store.flush;

export const updatePlayerWins = (username, platform, region, wins, totalMatches, winRate) =>
  store.update((players) => {
    const playerId = `${username.toLowerCase()}_${platform}_${region}`;
    players[playerId] = {
      username, platform, region, wins, totalMatches, winRate,
      lastUpdated: new Date().toISOString(),
    };
    return players[playerId];
  });

export const getPlayerWins = async (username, platform, region) => {
  const players = await store.read();
  return players[`${username.toLowerCase()}_${platform}_${region}`] || null;
};

export const getTopPlayers = async (limit = 10) =>
  Object.values(await store.read()).sort((a, b) => b.wins - a.wins).slice(0, limit);

export const getAllPlayers = async () => Object.values(await store.read());
