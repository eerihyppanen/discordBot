import { createJsonStore, dataFile } from './jsonStore.js';
import { cosmeticById, CosmeticError } from './cosmeticCatalog.js';

const cosmeticUser = id => {
  if (typeof id !== 'string' || !/^\d{1,20}$/.test(id)) throw new CosmeticError('Invalid Discord user.');
  return id;
};
const inventoryFor = user => {
  const saved = user?.cosmetics ?? {};
  const owned = saved.owned ?? [];
  const equipped = saved.equipped ?? {};
  if (!Array.isArray(owned) || !equipped || typeof equipped !== 'object' || Array.isArray(equipped)) {
    throw new CosmeticError('Invalid cosmetic inventory. Contact the bot administrator.');
  }
  return { ...saved, owned, equipped };
};

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
    getCosmetics: async userId => {
      cosmeticUser(userId);
      return inventoryFor((await store.read())[userId]);
    },
    buyCosmetic: async (userId, itemId) => {
      cosmeticUser(userId);
      const item = cosmeticById(itemId);
      return updateUser(userId, user => {
        const inventory = inventoryFor(user);
        if (inventory.owned.includes(item.id)) return { item, alreadyOwned: true, balance: user.coins };
        if (!Number.isSafeInteger(user.coins) || user.coins < 0) throw new CosmeticError('Invalid wallet balance. Contact the bot administrator.');
        if (user.coins < item.price) throw new CosmeticError(`You need ${item.price} coins to buy ${item.name}. Your wallet has ${user.coins} coins.`);
        user.coins -= item.price;
        inventory.owned.push(item.id);
        user.cosmetics = inventory;
        return { item, alreadyOwned: false, balance: user.coins };
      });
    },
    equipCosmetic: async (userId, itemId) => {
      cosmeticUser(userId);
      const item = cosmeticById(itemId);
      return updateUser(userId, user => {
        const inventory = inventoryFor(user);
        if (!inventory.owned.includes(item.id)) throw new CosmeticError('You must own this cosmetic before equipping it. Use /profile buy.');
        inventory.equipped[item.type] = item.id;
        return user.cosmetics = inventory;
      });
    },
    unequipCosmetic: async (userId, type) => {
      cosmeticUser(userId);
      if (!['title', 'badge', 'all'].includes(type)) throw new CosmeticError('Select title, badge or all cosmetics.');
      return updateUser(userId, user => {
        const inventory = inventoryFor(user);
        if (type === 'all') inventory.equipped = {};
        else delete inventory.equipped[type];
        return user.cosmetics = inventory;
      });
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
