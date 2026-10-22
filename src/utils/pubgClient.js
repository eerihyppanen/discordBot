export const PUBG_SHARD = 'steam';

export const pubgHeaders = () => ({
  Authorization: `Bearer ${process.env.PUBG_API_KEY}`,
  Accept: 'application/vnd.api+json',
});

export const fetchPCPlayer = async (username) => {
  const response = await fetch(
    `https://api.pubg.com/shards/${PUBG_SHARD}/players?filter[playerNames]=${encodeURIComponent(username)}`,
    { headers: pubgHeaders(), signal: AbortSignal.timeout(20000) },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`PUBG player lookup failed: HTTP ${response.status}`);
  const json = await response.json();
  return json.data?.[0] ?? null;
};
