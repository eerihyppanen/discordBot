import fs from 'fs/promises';
import path from 'path';

const DATA_FILE = path.join(process.cwd(), 'data', 'userLevels.json');

// XP required for each level (exponential growth)
const getXPForLevel = (level) => level * level * 100;

// Load user data from file
const loadUserData = async () => {
  try {
    console.log(`📂 Loading user data from: ${DATA_FILE}`);
    const data = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(data);
    console.log(`✅ Loaded data for ${Object.keys(parsed).length} users`);
    return parsed;
  } catch (error) {
    console.log(`⚠️ No existing user data found, creating new file: ${error.message}`);
    return {};
  }
};

// Save user data to file
const saveUserData = async (data) => {
  try {
    console.log(`💾 Saving user data to: ${DATA_FILE}`);
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
    console.log(`✅ Saved data for ${Object.keys(data).length} users`);
  } catch (error) {
    console.error('❌ Error saving user data:', error);
  }
};

// Add XP to user and check for level up
export const addXP = async (userId, xpGained = 15) => {
  const userData = await loadUserData();
  
  if (!userData[userId]) {
    userData[userId] = { xp: 0, level: 1 };
  }
  
  userData[userId].xp += xpGained;
  const currentLevel = userData[userId].level;
  const xpForNextLevel = getXPForLevel(currentLevel + 1);
  
  let leveledUp = false;
  
  // Check if user leveled up
  if (userData[userId].xp >= xpForNextLevel) {
    userData[userId].level += 1;
    leveledUp = true;
  }
  
  await saveUserData(userData);
  
  return {
    ...userData[userId],
    leveledUp,
    xpForNextLevel: getXPForLevel(userData[userId].level + 1)
  };
};

// Get user level data
export const getUserLevel = async (userId) => {
  const userData = await loadUserData();
  
  if (!userData[userId]) {
    userData[userId] = { xp: 0, level: 1 };
    await saveUserData(userData);
  }
  
  return {
    ...userData[userId],
    xpForNextLevel: getXPForLevel(userData[userId].level + 1)
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