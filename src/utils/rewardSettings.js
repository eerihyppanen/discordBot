const integer = (env, name, fallback, min, max) => {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const value = /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`Invalid ${name}: use a whole number from ${min} to ${max}.`);
  }
  return value;
};

export const readRewardSettings = (env = process.env) => Object.freeze({
  messageXP: integer(env, 'MESSAGE_XP', 30, 0, 10000),
  messageCooldownMs: integer(env, 'MESSAGE_XP_COOLDOWN_SECONDS', 60, 1, 86400) * 1000,
  colonistWinXP: integer(env, 'COLONIST_WIN_XP', 100, 0, 1000000),
  colonistStreakBonusXP: integer(env, 'COLONIST_STREAK_BONUS_XP', 50, 0, 1000000),
  colonistRewardCooldownMs: integer(env, 'COLONIST_REWARD_COOLDOWN_MINUTES', 30, 1, 10080) * 60000,
});

export const rewardSettings = readRewardSettings();
export const formatRewardCooldown = ms => {
  for (const [unit, size] of [['day', 86400000], ['hour', 3600000], ['minute', 60000], ['second', 1000]]) {
    if (ms % size === 0) return `${ms / size} ${unit}${ms / size === 1 ? '' : 's'}`;
  }
  return `${ms} milliseconds`;
};
