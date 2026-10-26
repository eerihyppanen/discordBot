export const PUBG_SHARD = 'steam';

export const pubgHeaders = () => ({
  Authorization: `Bearer ${process.env.PUBG_API_KEY}`,
  Accept: 'application/vnd.api+json',
});

export const createPubgClient = ({
  fetchImpl = (...args) => fetch(...args), now = () => Date.now(),
  playerTtlMs = 120_000, matchTtlMs = 900_000, maxEntries = 500, concurrency = 3,
} = {}) => {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || !Number.isSafeInteger(maxEntries) || maxEntries < 1) {
    throw new Error('Invalid PUBG client limits');
  }
  const cache = new Map();
  const pending = new Map();
  const waiting = [];
  let active = 0;
  const request = async path => {
    if (active < concurrency) active++;
    else await new Promise(resolve => waiting.push(resolve));
    try {
      const response = await fetchImpl(`https://api.pubg.com/shards/${PUBG_SHARD}/${path}`, {
        headers: pubgHeaders(), signal: AbortSignal.timeout(20_000),
      });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`PUBG request failed: HTTP ${response.status}`);
      return await response.json();
    } finally {
      const next = waiting.shift();
      if (next) next(); // Transfer this slot directly to the next request.
      else active--;
    }
  };
  const cached = (key, ttl, load) => {
    const entry = cache.get(key);
    if (entry && entry.expiresAt > now()) {
      cache.delete(key);
      cache.set(key, entry);
      return Promise.resolve(entry.value);
    }
    cache.delete(key);
    if (pending.has(key)) return pending.get(key);
    const result = Promise.resolve().then(load).then(value => {
      if (value !== null) {
        cache.set(key, { value, expiresAt: now() + ttl });
        while (cache.size > maxEntries) cache.delete(cache.keys().next().value);
      }
      return value;
    });
    pending.set(key, result);
    const cleanup = () => pending.delete(key);
    void result.then(cleanup, cleanup);
    return result;
  };
  return {
    getPlayer: username => {
      if (typeof username !== 'string' || !username.trim() || username.trim().length > 64) return Promise.reject(new Error('Invalid PUBG username'));
      const name = username.trim();
      return cached(`player:${name.toLowerCase()}`, playerTtlMs, async () => {
        const json = await request(`players?filter[playerNames]=${encodeURIComponent(name)}`);
        if (json === null) return null;
        if (!Array.isArray(json.data)) throw new Error('Invalid PUBG player response');
        const player = json.data[0] ?? null;
        if (player && (typeof player.id !== 'string' || !player.id || typeof player.attributes?.name !== 'string' || !player.attributes.name)) {
          throw new Error('Invalid PUBG player response');
        }
        return player;
      });
    },
    getMatchStats: (id, player) => cached(`match:${id}:${player.id}`, matchTtlMs, async () => {
      const data = await request(`matches/${encodeURIComponent(id)}`);
      if (data === null) return null;
      if (!Array.isArray(data.included)) throw new Error('Invalid PUBG match response');
      const stats = data.included.find(item => item.type === 'participant' && (
        item.attributes?.stats?.playerId === player.id ||
        item.attributes?.stats?.name?.toLowerCase() === player.attributes.name.toLowerCase()
      ))?.attributes?.stats;
      if (!stats) return null;
      if (!Number.isSafeInteger(stats.winPlace) || stats.winPlace < 1 ||
          !Number.isSafeInteger(stats.kills) || stats.kills < 0 || !Number.isFinite(stats.damageDealt) || stats.damageDealt < 0) {
        throw new Error('Invalid PUBG participant statistics');
      }
      return stats;
    }),
  };
};

export const pubgClient = createPubgClient();
