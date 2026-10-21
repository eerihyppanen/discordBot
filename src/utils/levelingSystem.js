import { createJsonStore, dataFile } from './jsonStore.js';

const store = createJsonStore(dataFile('userLevels.json'), { saveDelayMs: 5 * 60 * 1000 });
const getXPForLevel = (level) => level * level * 100;

export const initializeData = store.initialize;
export const flushLevelingData = store.flush;

export const addXP = (userId, xpGained = 15) => store.update((users) => {
  users[userId] ??= { xp: 0, level: 1 };
  const user = users[userId];
  user.xp += xpGained;
  const leveledUp = user.xp >= getXPForLevel(user.level + 1);
  if (leveledUp) user.level += 1;
  return { ...user, leveledUp, xpForNextLevel: getXPForLevel(user.level + 1) };
});

export const getUserLevel = (userId) => store.update((users) => {
  users[userId] ??= { xp: 0, level: 1 };
  return { ...users[userId], xpForNextLevel: getXPForLevel(users[userId].level + 1) };
});

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