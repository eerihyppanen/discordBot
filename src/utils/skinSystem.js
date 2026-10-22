import { createJsonStore, dataFile } from './jsonStore.js';

export const emptyCollection = () => ({ totalLegendary: 0, skins: [], lastUnbox: 0 });

export const createSkinSystem = (store) => ({
  initialize: store.initialize,
  flush: store.flush,
  read: store.read,
  add: (userId, name) => store.update((collections) => {
    const userData = collections[userId] ??= emptyCollection();
    const skinName = name || `Legendary Skin #${userData.totalLegendary + 1}`;
    const unboxedAt = Date.now();
    userData.totalLegendary += 1;
    userData.skins.push({ name: skinName, unboxedAt });
    userData.lastUnbox = unboxedAt;
    return { skinName, userData };
  }),
});

export const skins = createSkinSystem(createJsonStore(dataFile('pubgSkins.json')));
