import fs from 'fs/promises';
import path from 'path';

const DATA_FILE = path.join(process.cwd(), 'data', 'colonistWins.json');
const SAVE_INTERVAL = 5 * 60 * 1000; // 5 minutes in milliseconds

// Rewards configuration
export const REWARDS = {
  WIN_XP: 50,           // XP per win
  WIN_COINS: 100,       // Coins per win
  STREAK_BONUS_XP: 25,  // Extra XP per streak multiplier
  STREAK_BONUS_COINS: 50 // Extra coins per streak multiplier
};

// In-memory cache to reduce SD card writes
let colonistDataCache = {};
let saveScheduled = false;

// Load colonist data from file (once at startup)
const loadColonistData = async () => {
  try {
    console.log(`📂 Loading Colonist data from: ${DATA_FILE}`);
    const data = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(data);
    console.log(`✅ Loaded Colonist data for ${Object.keys(parsed).length} players`);
    colonistDataCache = parsed;
    return parsed;
  } catch (error) {
    console.log(`⚠️ No existing Colonist data found, creating new file`);
    colonistDataCache = {};
    return {};
  }
};

// Save colonist data to file (batched every 5 minutes to reduce SD card wear)
const saveColonistDataToDisk = async (data) => {
  try {
    console.log(`💾 Saving Colonist data to: ${DATA_FILE}`);
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
    console.log(`✅ Saved Colonist data for ${Object.keys(data).length} players`);
  } catch (error) {
    console.error('❌ Error saving Colonist data:', error);
  }
};

// Schedule a save if one isn't already scheduled
const scheduleSave = () => {
  if (!saveScheduled) {
    saveScheduled = true;
    setTimeout(() => {
      saveColonistDataToDisk(colonistDataCache);
      saveScheduled = false;
    }, SAVE_INTERVAL);
  }
};

// Initialize data on startup
export const initializeColonistData = async () => {
  await loadColonistData();
  
  // Save immediately on shutdown
  process.on('SIGTERM', async () => {
    console.log('\n📍 Saving Colonist data before shutdown...');
    await saveColonistDataToDisk(colonistDataCache);
  });
};

// Add a win for a player
export const addWin = async (userId, username) => {
  if (!colonistDataCache[userId]) {
    colonistDataCache[userId] = {
      username,
      wins: 0,
      currentStreak: 0,
      longestStreak: 0,
      totalGames: 0,
      lastWinDate: null
    };
  }
  
  const player = colonistDataCache[userId];
  
  // Update stats
  player.wins += 1;
  player.totalGames += 1;
  player.currentStreak += 1;
  
  // Update longest streak if needed
  if (player.currentStreak > player.longestStreak) {
    player.longestStreak = player.currentStreak;
  }
  
  player.lastWinDate = new Date().toISOString();
  
  // Calculate rewards
  const streakMultiplier = Math.floor(player.currentStreak / 3); // Bonus every 3 wins
  const xpReward = REWARDS.WIN_XP + (streakMultiplier * REWARDS.STREAK_BONUS_XP);
  const coinReward = REWARDS.WIN_COINS + (streakMultiplier * REWARDS.STREAK_BONUS_COINS);
  
  // Schedule disk save (batched)
  scheduleSave();
  
  return {
    ...player,
    xpReward,
    coinReward,
    streakMultiplier
  };
};

// Add a loss for a player (breaks streak)
export const addLoss = async (userId, username) => {
  if (!colonistDataCache[userId]) {
    colonistDataCache[userId] = {
      username,
      wins: 0,
      currentStreak: 0,
      longestStreak: 0,
      totalGames: 0,
      lastWinDate: null
    };
  }
  
  const player = colonistDataCache[userId];
  
  // Update stats
  player.totalGames += 1;
  player.currentStreak = 0; // Reset streak on loss
  
  // Schedule disk save (batched)
  scheduleSave();
  
  return {
    ...player
  };
};

// Get player stats
export const getPlayerStats = async (userId) => {
  const player = colonistDataCache[userId];
  
  if (!player) {
    return null;
  }
  
  const winRate = player.totalGames > 0 
    ? ((player.wins / player.totalGames) * 100).toFixed(1) 
    : 0;
  
  return {
    ...player,
    winRate
  };
};

// Get top players by wins
export const getTopPlayers = async (limit = 10) => {
  const players = Object.entries(colonistDataCache).map(([userId, data]) => ({
    userId,
    ...data,
    winRate: data.totalGames > 0 
      ? ((data.wins / data.totalGames) * 100).toFixed(1) 
      : 0
  }));
  
  // Sort by wins (descending)
  players.sort((a, b) => b.wins - a.wins);
  
  return players.slice(0, limit);
};

// Get top players by current streak
export const getTopStreaks = async (limit = 10) => {
  const players = Object.entries(colonistDataCache).map(([userId, data]) => ({
    userId,
    ...data
  }));
  
  // Sort by current streak (descending)
  players.sort((a, b) => b.currentStreak - a.currentStreak);
  
  return players.slice(0, limit).filter(p => p.currentStreak > 0);
};
