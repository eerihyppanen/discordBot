import { createJsonStore, dataFile } from './jsonStore.js';

export const createEconomySystem = (store) => {
  const findReward = (users, matchId) => Object.values(users)
    .map(user => user.colonistRewards?.[matchId]).find(Boolean);
  const updateUser = (userId, mutate) => store.update((economy) => {
    economy[userId] ??= { coins: 100, bank: 0, lastDaily: 0 };
    return mutate(economy[userId]);
  });

  return {
    initialize: store.initialize,
    flush: store.flush,
    updateUser,
    getBalance: async (userId) => {
      const users = await store.read();
      return users[userId] || updateUser(userId, (user) => ({ ...user }));
    },
    addCoins: (userId, amount) => updateUser(userId, (user) => {
      user.coins += amount;
      return user.coins;
    }),
    getColonistReward: async (matchId) => findReward(await store.read(), matchId),
    getColonistRewards: async () => Object.values(await store.read())
      .flatMap(user => Object.values(user.colonistRewards || {})),
    grantColonistReward: (receipt) => store.update(users => {
      const previous = findReward(users, receipt.matchId);
      if (previous && previous.userId !== receipt.userId) throw new Error('This match already has a different winner.');
      const user = users[receipt.userId] ??= { coins: 100, bank: 0, lastDaily: 0 };
      if (!previous) {
        user.coins += receipt.coinReward;
        (user.colonistRewards ??= {})[receipt.matchId] = receipt;
      }
      return user.coins;
    }),
    claimDaily: (userId, { now = Date.now(), reward = Math.floor(Math.random() * 500) + 100 } = {}) =>
      updateUser(userId, (user) => {
        const timeLeft = 24 * 60 * 60 * 1000 - (now - (user.lastDaily || 0));
        if (timeLeft > 0) return { claimed: false, timeLeft };
        user.coins += reward;
        user.lastDaily = now;
        return { claimed: true, reward, balance: user.coins };
      }),
  };
};

export const economy = createEconomySystem(createJsonStore(dataFile('economy.json')));
