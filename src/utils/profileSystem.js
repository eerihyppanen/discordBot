import { createJsonStore, dataFile } from './jsonStore.js';

export class ProfileError extends Error {}
const limits = { pubg: 64, faceit: 50 };
const userKey = id => {
  if (typeof id !== 'string' || !/^\d{1,20}$/.test(id)) throw new ProfileError('Invalid Discord user.');
  return id;
};

export const createProfileSystem = file => {
  const store = createJsonStore(file);
  return {
    initialize: store.initialize,
    flush: store.flush,
    get: async id => (await store.read())[userKey(id)] ?? {},
    set: async (id, changes = {}) => {
      const key = userKey(id);
      if (!changes || typeof changes !== 'object' || Array.isArray(changes) || !Object.keys(changes).length) {
        throw new ProfileError('Enter at least one PUBG or FACEIT username.');
      }
      const values = {};
      for (const [game, name] of Object.entries(changes)) {
        if (!Object.hasOwn(limits, game) || typeof name !== 'string' || !name.trim() || name.trim().length > limits[game]) {
          throw new ProfileError('Use a PUBG username of 1–64 characters or a FACEIT username of 1–50 characters.');
        }
        values[game] = name.trim();
      }
      return store.update(profiles => profiles[key] = { ...profiles[key], ...values });
    },
    clear: async (id, game) => {
      const key = userKey(id);
      if (game !== 'all' && !Object.hasOwn(limits, game)) throw new ProfileError('Select PUBG, FACEIT or all games.');
      return store.update(profiles => {
        if (game === 'all') delete profiles[key];
        else if (profiles[key]) {
          delete profiles[key][game];
          if (!Object.keys(profiles[key]).length) delete profiles[key];
        }
        return profiles[key] ?? {};
      });
    },
  };
};

export const profiles = createProfileSystem(dataFile('playerProfiles.json'));
