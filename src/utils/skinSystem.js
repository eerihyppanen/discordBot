import { createJsonStore, dataFile } from './jsonStore.js';

export const emptyCollection = () => ({ totalLegendary: 0, skins: [], lastUnbox: 0 });
export const MAX_SKIN_NAME_LENGTH = 100;

export const validateSkinName = name => {
  if (name == null) return null;
  if (typeof name !== 'string' || !name.trim() || name.trim().length > MAX_SKIN_NAME_LENGTH) {
    throw new RangeError(`Skin names must contain 1–${MAX_SKIN_NAME_LENGTH} characters.`);
  }
  return name.trim();
};

export const createSkinSystem = (store) => ({
  initialize: store.initialize,
  flush: store.flush,
  read: store.read,
  add: async (userId, name) => {
    const validated = validateSkinName(name);
    return store.update((collections) => {
      const userData = collections[userId] ??= emptyCollection();
      const skinName = validated || `Legendary Skin #${userData.totalLegendary + 1}`;
      const unboxedAt = Date.now();
      userData.totalLegendary += 1;
      userData.skins.push({ name: skinName, unboxedAt });
      userData.lastUnbox = unboxedAt;
      return { skinName, userData };
    });
  },
});

export const skins = createSkinSystem(createJsonStore(dataFile('pubgSkins.json')));
