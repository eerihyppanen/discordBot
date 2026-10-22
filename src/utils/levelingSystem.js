import { createJsonStore, dataFile } from './jsonStore.js';

const store = createJsonStore(dataFile('userLevels.json'), { saveDelayMs: 5 * 60 * 1000 });
// Preserve existing level thresholds; a new level-1 user starts at zero XP.
export const getXPForLevel = (level) => level <= 1 ? 0 : level * level * 100;

export const initializeData = store.initialize;
export const flushLevelingData = store.flush;

export const addXP = (userId, xpGained = 15, { beforeCommit } = {}) => store.update(async (users) => {
  users[userId] ??= { xp: 0, level: 1 };
  const user = users[userId];
  user.xp += xpGained;
  const leveledUp = user.xp >= getXPForLevel(user.level + 1);
  if (leveledUp) user.level += 1;
  const result = { ...user, leveledUp, xpForNextLevel: getXPForLevel(user.level + 1) };
  // A failed dependent reward discards this draft without touching concurrent XP updates.
  if (beforeCommit) await beforeCommit();
  return result;
});

export const getUserLevel = async (userId) => {
  const user = (await store.read())[userId];
  if (user) return { ...user, xpForNextLevel: getXPForLevel(user.level + 1) };

  // Initialize a new user once; viewing an existing user must not schedule a save.
  return store.update((users) => {
    users[userId] ??= { xp: 0, level: 1 };
    return { ...users[userId], xpForNextLevel: getXPForLevel(users[userId].level + 1) };
  });
};

export const getLevelLeaderboard = async (limit = 10) => Object.entries(await store.read())
  .sort(([, a], [, b]) => b.level - a.level || b.xp - a.xp)
  .slice(0, limit);

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
