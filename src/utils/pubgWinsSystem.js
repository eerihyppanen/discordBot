import fs from 'fs/promises';
import path from 'path';

const DATA_FILE = path.join(process.cwd(), 'data', 'pubgWins.json');
const SAVE_INTERVAL = 5 * 60 * 1000; // 5 minutes in milliseconds

// In-memory cache to reduce SD card writes
let winsDataCache = {};
let saveScheduled = false;

// Load wins data from file (once at startup)
const loadWinsData = async () => {
  try {
    console.log(`📂 Loading PUBG wins data from: ${DATA_FILE}`);
    const data = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(data);
    console.log(`✅ Loaded PUBG wins data for ${Object.keys(parsed).length} players`);
    winsDataCache = parsed;
    return parsed;
  } catch (error) {
    console.log(`⚠️ No existing PUBG wins data found, creating new file`);
    winsDataCache = {};
    return {};
  }
};

// Save wins data to file (batched every 5 minutes to reduce SD card wear)
const saveWinsDataToDisk = async (data) => {
  try {
    console.log(`💾 Saving PUBG wins data to: ${DATA_FILE}`);
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
    console.log(`✅ Saved PUBG wins data for ${Object.keys(data).length} players`);
  } catch (error) {
    console.error('❌ Error saving PUBG wins data:', error);
  }
};

// Schedule a save if one isn't already scheduled
const scheduleSave = () => {
  if (!saveScheduled) {
    saveScheduled = true;
    setTimeout(() => {
      saveWinsDataToDisk(winsDataCache);
      saveScheduled = false;
    }, SAVE_INTERVAL);
  }
};

// Initialize data on startup
export const initializePubgWinsData = async () => {
  await loadWinsData();
  
  // Save immediately on shutdown
  process.on('SIGTERM', async () => {
    console.log('\n📍 Saving PUBG wins data before shutdown...');
    await saveWinsDataToDisk(winsDataCache);
  });
};

// Update or add player wins data
export const updatePlayerWins = async (username, platform, region, wins, totalMatches, winRate) => {
  const playerId = `${username.toLowerCase()}_${platform}_${region}`;
  
  if (!winsDataCache[playerId]) {
    winsDataCache[playerId] = {
      username,
      platform,
      region,
      wins: 0,
      totalMatches: 0,
      winRate: 0,
      lastUpdated: new Date().toISOString()
    };
  }
  
  // Update stats
  winsDataCache[playerId].wins = wins;
  winsDataCache[playerId].totalMatches = totalMatches;
  winsDataCache[playerId].winRate = winRate;
  winsDataCache[playerId].lastUpdated = new Date().toISOString();
  
  // Schedule disk save (batched)
  scheduleSave();
  
  return winsDataCache[playerId];
};

// Get player wins data
export const getPlayerWins = async (username, platform, region) => {
  const playerId = `${username.toLowerCase()}_${platform}_${region}`;
  return winsDataCache[playerId] || null;
};

// Get top players by wins
export const getTopPlayers = async (limit = 10) => {
  const players = Object.values(winsDataCache);
  
  // Sort by wins (descending)
  players.sort((a, b) => b.wins - a.wins);
  
  return players.slice(0, limit);
};

// Get all tracked players
export const getAllPlayers = async () => {
  return Object.values(winsDataCache);
};
