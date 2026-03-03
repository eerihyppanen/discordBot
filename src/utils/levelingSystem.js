import fs from 'fs/promises';
import path from 'path';

const DATA_FILE = path.join(process.cwd(), 'data', 'userLevels.json');
const SAVE_INTERVAL = 5 * 60 * 1000; // 5 minutes in milliseconds

// In-memory cache to reduce SD card writes
let userDataCache = {};
let lastSaveTime = 0;
let saveScheduled = false;

// XP required for each level (exponential growth)
const getXPForLevel = (level) => level * level * 100;

// Load user data from file (once at startup)
const loadUserData = async () => {
  try {
    console.log(`📂 Loading user data from: ${DATA_FILE}`);
    console.log(`📁 Working directory: ${process.cwd()}`);
    console.log(`🗂️ Data directory exists: ${await fs.access(path.dirname(DATA_FILE)).then(() => true).catch(() => false)}`);
    const data = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(data);
    console.log(`✅ Loaded data for ${Object.keys(parsed).length} users`);
    userDataCache = parsed;
    return parsed;
  } catch (error) {
    console.log(`⚠️ No existing user data found, creating new file: ${error.message}`);
    console.log(`📁 Working directory: ${process.cwd()}`);
    userDataCache = {};
    return {};
  }
};

// Save user data to file (batched every 5 minutes to reduce SD card wear)
const saveUserDataToDisk = async (data) => {
  try {
    console.log(`💾 Saving user data to: ${DATA_FILE}`);
    console.log(`📁 Working directory: ${process.cwd()}`);
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    console.log(`📁 Created directory: ${path.dirname(DATA_FILE)}`);
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
    console.log(`✅ Saved data for ${Object.keys(data).length} users`);
    lastSaveTime = Date.now();
    
    // Verify file was written
    const fileExists = await fs.access(DATA_FILE).then(() => true).catch(() => false);
    console.log(`🔍 File verification: ${fileExists ? 'EXISTS' : 'NOT FOUND'}`);
  } catch (error) {
    console.error('❌ Error saving user data:', error);
  }
};

// Schedule a save if one isn't already scheduled
const scheduleSave = () => {
  if (!saveScheduled) {
    saveScheduled = true;
    setTimeout(() => {
      saveUserDataToDisk(userDataCache);
      saveScheduled = false;
    }, SAVE_INTERVAL);
  }
};

// Initialize data on startup
export const initializeData = async () => {
  await loadUserData();
  
  // Save immediately on shutdown
  process.on('SIGINT', async () => {
    console.log('\n📍 Saving data before shutdown...');
    await saveUserDataToDisk(userDataCache);
    process.exit(0);
  });
};

// Add XP to user and check for level up (updates memory immediately, saves to disk every 5 min)
export const addXP = async (userId, xpGained = 15) => {
  if (!userDataCache[userId]) {
    userDataCache[userId] = { xp: 0, level: 1 };
  }
  
  userDataCache[userId].xp += xpGained;
  const currentLevel = userDataCache[userId].level;
  const xpForNextLevel = getXPForLevel(currentLevel + 1);
  
  let leveledUp = false;
  
  // Check if user leveled up
  if (userDataCache[userId].xp >= xpForNextLevel) {
    userDataCache[userId].level += 1;
    leveledUp = true;
  }
  
  // Schedule disk save (batched)
  scheduleSave();
  
  return {
    ...userDataCache[userId],
    leveledUp,
    xpForNextLevel: getXPForLevel(userDataCache[userId].level + 1)
  };
};

// Get user level data
export const getUserLevel = async (userId) => {
  if (!userDataCache[userId]) {
    userDataCache[userId] = { xp: 0, level: 1 };
    scheduleSave();
  }
  
  return {
    ...userDataCache[userId],
    xpForNextLevel: getXPForLevel(userDataCache[userId].level + 1)
  };
};

// Level-based role configuration
export const LEVEL_ROLES = {
  1: "Jumping-Noob",
  5: "Silver Stroker",
  10: "Platinum Puller", 
  15: "Veteran Gooner",
  20: "Emerald Edger",
  25: "The Master Baiter"
};

// Get role name for level
export const getRoleForLevel = (level) => {
  const levelKeys = Object.keys(LEVEL_ROLES).map(Number).sort((a, b) => b - a);
  
  for (const requiredLevel of levelKeys) {
    if (level >= requiredLevel) {
      return LEVEL_ROLES[requiredLevel];
    }
  }
  
  return LEVEL_ROLES[1]; // Default to lowest role
};