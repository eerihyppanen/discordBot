import { createJsonStore, dataFile } from './jsonStore.js';
import { addXP } from './levelingSystem.js';
import { economy } from './economySystem.js';

const store = createJsonStore(dataFile('colonistWins.json'), { saveDelayMs: 5 * 60 * 1000 });
export const initializeColonistData = store.initialize;
export const flushColonistData = store.flush;

export const REWARDS = {
  WIN_XP: 50,           // XP per win
  WIN_COINS: 100,       // Coins per win
  STREAK_BONUS_XP: 25,  // Extra XP per streak multiplier
  STREAK_BONUS_COINS: 50 // Extra coins per streak multiplier
};

const getOrCreatePlayer = (players, userId, username) => {
  players[userId] ??= { username, wins: 0, currentStreak: 0, longestStreak: 0, totalGames: 0, lastWinDate: null };
  return players[userId];
};

const stageWin = (players, userId, username) => {
  const player = getOrCreatePlayer(players, userId, username);
  player.wins += 1;
  player.totalGames += 1;
  player.currentStreak += 1;
  player.longestStreak = Math.max(player.longestStreak, player.currentStreak);
  player.lastWinDate = new Date().toISOString();
  const streakMultiplier = Math.floor(player.currentStreak / 3);
  return {
    ...player,
    streakMultiplier,
    xpReward: REWARDS.WIN_XP + streakMultiplier * REWARDS.STREAK_BONUS_XP,
    coinReward: REWARDS.WIN_COINS + streakMultiplier * REWARDS.STREAK_BONUS_COINS,
  };
};

export const addWin = (userId, username) => store.update((players) => stageWin(players, userId, username));

export const recordWinWithRewards = (userId, username) => store.update(async (players) => {
  // Lock order: Colonist -> XP -> economy. Keep both stat drafts private until coins save.
  const result = stageWin(players, userId, username);
  let newBalance;
  const xpResult = await addXP(userId, result.xpReward, {
    beforeCommit: async () => {
      newBalance = await economy.addCoins(userId, result.coinReward);
    },
  });
  return { result, xpResult, newBalance };
});

export const addLoss = (userId, username) => store.update((players) => {
  const player = getOrCreatePlayer(players, userId, username);
  player.totalGames += 1;
  player.currentStreak = 0;
  return player;
});

const withWinRate = (player) => ({
  ...player,
  winRate: player.totalGames > 0 ? ((player.wins / player.totalGames) * 100).toFixed(1) : 0,
});

export const getPlayerStats = async (userId) => {
  const player = (await store.read())[userId];
  return player ? withWinRate(player) : null;
};

export const getTopPlayers = async (limit = 10) => Object.entries(await store.read())
  .map(([userId, player]) => ({ userId, ...withWinRate(player) }))
  .sort((a, b) => b.wins - a.wins).slice(0, limit);

export const getTopStreaks = async (limit = 10) => Object.entries(await store.read())
  .map(([userId, player]) => ({ userId, ...player }))
  .sort((a, b) => b.currentStreak - a.currentStreak)
  .slice(0, limit).filter((player) => player.currentStreak > 0);
