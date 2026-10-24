export class FaceitError extends Error {
  constructor(code) { super(`FACEIT request failed: ${code}`); this.code = code; }
}

export const getFaceitStats = async (username, {
  apiKey = process.env.FACEIT_API_KEY, fetchImpl = fetch, timeoutMs = 20_000,
} = {}) => {
  const request = async (path, notFoundCode) => {
    let response;
    let data;
    try {
      response = await fetchImpl(`https://open.faceit.com/data/v4/${path}`, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      // Check status before JSON: proxy errors need not have a JSON body.
      if (!response.ok) {
        if (response.status === 404) throw new FaceitError(notFoundCode);
        if ([401, 403].includes(response.status)) throw new FaceitError('unauthorized');
        if (response.status === 429) throw new FaceitError('rate_limit');
        throw new FaceitError('unavailable');
      }
      data = await response.json();
    } catch (error) {
      if (error instanceof FaceitError) throw error;
      if (['TimeoutError', 'AbortError'].includes(error.name)) throw new FaceitError('timeout');
      if (error instanceof SyntaxError) throw new FaceitError('invalid_response');
      throw new FaceitError('unavailable');
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new FaceitError('invalid_response');
    return data;
  };

  const player = await request(`players?${new URLSearchParams({ nickname: username })}`, 'not_found');
  if (typeof player.player_id !== 'string' || !player.player_id || typeof player.nickname !== 'string' || !player.games) {
    throw new FaceitError('invalid_response');
  }
  const game = player.games.cs2 ? 'cs2' : player.games.csgo ? 'csgo' : null;
  if (!game) throw new FaceitError('no_game');
  let lifetime;
  try {
    const stats = await request(`players/${encodeURIComponent(player.player_id)}/stats/${game}`, 'no_stats');
    if (!stats.lifetime || typeof stats.lifetime !== 'object' || Array.isArray(stats.lifetime)) throw new FaceitError('invalid_response');
    lifetime = stats.lifetime;
  } catch (error) {
    if (error.code !== 'no_stats') throw error;
    lifetime = {}; // New players may have a game profile before their first match.
  }
  return { player, game, profile: player.games[game], lifetime };
};

export const faceitErrorMessage = error => ({
  not_found: '❌ Player not found on FACEIT.',
  unauthorized: '❌ FACEIT rejected the API key. Please contact the bot administrator.',
  rate_limit: '⏳ FACEIT is rate-limiting requests. Please try again shortly.',
  timeout: '⏰ FACEIT took too long to respond. Please try again.',
  no_game: '❌ No CS2/CSGO profile found for this player.',
  invalid_response: '❌ FACEIT returned an invalid response. Please try again later.',
}[error.code] || '❌ FACEIT is unavailable. Please try again later.');
