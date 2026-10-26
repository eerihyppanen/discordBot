import { createJsonStore, dataFile } from './jsonStore.js';

const store = createJsonStore(dataFile('userLevels.json'), { saveDelayMs: 5 * 60 * 1000 });
// Preserve existing level thresholds; a new level-1 user starts at zero XP.
export const getXPForLevel = (level) => level <= 1 ? 0 : level * level * 100;
const levelForXP = xp => Math.max(1, Math.floor(Math.sqrt(xp / 100)));
const progress = user => {
  const level = levelForXP(user.xp);
  return { ...user, level, xpForNextLevel: getXPForLevel(level + 1) };
};

export const initializeData = store.initialize;
export const flushLevelingData = store.flush;

export const MESSAGE_XP_COOLDOWN_MS = 60_000;
export const MESSAGE_XP = 20;

export const addXP = (userId, xpGained = 15, { beforeCommit, rewardId, messageAt } = {}) => store.update(async (users) => {
  if (!Number.isSafeInteger(xpGained) || xpGained < 0) throw new Error('Invalid XP amount');
  users[userId] ??= { xp: 0, level: 1 };
  const user = users[userId];
  const onCooldown = messageAt !== undefined && user.lastMessageXPAt !== undefined &&
    messageAt - user.lastMessageXPAt < MESSAGE_XP_COOLDOWN_MS;
  const awarded = !onCooldown && !(rewardId && user.rewardIds?.[rewardId]);
  if (awarded) {
    user.xp += xpGained;
    if (messageAt !== undefined) user.lastMessageXPAt = messageAt;
    if (rewardId) (user.rewardIds ??= {})[rewardId] = true;
  }
  const previousLevel = user.level;
  // Derive the level from total XP, including any older under-levelled records.
  user.level = levelForXP(user.xp);
  const result = { ...user, awarded, leveledUp: user.level > previousLevel, xpForNextLevel: getXPForLevel(user.level + 1) };
  // A failed dependent reward discards this draft without touching concurrent XP updates.
  if (beforeCommit) await beforeCommit();
  return result;
});

export const addMessageXP = (userId, now = Date.now()) => addXP(userId, MESSAGE_XP, { messageAt: now });

export const getUserLevel = async (userId) => {
  const user = (await store.read())[userId];
  if (user) return progress(user);

  // Initialize a new user once; viewing an existing user must not schedule a save.
  return store.update((users) => {
    users[userId] ??= { xp: 0, level: 1 };
    return progress(users[userId]);
  });
};

export const getLevelLeaderboard = async (limit = 10) => Object.entries(await store.read())
  .map(([id, user]) => [id, progress(user)])
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
