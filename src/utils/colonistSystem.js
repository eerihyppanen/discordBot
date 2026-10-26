import { createJsonStore, dataFile } from './jsonStore.js';
import { addXP, getUserLevel, flushLevelingData } from './levelingSystem.js';
import { economy } from './economySystem.js';

const store = createJsonStore(dataFile('colonistWins.json'), { saveDelayMs: 5 * 60 * 1000 });
export const flushColonistData = store.flush;
export const WIN_COOLDOWN_MS = 30 * 60 * 1000;

export class ColonistError extends Error {}

const matchKey = (id) => {
  if (typeof id !== 'string' || !/^[a-z0-9_-]{6,100}$/i.test(id.trim())) {
    throw new ColonistError('Use the match ID (6–100 letters, numbers, underscores or hyphens).');
  }
  return `match:${id.trim().toLowerCase()}`;
};

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

const unfinishedReward = async (players, userId) => (await economy.getColonistRewards())
  .find(receipt => (receipt.userId === userId || receipt.participants?.some(player => player.id === userId)) &&
    !players[receipt.userId]?.recordedMatches?.[receipt.matchId]);

const stageWin = (players, userId, username, now = Date.now()) => {
  const player = getOrCreatePlayer(players, userId, username);
  player.username = username;
  player.wins += 1;
  player.totalGames += 1;
  player.currentStreak += 1;
  player.longestStreak = Math.max(player.longestStreak, player.currentStreak);
  player.lastWinDate = new Date(now).toISOString();
  const streakMultiplier = Math.floor(player.currentStreak / 3);
  return {
    ...player,
    streakMultiplier,
    xpReward: REWARDS.WIN_XP + streakMultiplier * REWARDS.STREAK_BONUS_XP,
    coinReward: REWARDS.WIN_COINS + streakMultiplier * REWARDS.STREAK_BONUS_COINS,
  };
};

export const addWin = (userId, username) => store.update((players) => stageWin(players, userId, username));

export const recordWinWithRewards = async (userId, username, { matchId, confirmedBy, guildId, now = Date.now() } = {}) => {
  const key = matchKey(matchId);
  if (!guildId || !confirmedBy || confirmedBy === userId) {
    throw new ColonistError('A different server moderator must confirm the winner.');
  }
  const outcome = await store.update(async (players) => {
    const previous = await economy.getColonistReward(key);
    if (previous && (previous.userId !== userId || previous.guildId !== guildId)) {
      throw new ColonistError('This match has already been recorded.');
    }
    if (players[userId]?.recordedMatches?.[key]) {
      return {
        alreadyRecorded: true, result: players[userId],
        xpResult: await getUserLevel(userId), newBalance: (await economy.getBalance(userId)).coins,
      };
    }
    if (!previous && await unfinishedReward(players, userId)) {
      throw new ColonistError('Finish confirming the previous match with its original ID before recording another result.');
    }
    const lastWin = Date.parse(players[userId]?.lastRewardAt ?? players[userId]?.lastWinDate ?? '');
    if (!previous && Number.isFinite(lastWin) && now - lastWin < WIN_COOLDOWN_MS) {
      throw new ColonistError('This player can receive one confirmed win every 30 minutes.');
    }
    // The durable coin receipt is also a recovery record for the other two files.
    const result = stageWin(players, userId, username, previous?.at ?? now);
    if (previous?.stats) {
      // Preserve the confirmed totals even if earlier batched losses were not on disk.
      Object.assign(players[userId], previous.stats);
      Object.assign(result, previous.stats);
      result.streakMultiplier = Math.floor(result.currentStreak / 3);
    }
    players[userId].lastRewardAt = new Date(previous?.at ?? now).toISOString();
    result.lastRewardAt = players[userId].lastRewardAt;
    const receipt = previous || {
      matchId: key, userId, username, confirmedBy, guildId, at: now,
      xpReward: result.xpReward, coinReward: result.coinReward,
      stats: {
        wins: result.wins, totalGames: result.totalGames, currentStreak: result.currentStreak,
        longestStreak: result.longestStreak, lastWinDate: result.lastWinDate, lastRewardAt: result.lastRewardAt,
      },
    };
    result.xpReward = receipt.xpReward;
    result.coinReward = receipt.coinReward;
    let newBalance;
    const xpResult = await addXP(userId, receipt.xpReward, {
      rewardId: key,
      beforeCommit: async () => { newBalance = await economy.grantColonistReward(receipt); },
    });
    // Persist XP before marking the match complete. Retries recognize both receipts.
    await flushLevelingData();
    (players[userId].recordedMatches ??= {})[key] = true;
    return { result, xpResult, newBalance, alreadyRecorded: false };
  });
  await store.flush();
  return outcome;
};

const statsSnapshot = (player) => Object.fromEntries(
  ['username', 'wins', 'totalGames', 'currentStreak', 'longestStreak', 'lastWinDate', 'lastRewardAt']
    .filter(name => player[name] !== undefined).map(name => [name, player[name]]),
);

// The game service reserves a winner durably before calling this operation.
export const recordGameResult = async ({ id, guildId, players: participants, winnerId, finishedAt }) => {
  if (typeof id !== 'string' || !/^[a-z0-9_-]{6,100}$/i.test(id) || !guildId ||
      !Array.isArray(participants) || participants.length < 2 || participants.length > 8 ||
      participants.some(player => !/^\d{1,20}$/.test(player.id) || typeof player.username !== 'string' || !player.username.trim()) ||
      new Set(participants.map(player => player.id)).size !== participants.length ||
      !participants.some(player => player.id === winnerId) || !Number.isSafeInteger(finishedAt) || finishedAt < 0) {
    throw new ColonistError('Invalid game result.');
  }
  const key = `game:${id}`;
  const outcome = await store.update(async (players) => {
    const previous = await economy.getColonistReward(key);
    if (previous && (previous.source !== 'discord-game' || previous.userId !== winnerId || previous.guildId !== guildId ||
        previous.participants.map(player => player.id).sort().join(',') !== participants.map(player => player.id).sort().join(','))) {
      throw new ColonistError('This game already has a different recorded result.');
    }
    const alreadyRecorded = Boolean(players[winnerId]?.recordedMatches?.[key]);
    let receipt = previous;
    if (!receipt) {
      for (const participant of participants) {
        if (await unfinishedReward(players, participant.id)) throw new ColonistError('Finish the previous pending game before recording another result.');
      }
      const winner = participants.find(player => player.id === winnerId);
      const oldStats = getOrCreatePlayer(players, winnerId, winner.username);
      const lastRewardAt = oldStats.lastRewardAt ?? oldStats.lastWinDate;
      const lastRewardTime = Date.parse(lastRewardAt || '');
      const rewarded = !Number.isFinite(lastRewardTime) || finishedAt - lastRewardTime >= WIN_COOLDOWN_MS;
      const result = stageWin(players, winnerId, winner.username, finishedAt);
      players[winnerId].lastRewardAt = rewarded ? new Date(finishedAt).toISOString() : lastRewardAt;
      for (const participant of participants) {
        if (participant.id === winnerId) continue;
        const loser = getOrCreatePlayer(players, participant.id, participant.username);
        loser.username = participant.username;
        loser.totalGames += 1;
        loser.currentStreak = 0;
      }
      receipt = {
        source: 'discord-game', matchId: key, gameId: id, guildId, userId: winnerId,
        username: winner.username, confirmedBy: winnerId, at: finishedAt,
        participants, rewarded, xpReward: rewarded ? result.xpReward : 0,
        coinReward: rewarded ? result.coinReward : 0,
        statsByUser: Object.fromEntries(participants.map(player => [player.id, statsSnapshot(players[player.id])])),
      };
    }
    let newBalance;
    if (!alreadyRecorded) {
      // Restore all snapshots after a crash, including losses that were only batched before the game.
      for (const participant of receipt.participants) {
        Object.assign(getOrCreatePlayer(players, participant.id, participant.username), receipt.statsByUser[participant.id]);
      }
      await addXP(winnerId, receipt.xpReward, {
        rewardId: key,
        beforeCommit: async () => { newBalance = await economy.grantColonistReward(receipt); },
      });
      await flushLevelingData();
      for (const participant of receipt.participants) (players[participant.id].recordedMatches ??= {})[key] = true;
    } else {
      newBalance = (await economy.getBalance(winnerId)).coins;
    }
    return { winnerId, rewarded: receipt.rewarded, xpReward: receipt.xpReward, coinReward: receipt.coinReward, newBalance, alreadyRecorded };
  });
  await store.flush();
  return outcome;
};

export const initializeColonistData = async () => {
  await store.initialize();
  const players = await store.read();
  const receipts = (await economy.getColonistRewards()).sort((a, b) => a.at - b.at);
  for (const receipt of receipts) {
    if (players[receipt.userId]?.recordedMatches?.[receipt.matchId]) continue;
    if (receipt.source === 'discord-game') {
      await recordGameResult({ id: receipt.gameId, guildId: receipt.guildId, players: receipt.participants, winnerId: receipt.userId, finishedAt: receipt.at });
    } else {
      await recordWinWithRewards(receipt.userId, receipt.username, {
        ...receipt, matchId: receipt.matchId.slice('match:'.length), now: receipt.at,
      });
    }
  }
};

export const addLoss = (userId, username) => store.update(async (players) => {
  if (await unfinishedReward(players, userId)) {
    throw new ColonistError('Finish confirming the previous match with its original ID before recording another result.');
  }
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
